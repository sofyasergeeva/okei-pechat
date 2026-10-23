import { blank } from './state.mjs';
export function createCustomerStorage(state, { storage, indexedDB, notice }) {
  let savedOrders = new Map();
  function read(key, fallback) {
    try {
      return JSON.parse(storage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function rememberOrders() {
    savedOrders = new Map(state.orders.map((order) => [order.id, JSON.stringify(order)]));
  }
  function persist(scope = 'draft', { clearDraft = false } = {}) {
    let stored;
    try {
      stored = JSON.parse(storage.getItem(state.key) || 'null') || {};
      const data = {
        ...stored,
        orders: stored.orders || state.orders,
        draft: stored.draft || state.draft,
        profile: stored.profile || state.profile,
      };
      if (scope === 'draft' || clearDraft) data.draft = clearDraft ? blank() : state.draft;
      if (scope === 'profile') data.profile = state.profile;
      if (scope === 'orders') {
        const changed = state.orders.filter(
          (order) => JSON.stringify(order) !== savedOrders.get(order.id),
        );
        for (const order of changed) {
          const current = data.orders.find((item) => item.id === order.id);
          if (JSON.stringify(current) !== savedOrders.get(order.id)) {
            throw Error(
              'Заказ изменился в другой вкладке. Проверь актуальные данные и повтори действие.',
            );
          }
        }
        const updates = new Map(changed.map((order) => [order.id, order]));
        data.orders = [
          ...changed.filter((order) => !savedOrders.has(order.id)),
          ...data.orders.map((order) => updates.get(order.id) || order),
        ];
      }
      // Read/merge/write reduces stale overwrites; localStorage is not transactional.
      storage.setItem(state.key, JSON.stringify(data));
      ({ orders: state.orders, draft: state.draft, profile: state.profile } = data);
      rememberOrders();
      return true;
    } catch (error) {
      if (scope === 'orders' && stored?.orders) {
        state.orders = stored.orders;
        rememberOrders();
      }
      notice(
        error.message?.startsWith('Заказ изменился')
          ? error.message
          : 'Не удалось сохранить данные в браузере. Проверь свободное место и повтори действие.',
      );
      return false;
    }
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('okei-customer-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function putFile(key, blob) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function getFile(key) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction('files').objectStore('files').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
  return { read, rememberOrders, persist, putFile, getFile };
}
