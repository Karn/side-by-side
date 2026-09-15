(() => {
  ExportPlugins.register('gif', {
    extension: 'gif',
    outputSize: { width: 960, height: 540 },
    frameLabel: (current, total) => `GIF ${current} / ${total}`,

    async createSession({ context, width, height, fps, setStatus }) {
      setStatus('Loading GIF encoder…');
      await ExportPlugins.loadScript('exporters/gif-encoder.js', () => typeof encodeGIF === 'function');

      const frames = [];
      return {
        addFrame() {
          frames.push(context.getImageData(0, 0, width, height));
        },
        async finish() {
          setStatus('Encoding GIF…');
          await new Promise(resolve => setTimeout(resolve, 0));
          try {
            return encodeGIF(frames, width, height, Math.round(1000 / fps));
          } finally {
            frames.length = 0;
          }
        },
        async cancel() {
          frames.length = 0;
        },
      };
    },
  });
})();
