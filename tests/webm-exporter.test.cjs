const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadExporter() {
  let plugin;
  let encoder;
  const frames = [];
  const context = vm.createContext({
    ExportPlugins: {
      register: (_, value) => { plugin = value; },
      loadScript: async () => {},
    },
    Uint8Array,
    encodeWebM: (samples, width, height, fps) => ({ samples: samples.slice(), width, height, fps }),
    VideoFrame: class {
      constructor(canvas, options) { Object.assign(this, options); frames.push(this); }
      close() { this.closed = true; }
    },
    VideoEncoder: class {
      constructor(callbacks) { this.callbacks = callbacks; this.state = 'unconfigured'; this.encodeQueueSize = 0; encoder = this; }
      configure() { this.state = 'configured'; }
      encode(frame, { keyFrame }) {
        this.callbacks.output({ timestamp: frame.timestamp, byteLength: 1, copyTo: data => { data[0] = 42; }, type: keyFrame ? 'key' : 'delta' });
      }
      async flush() {}
      close() { this.state = 'closed'; }
    },
  });
  vm.runInContext(readFileSync(path.join(__dirname, '../exporters/webm-exporter.js'), 'utf8'), context);
  return { plugin, frames, get encoder() { return encoder; } };
}

for (const fps of [24, 30, 60]) {
  test(`WebM timestamps use frame indices at ${fps} fps`, async () => {
    const harness = loadExporter();
    const session = await harness.plugin.createSession({ canvas: {}, width: 64, height: 48, fps, setStatus() {} });
    for (let index = 0; index < 3; index++) {
      await new Promise(resolve => setTimeout(resolve, index * 2));
      await session.addFrame(index);
    }
    const result = await session.finish();
    assert.deepEqual(Array.from(result.samples, sample => sample.timestamp), [0, Math.round(1e6 / fps), Math.round(2e6 / fps)]);
    assert.ok(harness.frames.every(frame => frame.closed && frame.duration === Math.round(1e6 / fps)));
    assert.equal(harness.encoder.state, 'closed');
  });
}

test('WebM cancellation releases the encoder', async () => {
  const harness = loadExporter();
  const session = await harness.plugin.createSession({ canvas: {}, width: 64, height: 48, fps: 30, setStatus() {} });
  await session.addFrame(0);
  await session.cancel();
  await session.cancel();
  assert.equal(harness.encoder.state, 'closed');
});

test('WebM encoding errors propagate and release the encoder', async () => {
  const harness = loadExporter();
  const session = await harness.plugin.createSession({ canvas: {}, width: 64, height: 48, fps: 30, setStatus() {} });
  const error = new Error('Encoder failed');
  harness.encoder.callbacks.error(error);
  await assert.rejects(session.addFrame(0), error);
  await assert.rejects(session.finish(), error);
  assert.equal(harness.encoder.state, 'closed');
});
