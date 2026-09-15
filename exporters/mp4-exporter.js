(() => {
  const MP4_CODEC = 'avc1.640028';
  const MP4_TIMESCALE = 90000; // Exact frame durations at 24, 30, and 60 fps.
  const VIDEO_BITRATE = 8_000_000;

  function encoderConfig(width, height, fps) {
    return {
      codec: MP4_CODEC,
      width,
      height,
      bitrate: VIDEO_BITRATE,
      framerate: fps,
      avc: { format: 'avc' }, // The muxer requires length-prefixed NAL units.
    };
  }

  ExportPlugins.register('mp4', {
    extension: 'mp4',
    outputSize: { width: 1920, height: 1080 },
    fallback: 'webm',

    async isSupported({ width, height, fps }) {
      if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
      try {
        const { supported } = await VideoEncoder.isConfigSupported(encoderConfig(width, height, fps));
        return Boolean(supported);
      } catch {
        return false;
      }
    },

    async createSession({ canvas, width, height, fps, setStatus }) {
      setStatus('Loading MP4 muxer…');
      await ExportPlugins.loadScript('exporters/mp4-muxer.js', () => typeof encodeMP4 === 'function');

      const samples = [];
      const sampleDuration = MP4_TIMESCALE / fps;
      let description = null;
      let encoderError = null;

      const encoder = new VideoEncoder({
        output: (chunk, metadata) => {
          if (metadata?.decoderConfig?.description) {
            description = new Uint8Array(metadata.decoderConfig.description).slice();
          }
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          samples.push({ data, duration: sampleDuration, isKey: chunk.type === 'key' });
        },
        error: error => { encoderError = error; },
      });

      function closeEncoder() {
        if (encoder.state !== 'closed') encoder.close();
      }

      try {
        encoder.configure(encoderConfig(width, height, fps));
      } catch (error) {
        closeEncoder();
        throw error;
      }

      return {
        async addFrame(index) {
          if (encoderError) throw encoderError;
          // Frame-index timestamps keep output timing independent of seek latency.
          const frame = new VideoFrame(canvas, {
            timestamp: Math.round(index * 1e6 / fps),
            duration: Math.round(1e6 / fps),
          });
          try {
            encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 });
          } finally {
            frame.close();
          }
          // Backpressure prevents long exports from accumulating raw frames.
          if (encoder.encodeQueueSize > 8) {
            await new Promise(resolve => encoder.addEventListener('dequeue', resolve, { once: true }));
          }
          if (encoderError) throw encoderError;
        },
        async finish() {
          try {
            await encoder.flush();
            if (encoderError) throw encoderError;
            if (!description) throw new Error('MP4 encoder did not provide an AVC configuration');
            setStatus('Muxing MP4…');
            return new Blob([
              encodeMP4(samples, width, height, description, MP4_TIMESCALE),
            ], { type: 'video/mp4' });
          } finally {
            closeEncoder();
            samples.length = 0;
          }
        },
        async cancel() {
          closeEncoder();
          samples.length = 0;
        },
      };
    },
  });
})();
