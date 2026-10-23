import { fixtureKey, seed, fingerprint } from './orders.mjs';
export function createStaffStorage(state, { storage, indexedDB, notify, onConflict }) {
  const read = (k, f) => {
    try {
      return JSON.parse(storage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  };
  function load() {
    state.stale = false;
    state.all = [];
    if (!storage.getItem(fixtureKey))
      storage.setItem(fixtureKey, JSON.stringify({ orders: seed() }));
    const keys = [fixtureKey];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith('okei-customer-v1:')) keys.push(k);
    }
    for (const k of keys) {
      const data = read(k, {});
      for (const o of data.orders || []) {
        state.all.push({
          ...o,
          _store: k,
          _ref: k + '::' + o.id,
          customer: o.customer || data.profile || { name: 'Заказчик', group: 'Без группы' },
        });
      }
    }
    state.all.sort(
      (a, b) => new Date(b.created) - new Date(a.created) || Number(b.id) - Number(a.id),
    );
  }
  function update(ref, fn) {
    const item = state.all.find((o) => o._ref === ref);
    if (!item) return false;
    const data = read(item._store, null),
      order = data?.orders?.find((o) => o.id === item.id);
    if (!order) {
      notify('Заказ уже изменён. Обнови очередь.');
      return false;
    }
    if (fingerprint(order) !== fingerprint(item)) {
      state.checked.delete(ref);
      state.confirm = '';
      load();
      onConflict();
      notify('Заказ изменился. Проверь актуальные параметры и статус.');
      return false;
    }
    fn(order);
    try {
      storage.setItem(item._store, JSON.stringify(data));
      load();
      return true;
    } catch {
      notify('Не удалось сохранить. Проверь свободное место в браузере.');
      return false;
    }
  }
  async function getFile(key) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('okei-customer-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result,
          r = db.transaction('files').objectStore('files').get(key);
        r.onsuccess = () => {
          resolve(r.result);
          db.close();
        };
        r.onerror = () => {
          reject(r.error);
          db.close();
        };
      };
    });
  }
  return { load, update, getFile };
}
