(() => {
  const VIDEO_BITRATE = 8_000_000;

  ExportPlugins.register('webm', {
    extension: 'webm',
    outputSize: { width: 1920, height: 1080 },

    async createSession({ canvas }) {
      const stream = canvas.captureStream(0);
      const videoTrack = stream.getVideoTracks()[0];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITRATE,
      });
      const chunks = [];
      let recorderError = null;
      const recordingStopped = new Promise(resolve => {
        recorder.ondataavailable = event => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = resolve;
        recorder.onerror = event => {
          recorderError = event.error ?? new Error('WebM recording failed');
          resolve();
        };
      });

      try {
        recorder.start();
      } catch (error) {
        stream.getTracks().forEach(track => track.stop());
        throw error;
      }

      let stopping;
      function stop() {
        if (!stopping) {
          stopping = (async () => {
            try {
              if (recorder.state !== 'inactive') recorder.stop();
              await recordingStopped;
              if (recorderError) throw recorderError;
            } finally {
              stream.getTracks().forEach(track => track.stop());
            }
          })();
        }
        return stopping;
      }

      return {
        addFrame() {
          if (recorderError) throw recorderError;
          videoTrack.requestFrame?.();
        },
        async finish() {
          try {
            await stop();
            return new Blob(chunks, { type: mimeType });
          } finally {
            chunks.length = 0;
          }
        },
        async cancel() {
          try {
            await stop();
          } finally {
            chunks.length = 0;
          }
        },
      };
    },
  });
})();
