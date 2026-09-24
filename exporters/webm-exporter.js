(() => {
  function encoderConfig(width, height, fps) {
    return {
      codec: 'vp8',
      width,
      height,
      bitrate: 8_000_000,
      framerate: fps,
      latencyMode: 'realtime',
    };
  }

  ExportPlugins.register('webm', {
    extension: 'webm',
    outputSize: { width: 1920, height: 1080 },
    fallback: 'gif',

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
      setStatus('Loading WebM muxer…');
      await ExportPlugins.loadScript('exporters/webm-muxer.js', () => typeof encodeWebM === 'function');

      const samples = [];
      let encoderError = null;
      const encoder = new VideoEncoder({
        output: chunk => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          samples.push({ data, timestamp: chunk.timestamp, isKey: chunk.type === 'key' });
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
          // Frame timestamps follow the output timeline, independent of seek and encode latency.
          const frame = new VideoFrame(canvas, {
            timestamp: Math.round(index * 1e6 / fps),
            duration: Math.round(1e6 / fps),
          });
          try {
            encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 });
          } finally {
            frame.close();
          }
          if (encoder.encodeQueueSize >= 8) await encoder.flush();
          if (encoderError) throw encoderError;
        },
        async finish() {
          try {
            await encoder.flush();
            if (encoderError) throw encoderError;
            setStatus('Muxing WebM…');
            return encodeWebM(samples, width, height, fps);
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
