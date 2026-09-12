// Minimal progressive (non-fragmented) MP4 muxer for a single H.264 video track
//
// MediaRecorder can only emit *fragmented* MP4 — a moov with empty sample
// tables plus moof/mdat fragments — because it has to stream bytes out before
// it knows the final frame count. Players cope, but platform transcoders that
// read the sample tables reject the file outright (X/Twitter reports it as
// "InvalidMedia"). This writes the ordinary layout instead: ftyp, then a moov
// with fully populated sample tables, then a single mdat.

// samples: [{ data: Uint8Array, duration: int, isKey: bool }], durations in
// timescale units. description: the AVCDecoderConfigurationRecord ("avcC"
// payload) from VideoEncoder's decoderConfig.
function encodeMP4(samples, width, height, description, timescale) {
  const totalDuration = samples.reduce((sum, s) => sum + s.duration, 0);

  // All samples live in one contiguous chunk, so the sample-to-chunk table
  // stays a single entry and stco needs just one offset.
  const mdatSize = 8 + samples.reduce((sum, s) => sum + s.data.length, 0);

  // The only value that depends on moov's own size is the chunk offset, and
  // it is a fixed-width u32 — so building twice converges exactly.
  const probe = buildMoov(samples, width, height, description, timescale, totalDuration, 0);
  const mdatStart = FTYP.length + probe.length;
  const moov = buildMoov(samples, width, height, description, timescale, totalDuration, mdatStart + 8);

  const out = new Uint8Array(FTYP.length + moov.length + mdatSize);
  let p = 0;
  out.set(FTYP, p); p += FTYP.length;
  out.set(moov, p); p += moov.length;
  out.set(u32(mdatSize), p); p += 4;
  out.set(ascii('mdat'), p); p += 4;
  for (const s of samples) { out.set(s.data, p); p += s.data.length; }
  return out;
}

// ── Box construction ──

const FTYP = box('ftyp',
  ascii('isom'), u32(512),  // major_brand, minor_version
  ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41')
);

function buildMoov(samples, width, height, description, timescale, duration, chunkOffset) {
  return box('moov',
    box('mvhd', concat(
      u32(0),            // version + flags
      u32(0), u32(0),    // creation / modification time
      u32(timescale), u32(duration),
      u32(0x00010000),   // rate 1.0
      u16(0x0100),       // volume 1.0
      u16(0), u32(0), u32(0),
      UNITY_MATRIX,
      new Uint8Array(24), // pre_defined
      u32(2)              // next_track_id
    )),
    box('trak',
      box('tkhd', concat(
        u32(0x00000007),  // version 0, flags: enabled | in movie | in preview
        u32(0), u32(0),
        u32(1),           // track_id
        u32(0),
        u32(duration),
        u32(0), u32(0),
        u16(0), u16(0),   // layer, alternate_group
        u16(0), u16(0),   // volume (0 for video), reserved
        UNITY_MATRIX,
        u32(width << 16), u32(height << 16)  // 16.16 fixed point
      )),
      box('mdia',
        box('mdhd', concat(
          u32(0), u32(0), u32(0),
          u32(timescale), u32(duration),
          u16(0x55c4),    // language: "und"
          u16(0)
        )),
        box('hdlr', concat(
          u32(0), u32(0),
          ascii('vide'),
          u32(0), u32(0), u32(0),
          ascii('VideoHandler'), u8(0)
        )),
        box('minf',
          box('vmhd', concat(u32(0x00000001), u16(0), u16(0), u16(0), u16(0))),
          box('dinf', box('dref', concat(u32(0), u32(1), box('url ', u32(0x00000001))))),
          buildStbl(samples, width, height, description, chunkOffset)
        )
      )
    )
  );
}

function buildStbl(samples, width, height, description, chunkOffset) {
  // stts: run-length encode sample durations (constant frame rate collapses
  // to a single entry).
  const stts = [];
  for (const s of samples) {
    const last = stts[stts.length - 1];
    if (last && last.delta === s.duration) last.count++;
    else stts.push({ count: 1, delta: s.duration });
  }

  const syncSamples = [];
  samples.forEach((s, i) => { if (s.isKey) syncSamples.push(i + 1); });

  return box('stbl',
    box('stsd', concat(u32(0), u32(1), buildAvc1(width, height, description))),
    box('stts', concat(u32(0), u32(stts.length), ...stts.map(e => concat(u32(e.count), u32(e.delta))))),
    // Omit stss entirely when every sample is a sync sample, per spec.
    ...(syncSamples.length === samples.length ? [] : [
      box('stss', concat(u32(0), u32(syncSamples.length), ...syncSamples.map(u32)))
    ]),
    box('stsc', concat(u32(0), u32(1), u32(1), u32(samples.length), u32(1))),
    box('stsz', concat(u32(0), u32(0), u32(samples.length), ...samples.map(s => u32(s.data.length)))),
    box('stco', concat(u32(0), u32(1), u32(chunkOffset)))
  );
}

function buildAvc1(width, height, description) {
  const compressorName = new Uint8Array(32);  // length-prefixed, left blank
  return box('avc1', concat(
    new Uint8Array(6), u16(1),   // reserved, data_reference_index
    u16(0), u16(0), u32(0), u32(0), u32(0),
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000),  // 72 dpi
    u32(0),
    u16(1),                      // frame_count
    compressorName,
    u16(0x0018),                 // depth
    u16(0xffff),                 // pre_defined = -1
    box('avcC', new Uint8Array(description))
  ));
}

// ── Byte helpers ──

function box(type, ...payload) {
  const body = concat(...payload);
  return concat(u32(body.length + 8), ascii(type), body);
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

function u8(v) { return new Uint8Array([v & 0xff]); }
function u16(v) { return new Uint8Array([(v >> 8) & 0xff, v & 0xff]); }
function u32(v) { return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]); }
function ascii(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }

const UNITY_MATRIX = concat(
  u32(0x00010000), u32(0), u32(0),
  u32(0), u32(0x00010000), u32(0),
  u32(0), u32(0), u32(0x40000000)
);
