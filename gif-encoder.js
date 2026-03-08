// Minimal GIF89a encoder with median-cut quantization and Floyd-Steinberg dithering

function encodeGIF(frames, w, h, delayMs) {
  const delay = Math.round(delayMs / 10); // GIF delay is in centiseconds
  const buf = [];
  const write = (b) => buf.push(b);
  const writeBytes = (arr) => arr.forEach(b => buf.push(b));
  const writeStr = (s) => { for (let i = 0; i < s.length; i++) buf.push(s.charCodeAt(i)); };
  const u16le = (v) => [v & 0xff, (v >> 8) & 0xff];

  // Build adaptive palette from the first frame via median cut
  const palette = buildPalette(frames[0].data, w, h);
  const palFlat = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    palFlat[i * 3] = palette[i][0];
    palFlat[i * 3 + 1] = palette[i][1];
    palFlat[i * 3 + 2] = palette[i][2];
  }

  // Header
  writeStr('GIF89a');
  writeBytes(u16le(w));
  writeBytes(u16le(h));
  write(0xf7); // GCT flag, 8-bit color, 256 colors
  write(0);    // bg color index
  write(0);    // pixel aspect ratio

  // Global color table
  for (let i = 0; i < 256 * 3; i++) write(palFlat[i]);

  // Netscape extension for looping
  write(0x21); write(0xff); write(11);
  writeStr('NETSCAPE2.0');
  write(3); write(1); writeBytes(u16le(0)); // loop forever
  write(0);

  for (const frame of frames) {
    const indexed = quantizeFrame(frame.data, w, h, palette);

    // Graphic control extension
    write(0x21); write(0xf9); write(4);
    write(0x00); // no transparency
    writeBytes(u16le(delay));
    write(0); // transparent color index
    write(0);

    // Image descriptor
    write(0x2c);
    writeBytes(u16le(0)); // left
    writeBytes(u16le(0)); // top
    writeBytes(u16le(w));
    writeBytes(u16le(h));
    write(0x00); // no local color table

    // LZW compressed data
    const lzwMin = 8;
    const compressed = lzwEncode(indexed, lzwMin);
    write(lzwMin);
    let offset = 0;
    while (offset < compressed.length) {
      const size = Math.min(255, compressed.length - offset);
      write(size);
      for (let i = 0; i < size; i++) write(compressed[offset + i]);
      offset += size;
    }
    write(0); // block terminator
  }

  write(0x3b); // trailer
  return new Blob([new Uint8Array(buf)], { type: 'image/gif' });
}

// Median-cut: builds an adaptive 256-color palette from actual pixel data
function buildPalette(data, w, h) {
  const n = w * h;
  const maxSamples = 20000;
  const stride = Math.max(1, Math.floor(n / maxSamples));
  const pixels = [];
  for (let i = 0; i < n; i += stride) {
    pixels.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }

  // Recursively split into 256 buckets along the channel with the largest range
  let buckets = [pixels];
  while (buckets.length < 256) {
    let bestIdx = -1, bestRange = -1, bestCh = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const px of buckets[i]) {
          if (px[ch] < lo) lo = px[ch];
          if (px[ch] > hi) hi = px[ch];
        }
        if (hi - lo > bestRange) { bestRange = hi - lo; bestIdx = i; bestCh = ch; }
      }
    }
    if (bestIdx < 0 || bestRange <= 0) break;
    const bucket = buckets[bestIdx];
    bucket.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = bucket.length >> 1;
    buckets[bestIdx] = bucket.slice(0, mid);
    buckets.push(bucket.slice(mid));
  }

  const palette = buckets.map(b => {
    let r = 0, g = 0, bl = 0;
    for (const px of b) { r += px[0]; g += px[1]; bl += px[2]; }
    const len = b.length || 1;
    return [Math.round(r / len), Math.round(g / len), Math.round(bl / len)];
  });
  while (palette.length < 256) palette.push([0, 0, 0]);
  return palette;
}

// Map pixels to palette indices with Floyd-Steinberg dithering
function quantizeFrame(data, w, h, palette) {
  const n = w * h;
  const indexed = new Uint8Array(n);
  // Int16 buffer for error diffusion (values can go negative)
  const px = new Int16Array(n * 3);
  for (let i = 0; i < n; i++) {
    px[i * 3]     = data[i * 4];
    px[i * 3 + 1] = data[i * 4 + 1];
    px[i * 3 + 2] = data[i * 4 + 2];
  }

  const cache = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = Math.max(0, Math.min(255, px[i * 3]));
      const g = Math.max(0, Math.min(255, px[i * 3 + 1]));
      const b = Math.max(0, Math.min(255, px[i * 3 + 2]));

      // Nearest palette color (cached by 5-bit-truncated key)
      const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      let best;
      if (cache.has(key)) {
        best = cache.get(key);
      } else {
        let bestDist = Infinity;
        best = 0;
        for (let j = 0; j < 256; j++) {
          const dr = r - palette[j][0];
          const dg = g - palette[j][1];
          const db = b - palette[j][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestDist) { bestDist = d; best = j; }
        }
        cache.set(key, best);
      }
      indexed[i] = best;

      // Distribute quantization error to neighbors
      const er = r - palette[best][0];
      const eg = g - palette[best][1];
      const eb = b - palette[best][2];
      if (x + 1 < w) {
        const ni = i + 1;
        px[ni * 3]     += (er * 7) >> 4;
        px[ni * 3 + 1] += (eg * 7) >> 4;
        px[ni * 3 + 2] += (eb * 7) >> 4;
      }
      if (y + 1 < h) {
        if (x > 0) {
          const ni = (y + 1) * w + x - 1;
          px[ni * 3]     += (er * 3) >> 4;
          px[ni * 3 + 1] += (eg * 3) >> 4;
          px[ni * 3 + 2] += (eb * 3) >> 4;
        }
        const ni2 = (y + 1) * w + x;
        px[ni2 * 3]     += (er * 5) >> 4;
        px[ni2 * 3 + 1] += (eg * 5) >> 4;
        px[ni2 * 3 + 2] += (eb * 5) >> 4;
        if (x + 1 < w) {
          const ni3 = (y + 1) * w + x + 1;
          px[ni3 * 3]     += (er * 1) >> 4;
          px[ni3 * 3 + 1] += (eg * 1) >> 4;
          px[ni3 * 3 + 2] += (eb * 1) >> 4;
        }
      }
    }
  }
  return indexed;
}

function lzwEncode(indexed, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const output = [];
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let table = new Map();
  let bitBuf = 0;
  let bitCount = 0;

  function emit(code) {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  }

  function resetTable() {
    table = new Map();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
    for (let i = 0; i < clearCode; i++) table.set(String(i), i);
  }

  emit(clearCode);
  resetTable();

  let prefix = String(indexed[0]);
  for (let i = 1; i < indexed.length; i++) {
    const ch = String(indexed[i]);
    const key = prefix + ',' + ch;
    if (table.has(key)) {
      prefix = key;
    } else {
      emit(table.get(prefix));
      if (nextCode < 4096) {
        table.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        resetTable();
      }
      prefix = ch;
    }
  }

  emit(table.get(prefix));
  emit(eoiCode);

  if (bitCount > 0) output.push(bitBuf & 0xff);

  return output;
}
