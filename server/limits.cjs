const { fail } = require('./auth.cjs');
const mb = 1024 * 1024;
function createLimits(db, options = {}) {
  const limits = {
    userBytes: 256 * mb,
    totalBytes: 2048 * mb,
    userOrders: 200,
    totalOrders: 2000,
    users: 500,
    ...options,
  };
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1))
    throw Error('Storage and order limits must be positive integers');
  const reserved = new Map();
  const uploads = new Set();
  function orders(owner) {
    const all = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
    const own = db.prepare('SELECT COUNT(*) n FROM orders WHERE owner_id=?').get(owner).n;
    if (all >= limits.totalOrders || own >= limits.userOrders)
      throw fail(429, 'Достигнут лимит заказов. Обратись к сотруднику.');
  }
  function reserve(owner, bytes, count) {
    const all = db.prepare('SELECT COALESCE(SUM(size),0) bytes,COUNT(*) n FROM files').get();
    const own = db
      .prepare('SELECT COALESCE(SUM(size),0) bytes,COUNT(*) n FROM files WHERE owner_id=?')
      .get(owner);
    const current = reserved.get(owner) || { bytes: 0, count: 0 };
    const pending = [...reserved.values()].reduce(
      (sum, value) => ({ bytes: sum.bytes + value.bytes, count: sum.count + value.count }),
      { bytes: 0, count: 0 },
    );
    if (
      own.bytes + current.bytes + bytes > limits.userBytes ||
      all.bytes + pending.bytes + bytes > limits.totalBytes ||
      own.n + current.count + count > 500 ||
      all.n + pending.count + count > 5000
    )
      throw fail(413, 'Достигнут лимит хранилища. Обратись к сотруднику.');
    reserved.set(owner, { bytes: current.bytes + bytes, count: current.count + count });
    return () => {
      const value = reserved.get(owner);
      const remaining = { bytes: value.bytes - bytes, count: value.count - count };
      if (remaining.count) reserved.set(owner, remaining);
      else reserved.delete(owner);
    };
  }
  function upload(req, res, next) {
    if (!req.is('multipart/form-data')) return next();
    if (uploads.size >= 2 || uploads.has(req.user.id))
      return next(fail(429, 'Дождись завершения загрузки.'));
    const maximum = 51 * mb;
    if (Number(req.get('content-length')) > maximum)
      return next(fail(413, 'Пакет файлов слишком большой.'));
    const owner = req.user.id;
    uploads.add(owner);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      uploads.delete(owner);
    };
    res.once('finish', release);
    res.once('close', release);
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maximum) {
        if (!res.headersSent) res.status(413).json({ error: 'Пакет файлов слишком большой.' });
        req.destroy();
      }
    });
    next();
  }
  return {
    orders,
    reserve,
    upload,
    register() {
      if (db.prepare('SELECT COUNT(*) n FROM users').get().n >= limits.users)
        throw fail(429, 'Регистрация временно недоступна. Обратись к сотруднику.');
    },
    message(id) {
      if (db.prepare('SELECT COUNT(*) n FROM messages WHERE order_id=?').get(id).n >= 200)
        throw fail(429, 'Достигнут лимит переписки заказа. Обратись к сотруднику.');
    },
  };
}
module.exports = { createLimits };
