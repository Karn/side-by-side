(() => {
  const plugins = new Map();
  const scriptLoads = new Map();
  const pluginSources = {
    gif: 'exporters/gif-exporter.js',
    webm: 'exporters/webm-exporter.js',
    mp4: 'exporters/mp4-exporter.js',
  };

  function loadScript(src, isReady) {
    if (isReady?.()) return Promise.resolve();
    if (!scriptLoads.has(src)) {
      scriptLoads.set(src, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
          if (isReady && !isReady()) {
            scriptLoads.delete(src);
            reject(new Error(`${src} loaded without its expected export`));
            return;
          }
          resolve();
        };
        script.onerror = () => {
          scriptLoads.delete(src);
          reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
      }));
    }
    return scriptLoads.get(src);
  }

  function register(format, plugin) {
    const { width, height } = plugin?.outputSize ?? {};
    if (!plugin?.extension || !width || !height || typeof plugin.createSession !== 'function') {
      throw new Error(`Invalid ${format} export plugin`);
    }
    if (plugins.has(format)) throw new Error(`Duplicate export plugin: ${format}`);
    plugins.set(format, Object.freeze(plugin));
  }

  async function get(format) {
    if (!plugins.has(format)) {
      const src = pluginSources[format];
      if (!src) throw new Error(`Unknown export format: ${format}`);
      await loadScript(src, () => plugins.has(format));
    }
    const plugin = plugins.get(format);
    if (!plugin) throw new Error(`${format} export plugin did not register`);
    return plugin;
  }

  async function resolve(format, options = {}, attempted = new Set()) {
    if (attempted.has(format)) throw new Error(`Circular export fallback: ${format}`);
    attempted.add(format);

    const plugin = await get(format);
    const supported = !plugin.isSupported || await plugin.isSupported({
      ...options,
      ...plugin.outputSize,
    });
    if (supported) return plugin;
    if (!plugin.fallback) throw new Error(`${format} export is not supported`);
    return resolve(plugin.fallback, options, attempted);
  }

  window.ExportPlugins = Object.freeze({ register, resolve, loadScript });
})();
