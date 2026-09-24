const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('incremental GIF encoding preserves output while reusing the source buffer', async () => {
  const context = vm.createContext({ Blob, Uint8Array, Int16Array, Map });
  vm.runInContext(readFileSync(path.join(__dirname, '../exporters/gif-encoder.js'), 'utf8'), context);
  const width = 320;
  const height = 180;
  const encoder = context.createGIFEncoder(width, height, 33);
  const data = new Uint8Array(width * height * 4);
  for (let frame = 0; frame < 12; frame++) {
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 4 === 3 ? 255 : (i * 13 + Math.floor(i / (width * 4)) * 7 + frame * 19) % 256;
    }
    encoder.addFrame({ data });
  }
  data.fill(0);
  const blob = encoder.finish();
  assert.equal(blob.type, 'image/gif');
  const digest = createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
  assert.equal(digest, '20d0bb5a658f11087eb48df2b5d5cb3610f55cfcb5763ddd8481f7f505d1e0cc');
});
