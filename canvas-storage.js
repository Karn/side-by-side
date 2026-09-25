const CanvasStorage = (() => {
  const DB_NAME = 'side-by-side-canvases';
  const DB_VERSION = 2;
  const fileIds = new WeakMap();
  const storedFileIds = new Set();

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('summaries')) db.createObjectStore('summaries', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('canvases')) db.createObjectStore('canvases', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('current')) db.createObjectStore('current', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other Side-by-Side tabs, then reload to update canvas storage.'));
      };
    });
  }

  async function run(storeNames, mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      let result;
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
      const request = operation(transaction);
      if (request) request.onsuccess = () => { result = request.result; };
    });
  }

  async function loadCurrent() {
    const saved = await run(['current'], 'readonly', transaction =>
      transaction.objectStore('current').get('current')
    );
    if (!saved) {
      const summaries = await run(['summaries'], 'readonly', transaction =>
        transaction.objectStore('summaries').getAll()
      );
      const latest = summaries.sort((a, b) => b.savedAt - a.savedAt)[0];
      if (!latest) return null;
      const previous = await run(['canvases'], 'readonly', transaction =>
        transaction.objectStore('canvases').get(latest.id)
      );
      return previous?.state ?? null;
    }

    const state = saved.state;
    const ids = new Set([state.backgroundFile, state.left.file, state.right.file].filter(Boolean));
    const files = new Map();
    for (const id of ids) {
      const asset = await run(['assets'], 'readonly', transaction =>
        transaction.objectStore('assets').get(id)
      );
      if (!asset) throw new Error('A saved video or background image is missing.');
      files.set(id, asset.file);
      fileIds.set(asset.file, id);
      storedFileIds.add(id);
    }
    return {
      ...state,
      backgroundFile: files.get(state.backgroundFile) ?? null,
      left: { ...state.left, file: files.get(state.left.file) ?? null },
      right: { ...state.right, file: files.get(state.right.file) ?? null },
    };
  }

  async function saveCurrent(state) {
    const assets = new Map();
    const encodeFile = file => {
      if (!file) return null;
      let id = fileIds.get(file);
      if (!id) {
        id = crypto.randomUUID();
        fileIds.set(file, id);
      }
      if (!storedFileIds.has(id)) assets.set(id, file);
      return id;
    };
    const storedState = {
      ...state,
      backgroundFile: encodeFile(state.backgroundFile),
      left: { ...state.left, file: encodeFile(state.left.file) },
      right: { ...state.right, file: encodeFile(state.right.file) },
    };
    const activeIds = new Set([
      storedState.backgroundFile, storedState.left.file, storedState.right.file,
    ].filter(Boolean));
    await run(['current', 'assets'], 'readwrite', transaction => {
      const assetStore = transaction.objectStore('assets');
      const request = assetStore.getAllKeys();
      request.onsuccess = () => {
        for (const id of request.result) {
          if (!activeIds.has(id)) assetStore.delete(id);
        }
        for (const [id, file] of assets) assetStore.put({ id, file });
        transaction.objectStore('current').put({ id: 'current', state: storedState });
      };
    });
    storedFileIds.clear();
    for (const id of activeIds) storedFileIds.add(id);
  }

  return { loadCurrent, saveCurrent };
})();
