export function createStudioStorage({ indexedDB }) {
  function db() {
    return new Promise((r, j) => {
      let q = indexedDB.open('okei-studio', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('designs');
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
  }
  async function read(owner) {
    let d = await db();
    try {
      return await new Promise((r, j) => {
        let q = d.transaction('designs').objectStore('designs').get(owner);
        q.onsuccess = () => r(q.result);
        q.onerror = () => j(q.error);
      });
    } finally {
      d.close();
    }
  }
  async function write(value, owner) {
    let d = await db();
    try {
      await new Promise((r, j) => {
        const t = d.transaction('designs', 'readwrite');
        t.objectStore('designs').put(value, owner);
        t.oncomplete = r;
        t.onerror = () => j(t.error);
      });
    } finally {
      d.close();
    }
  }
  return { read, write };
}
