const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { openDatabase } = require('./db.cjs');
const auth = require('./auth.cjs');
const orders = require('./orders.cjs');
async function createApi({
  dataDir = path.join(__dirname, '../var/okei'),
  origin = 'http://127.0.0.1:8080',
  secureCookies = false,
} = {}) {
  const directory = path.resolve(dataDir),
    db = openDatabase(directory),
    app = express();
  app.disable('x-powered-by');
  app.locals.origin = new URL(origin).origin;
  const sessions = auth.createSessions(db, { secure: secureCookies }),
    dummy = await auth.passwordHash(randomUUID());
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    if (req.path.startsWith('/api/')) {
      res.set('Cache-Control', 'no-store');
      if (req.get('host') !== new URL(app.locals.origin).host)
        return next(auth.fail(403, 'Недопустимый адрес сервера.'));
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        req.get('origin') !== app.locals.origin
      )
        return next(auth.fail(403, 'Недопустимое происхождение запроса.'));
    }
    next();
  });
  app.use('/api', express.json({ limit: '32kb' }), sessions.identify);
  const required = (req, res, next) =>
    req.user ? next() : next(auth.fail(401, 'Войди в аккаунт.'));
  const student = (req, res, next) =>
    req.user?.role === 'student' ? next() : next(auth.fail(403, 'Доступно заказчику.'));
  const limit = auth.createLoginLimiter();
  app.post('/api/auth/register', limit, async (req, res) => {
    if (req.body?.role && req.body.role !== 'student')
      throw auth.fail(400, 'Роль назначает сервер.');
    const user = await auth.createUser(db, req.body);
    sessions.issue(res, user);
    res.status(201).json(user);
  });
  app.post('/api/auth/login', limit, async (req, res) => {
    const { login, password } = auth.credentials(req.body),
      user = db.prepare('SELECT * FROM users WHERE login=?').get(login);
    const valid = await auth.verifyPassword(password, user?.password_hash || dummy);
    if (!user || !valid) throw auth.fail(401, 'Логин или пароль не совпали.');
    sessions.issue(res, user);
    res.json(auth.publicUser(user));
  });
  app.get('/api/auth/session', (req, res) => res.json(req.user ? auth.publicUser(req.user) : null));
  app.post('/api/auth/logout', (req, res) => {
    sessions.logout(req, res);
    res.json({ ok: true });
  });
  app.patch('/api/profile', required, student, (req, res) => {
    const data = auth.profile(req.body);
    db.prepare('UPDATE users SET name=?,group_name=? WHERE id=?').run(
      data.name,
      data.group,
      req.user.id,
    );
    res.json({ ...auth.publicUser(req.user), ...data });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 10, fields: 0, parts: 10 },
    fileFilter(req, file, done) {
      done(
        ['file', 'files'].includes(file.fieldname)
          ? null
          : auth.fail(400, 'Недопустимое поле загрузки.'),
        true,
      );
    },
  }).any();
  app.post('/api/files', required, student, upload, async (req, res) => {
    const files = req.files || [];
    if (!files.length || files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024)
      throw auth.fail(400, 'Выбери от 1 до 10 PDF, суммарно до 50 МБ.');
    const pages = await Promise.all(files.map(orders.validatePDF));
    const saved = files.map((file, index) => ({
      id: randomUUID(),
      name:
        path
          .basename(Buffer.from(file.originalname, 'latin1').toString('utf8'))
          .replace(/[\x00-\x1f\x7f]/g, '')
          .slice(0, 200) || 'document.pdf',
      pages: pages[index],
      size: file.size,
    }));
    const written = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const target = path.join(directory, 'pdf', saved[i].id + '.pdf');
        await fs.promises.writeFile(target, files[i].buffer, { flag: 'wx', mode: 0o600 });
        written.push(target);
      }
      db.transaction(() => {
        const insert = db.prepare('INSERT INTO files VALUES (?,?,?,?,?,?)');
        saved.forEach((file) =>
          insert.run(file.id, req.user.id, file.id + '.pdf', file.name, file.pages, file.size),
        );
      })();
    } catch (error) {
      await Promise.all(written.map((target) => fs.promises.unlink(target).catch(() => {})));
      throw error;
    }
    res
      .status(201)
      .json(files.length === 1 && files[0].fieldname === 'file' ? saved[0] : { files: saved });
  });
  function sendFile(req, res, file) {
    if (!file) throw auth.fail(404, 'PDF не найден.');
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
    res
      .attachment(file.name)
      .type('application/pdf')
      .sendFile(path.join(directory, 'pdf', file.storage_name));
  }
  app.get('/api/files/:id', required, (req, res) => {
    const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
    if (
      !file ||
      (req.user.role !== 'staff' && file.owner_id !== req.user.id) ||
      (req.user.role === 'staff' &&
        !db.prepare('SELECT 1 FROM order_files WHERE file_id=?').get(file.id))
    )
      throw auth.fail(404, 'PDF не найден.');
    sendFile(req, res, file);
  });
  app.get('/api/orders', required, (req, res) => {
    const rows =
      req.user.role === 'staff'
        ? db.prepare('SELECT * FROM orders ORDER BY id DESC').all()
        : db.prepare('SELECT * FROM orders WHERE owner_id=? ORDER BY id DESC').all(req.user.id);
    res.json(rows.map((row) => orders.orderView(db, row)));
  });
  app.post('/api/orders', required, student, (req, res) =>
    res.status(201).json(orders.createOrder(db, req.user, req.body)),
  );
  app.get('/api/orders/:id', required, (req, res) =>
    res.json(orders.orderView(db, orders.accessibleOrder(db, req.user, req.params.id))),
  );
  app.get('/api/orders/:id/file', required, (req, res) => {
    const order = orders.accessibleOrder(db, req.user, req.params.id);
    sendFile(req, res, db.prepare('SELECT * FROM files WHERE id=?').get(order.file_id));
  });
  app.get('/api/orders/:id/files/:fileId', required, (req, res) => {
    orders.accessibleOrder(db, req.user, req.params.id);
    const file = db
      .prepare(
        'SELECT f.* FROM order_files a JOIN files f ON f.id=a.file_id WHERE order_id=? AND file_id=?',
      )
      .get(req.params.id, req.params.fileId);
    sendFile(req, res, file);
  });
  app.post('/api/orders/:id/printing', required, (req, res) =>
    res.json(orders.modifyOrder(db, req.user, req.params.id, req.body, 'printing')),
  );
  app.patch('/api/orders/:id/status', required, (req, res) =>
    res.json(orders.modifyOrder(db, req.user, req.params.id, req.body, 'status')),
  );
  app.post('/api/orders/:id/messages', required, (req, res) =>
    res.json(orders.modifyOrder(db, req.user, req.params.id, req.body, 'message')),
  );
  app.post('/api/orders/:id/read', required, student, (req, res) => {
    orders.accessibleOrder(db, req.user, req.params.id);
    db.prepare('UPDATE orders SET unread=0 WHERE id=? AND owner_id=?').run(
      req.params.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API не найден.' }));
  app.use(
    express.static(path.join(__dirname, '../dist'), {
      dotfiles: 'deny',
      index: 'index.html',
      setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
    }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof multer.MulterError ? 400 : error.status || 500;
    if (status >= 500) console.error('API error:', error.code || error.message);
    res.status(status).json({
      error:
        status >= 500
          ? 'Не удалось сохранить или загрузить данные. Повтори действие.'
          : error.message,
    });
  });
  return { app, db, close: () => db.close() };
}
module.exports = { createApi };
