// Single-track VP8 WebM with explicit duration and a keyframe seek index.
function encodeWebM(samples, width, height, fps) {
  function uint(value, size = Math.max(1, Math.ceil(Math.log2(value + 1) / 8))) {
    const bytes = new Uint8Array(size);
    for (let i = size - 1; i >= 0; i--) {
      bytes[i] = value % 256;
      value = Math.floor(value / 256);
    }
    return bytes;
  }

  function element(id, ...parts) {
    const body = new Blob(parts);
    let sizeLength = 1;
    while (body.size >= 2 ** (7 * sizeLength) - 1) sizeLength++;
    const size = uint(body.size, sizeLength);
    size[0] |= 1 << (8 - sizeLength);
    return new Blob([uint(id), size, body]);
  }

  const duration = new Uint8Array(8);
  new DataView(duration.buffer).setFloat64(0, samples.length * 1000 / fps);
  const header = element(0x1a45dfa3,
    element(0x4286, uint(1)),
    element(0x42f7, uint(1)),
    element(0x42f2, uint(4)),
    element(0x42f3, uint(8)),
    element(0x4282, 'webm'),
    element(0x4287, uint(2)),
    element(0x4285, uint(2))
  );
  const info = element(0x1549a966,
    element(0x2ad7b1, uint(1_000_000)), // Segment timestamps use milliseconds.
    element(0x4489, duration),
    element(0x4d80, 'Side-by-Side'),
    element(0x5741, 'Side-by-Side')
  );
  const tracks = element(0x1654ae6b,
    element(0xae,
      element(0xd7, uint(1)),
      element(0x73c5, uint(1)),
      element(0x83, uint(1)),
      element(0x9c, uint(0)),
      element(0x86, 'V_VP8'),
      element(0x23e383, uint(Math.round(1e9 / fps))),
      element(0xe0, element(0xb0, uint(width)), element(0xba, uint(height)))
    )
  );

  const clusters = [];
  let blocks = [];
  let clusterTime = 0;
  let clusterIsKey = false;
  function finishCluster() {
    if (blocks.length) {
      clusters.push({ time: clusterTime, isKey: clusterIsKey, data: element(0x1f43b675, element(0xe7, uint(clusterTime)), ...blocks) });
    }
    blocks = [];
  }
  for (const sample of samples) {
    const time = Math.round(sample.timestamp / 1000);
    if (sample.isKey || time - clusterTime > 32767) {
      finishCluster();
      clusterTime = time;
      clusterIsKey = sample.isKey;
    }
    const relativeTime = time - clusterTime;
    const blockHeader = new Uint8Array([0x81, relativeTime >> 8, relativeTime & 0xff, sample.isKey ? 0x80 : 0]);
    blocks.push(element(0xa3, blockHeader, sample.data));
  }
  finishCluster();

  function createCues(offset) {
    const points = [];
    for (const cluster of clusters) {
      if (cluster.isKey) {
        points.push(element(0xbb,
          element(0xb3, uint(cluster.time)),
          element(0xb7, element(0xf7, uint(1)), element(0xf1, uint(offset, 8)))
        ));
      }
      offset += cluster.data.size;
    }
    return element(0x1c53bb6b, ...points);
  }

  function createSeekHead(infoOffset, tracksOffset, cuesOffset) {
    return element(0x114d9b74, ...[
      [0x1549a966, infoOffset], [0x1654ae6b, tracksOffset], [0x1c53bb6b, cuesOffset],
    ].map(([id, offset]) => element(0x4dbb, element(0x53ab, uint(id)), element(0x53ac, uint(offset, 8)))));
  }

  // Fixed-width positions keep index sizes independent of their final offsets.
  const seekHeadSize = createSeekHead(0, 0, 0).size;
  const cuesOffset = seekHeadSize + info.size + tracks.size;
  const cues = createCues(cuesOffset + createCues(0).size);
  const seekHead = createSeekHead(seekHeadSize, seekHeadSize + info.size, cuesOffset);
  return new Blob([
    header,
    element(0x18538067, seekHead, info, tracks, cues, ...clusters.map(cluster => cluster.data)),
  ], { type: 'video/webm' });
}
