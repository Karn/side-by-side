const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({ Blob, Uint8Array, DataView });
vm.runInContext(readFileSync(path.join(__dirname, '../exporters/webm-muxer.js'), 'utf8'), context);

function elements(bytes, start = 0, end = bytes.length) {
  const result = [];
  let offset = start;
  function vint(keepMarker) {
    let marker = 0x80;
    let length = 1;
    while (!(bytes[offset] & marker)) { marker >>= 1; length++; }
    let value = bytes[offset++] & (keepMarker ? 0xff : marker - 1);
    for (let i = 1; i < length; i++) value = value * 256 + bytes[offset++];
    return value;
  }
  while (offset < end) {
    const start = offset;
    const id = vint(true);
    const size = vint(false);
    const dataStart = offset;
    offset += size;
    assert.ok(offset <= end, 'element fits inside its parent');
    result.push({ id, start, dataStart, end: offset, data: bytes.subarray(dataStart, offset) });
  }
  return result;
}

const uint = bytes => bytes.reduce((value, byte) => value * 256 + byte, 0);
const child = (parent, id) => elements(parent.data).find(element => element.id === id);

for (const fps of [24, 30, 60]) {
  test(`WebM duration, frame times, and seek offsets at ${fps} fps`, async () => {
    const count = fps * 4 + 1;
    const samples = Array.from({ length: count }, (_, index) => ({
      timestamp: Math.round(index * 1e6 / fps),
      isKey: index % (fps * 2) === 0,
      data: new Uint8Array([index & 0xff]),
    }));
    const blob = context.encodeWebM(samples, 1920, 1080, fps);
    assert.equal(blob.type, 'video/webm');
    const bytes = Buffer.from(await blob.arrayBuffer());
    const segment = elements(bytes).find(element => element.id === 0x18538067);
    const contents = elements(bytes, segment.dataStart, segment.end);
    const info = contents.find(element => element.id === 0x1549a966);
    assert.equal(child(info, 0x4489).data.readDoubleBE(), count * 1000 / fps);
    assert.equal(uint(child(info, 0x2ad7b1).data), 1_000_000);
    const tracks = contents.find(element => element.id === 0x1654ae6b);
    assert.equal(uint(child(child(tracks, 0xae), 0x23e383).data), Math.round(1e9 / fps));

    const clusters = contents.filter(element => element.id === 0x1f43b675);
    assert.equal(clusters.length, 3);
    let frame = 0;
    for (const cluster of clusters) {
      const time = uint(child(cluster, 0xe7).data);
      const blocks = elements(cluster.data).filter(element => element.id === 0xa3);
      for (const block of blocks) {
        assert.equal(time + block.data.readInt16BE(1), Math.round(samples[frame].timestamp / 1000));
        assert.equal(Boolean(block.data[3] & 0x80), samples[frame].isKey);
        assert.equal(block.data[4], frame & 0xff);
        frame++;
      }
    }
    assert.equal(frame, count);

    const cues = contents.find(element => element.id === 0x1c53bb6b);
    elements(cues.data).forEach((point, index) => {
      const position = uint(child(child(point, 0xb7), 0xf1).data);
      assert.equal(position + segment.dataStart, clusters[index].start);
      assert.equal(uint(child(point, 0xb3).data), index * 2000);
    });
    const seekHead = contents.find(element => element.id === 0x114d9b74);
    for (const seek of elements(seekHead.data)) {
      const target = uint(child(seek, 0x53ab).data);
      const position = uint(child(seek, 0x53ac).data);
      assert.equal(position + segment.dataStart, contents.find(element => element.id === target).start);
    }
  });
}
