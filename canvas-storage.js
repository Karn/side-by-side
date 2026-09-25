const CanvasStorage = (() => {
  const DB_NAME = 'side-by-side-canvases';
  const DB_VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('summaries', { keyPath: 'id' });
        request.result.createObjectStore('canvases', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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

  return {
    save(canvas) {
      return run(['summaries', 'canvases'], 'readwrite', transaction => {
        transaction.objectStore('summaries').put({
          id: canvas.id,
          name: canvas.name,
          savedAt: canvas.savedAt,
        });
        transaction.objectStore('canvases').put(canvas);
      });
    },
    list() {
      return run(['summaries'], 'readonly', transaction =>
        transaction.objectStore('summaries').getAll()
      ).then(items => items.sort((a, b) => b.savedAt - a.savedAt));
    },
    get(id) {
      return run(['canvases'], 'readonly', transaction =>
        transaction.objectStore('canvases').get(id)
      );
    },
    delete(id) {
      return run(['summaries', 'canvases'], 'readwrite', transaction => {
        transaction.objectStore('summaries').delete(id);
        transaction.objectStore('canvases').delete(id);
      });
    },
  };
})();
