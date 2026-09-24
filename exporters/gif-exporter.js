(() => {
  ExportPlugins.register('gif', {
    extension: 'gif',
    outputSize: { width: 960, height: 540 },
    frameLabel: (current, total) => `GIF ${current} / ${total}`,

    async createSession({ context, width, height, fps, setStatus }) {
      setStatus('Loading GIF encoder…');
      await ExportPlugins.loadScript('exporters/gif-encoder.js', () => typeof createGIFEncoder === 'function');

      const encoder = createGIFEncoder(width, height, Math.round(1000 / fps));
      return {
        addFrame() {
          encoder.addFrame(context.getImageData(0, 0, width, height));
        },
        async finish() {
          return encoder.finish();
        },
        async cancel() {
          encoder.cancel();
        },
      };
    },
  });
})();
