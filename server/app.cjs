const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { openDatabase } = require('./db.cjs');
const auth = require('./auth.cjs');
const orders = require('./orders.cjs');
const merch = require('./merch.cjs');
const { createLimits } = require('./limits.cjs');
async function createApi({
  dataDir = path.join(__dirname, '../var/okei'),
  origin = 'http://127.0.0.1:8080',
  secureCookies = false,
  serverOnly = false,
  trustProxy = false,
  limits: limitOptions = {},
} = {}) {
  const directory = path.resolve(dataDir),
    db = openDatabase(directory),
    app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  const limits = createLimits(db, limitOptions);
  const operations = new Set();
  function asyncRoute(handler) {
    return (req, res, next) => {
      const work = Promise.resolve().then(() => handler(req, res));
      operations.add(work);
      work.catch(next).finally(() => operations.delete(work));
    };
  }
  app.get('/healthz', (req, res) => {
    db.prepare('SELECT 1').get();
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });
  app.locals.origin = new URL(origin).origin;
  const sessions = auth.createSessions(db, { secure: secureCookies }),
    dummy = await auth.passwordHash(randomUUID());
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
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
  app.post(
    '/api/auth/register',
    limit,
    asyncRoute(async (req, res) => {
      limits.register();
      if (req.body?.role && req.body.role !== 'student')
        throw auth.fail(400, 'Роль назначает сервер.');
      const user = await auth.createUser(db, req.body, 'student', limits.register);
      sessions.issue(res, user);
      res.status(201).json(user);
    }),
  );
  app.post(
    '/api/auth/login',
    limit,
    asyncRoute(async (req, res) => {
      const { login, password } = auth.credentials(req.body),
        user = db.prepare('SELECT * FROM users WHERE login=?').get(login);
      const valid = await auth.verifyPassword(password, user?.password_hash || dummy);
      const current = user && db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
      if (!valid || !current?.active || current.password_hash !== user.password_hash)
        throw auth.fail(401, 'Логин или пароль не совпали.');
      sessions.issue(res, current);
      res.json(auth.publicUser(current));
    }),
  );
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
  const administrator = (req, res, next) =>
    req.user?.role === 'admin' ? next() : next(auth.fail(403, 'Доступно администратору.'));
  const personnel = (user) => ({
    id: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    active: Boolean(user.active),
  });
  const currentAdministrator = (id) => {
    if (!db.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND active=1").get(id))
      throw auth.fail(403, 'Доступ администратора прекращён.');
  };
  app.get('/api/staff', required, administrator, (req, res) => {
    res.json(
      db
        .prepare(
          "SELECT id,login,name,role,active FROM users WHERE role IN ('staff','admin') ORDER BY login",
        )
        .all()
        .map(personnel),
    );
  });
  app.post(
    '/api/staff',
    required,
    administrator,
    asyncRoute(async (req, res) => {
      if (Object.keys(req.body || {}).some((key) => !['login', 'password', 'name'].includes(key)))
        throw auth.fail(400, 'Укажи только логин, имя и пароль сотрудника.');
      const user = await auth.createUser(db, { ...req.body, group: 'Типография' }, 'staff', () => {
        currentAdministrator(req.user.id);
        limits.register();
      });
      res.status(201).json(personnel(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)));
    }),
  );
  app.patch(
    '/api/staff/:id',
    required,
    administrator,
    asyncRoute(async (req, res) => {
      const body = req.body || {},
        keys = Object.keys(body);
      if (!keys.length || keys.some((key) => !['name', 'password', 'active'].includes(key)))
        throw auth.fail(400, 'Можно изменить имя, пароль или доступ.');
      if (
        'name' in body &&
        (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80)
      )
        throw auth.fail(400, 'Укажи имя до 80 символов.');
      if ('active' in body && typeof body.active !== 'boolean')
        throw auth.fail(400, 'Проверь состояние доступа.');
      let hash;
      if ('password' in body) {
        auth.credentials({ login: 'reset', password: body.password });
        hash = await auth.passwordHash(body.password);
      }
      const result = db.transaction(() => {
        currentAdministrator(req.user.id);
        const user = db
          .prepare("SELECT * FROM users WHERE id=? AND role IN ('staff','admin')")
          .get(req.params.id);
        if (!user) throw auth.fail(404, 'Сотрудник не найден.');
        if (
          body.active === false &&
          user.active &&
          user.role === 'admin' &&
          db.prepare("SELECT count(*) n FROM users WHERE role='admin' AND active=1").get().n <= 1
        )
          throw auth.fail(409, 'Нельзя отключить последнего активного администратора.');
        db.prepare('UPDATE users SET name=?,password_hash=?,active=? WHERE id=?').run(
          body.name?.trim() ?? user.name,
          hash ?? user.password_hash,
          'active' in body ? Number(body.active) : user.active,
          user.id,
        );
        if (hash || body.active === false)
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        return personnel(db.prepare('SELECT * FROM users WHERE id=?').get(user.id));
      })();
      res.json(result);
    }),
  );
  app.get('/api/prices', (req, res) => res.json(orders.price(db)));
  app.patch('/api/prices', required, administrator, (req, res) =>
    res.json(orders.updatePrice(db, req.user, req.body)),
  );
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
  app.post(
    '/api/files',
    required,
    student,
    limits.upload,
    upload,
    asyncRoute(async (req, res) => {
      const files = req.files || [];
      if (!files.length || files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024)
        throw auth.fail(400, 'Выбери от 1 до 10 PDF, суммарно до 50 МБ.');
      const pages = await Promise.all(files.map(orders.validatePDF));
      const metadata = files.map((file, index) => ({
        kind: 'pdf',
        name:
          path
            .basename(Buffer.from(file.originalname, 'latin1').toString('utf8'))
            .replace(/[\x00-\x1f\x7f]/g, '')
            .slice(0, 200) || 'document.pdf',
        pages: pages[index],
      }));
      const saved = await storeFiles(req.user.id, files, metadata, (saved) => saved);
      res
        .status(201)
        .json(files.length === 1 && files[0].fieldname === 'file' ? saved[0] : { files: saved });
    }),
  );
  async function storeFiles(reqOwner, files, metadata, save) {
    const saved = files.map((file, index) => ({
      ...metadata[index],
      id: randomUUID(),
      size: file.size,
    }));
    const release = limits.reserve(
      reqOwner,
      files.reduce((sum, file) => sum + file.size, 0),
      files.length,
    );
    const written = [];
    try {
      const disk = await fs.promises.statfs(directory);
      const bytes = files.reduce((sum, file) => sum + file.size, 0);
      if (disk.bavail * disk.bsize < bytes + 64 * 1024 * 1024)
        throw auth.fail(507, 'Недостаточно свободного места. Обратись к сотруднику.');
      for (let i = 0; i < files.length; i++) {
        const ext = saved[i].kind === 'pdf' ? 'pdf' : saved[i].kind === 'design' ? 'json' : 'png';
        saved[i].storageName = saved[i].id + '.' + ext;
        const target = path.join(directory, 'pdf', saved[i].storageName);
        const handle = await fs.promises.open(target, 'wx', 0o600);
        written.push(target);
        try {
          await handle.writeFile(files[i].buffer);
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
      return db.transaction(() => {
        const insert = db.prepare(
          'INSERT INTO files(id,owner_id,storage_name,name,pages,size,kind) VALUES (?,?,?,?,?,?,?)',
        );
        saved.forEach((file) =>
          insert.run(
            file.id,
            reqOwner,
            file.storageName,
            file.name,
            file.pages,
            file.size,
            file.kind,
          ),
        );
        return save(saved.map(({ storageName, ...file }) => file));
      })();
    } catch (error) {
      await Promise.all(
        written.map((target) =>
          fs.promises
            .unlink(target)
            .catch((cleanup) =>
              console.error('Attachment cleanup failed:', cleanup.code || 'UNLINK_FAILED'),
            ),
        ),
      );
      throw error;
    } finally {
      release();
    }
  }
  function sendFile(req, res, file) {
    if (!file) throw auth.fail(404, 'Файл не найден.');
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
    res
      .attachment(file.name)
      .type(
        file.kind === 'pdf'
          ? 'application/pdf'
          : file.kind === 'design'
            ? 'application/json'
            : 'image/png',
      )
      .sendFile(path.join(directory, 'pdf', file.storage_name));
  }
  app.get('/api/files/:id', required, (req, res) => {
    const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
    if (
      !file ||
      (!['staff', 'admin'].includes(req.user.role) && file.owner_id !== req.user.id) ||
      (['staff', 'admin'].includes(req.user.role) &&
        !db.prepare('SELECT 1 FROM order_files WHERE file_id=?').get(file.id))
    )
      throw auth.fail(404, 'PDF не найден.');
    sendFile(req, res, file);
  });
  app.get('/api/orders', required, (req, res) => {
    const rows = ['staff', 'admin'].includes(req.user.role)
      ? db.prepare('SELECT * FROM orders ORDER BY id DESC').all()
      : db.prepare('SELECT * FROM orders WHERE owner_id=? ORDER BY id DESC').all(req.user.id);
    res.json(rows.map((row) => orders.orderView(db, row)));
  });
  const uploadDesign = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 4, fields: 0, parts: 4 },
  }).any();
  app.post(
    '/api/orders',
    required,
    student,
    (req, res, next) => {
      limits.orders(req.user.id);
      next();
    },
    limits.upload,
    (req, res, next) => (req.is('multipart/form-data') ? uploadDesign(req, res, next) : next()),
    asyncRoute(async (req, res) => {
      if (!req.is('multipart/form-data'))
        return res.status(201).json(
          orders.createOrder(db, req.user, {
            ...req.body,
            priceVersion: Number(req.get('X-Price-Version')),
          }),
        );
      const design = await merch.attachments(req.files);
      const metadata = req.files.map((file) => ({
        kind: file.fieldname,
        name:
          file.fieldname === 'design'
            ? 'design.json'
            : file.fieldname === 'preview'
              ? 'preview.png'
              : 'print-' + file.fieldname + '.png',
        pages: null,
      }));
      const order = await storeFiles(req.user.id, req.files, metadata, (saved) => {
        limits.orders(req.user.id);
        return orders.createOrder(
          db,
          req.user,
          {
            kind: 'merch',
            fileKeys: saved.map((file) => file.id),
            priceVersion: Number(req.get('X-Price-Version')),
          },
          design,
        );
      });
      res.status(201).json(order);
    }),
  );
  app.get('/api/orders/:id', required, (req, res) =>
    res.json(orders.orderView(db, orders.accessibleOrder(db, req.user, req.params.id))),
  );
  app.get('/api/orders/:id/file', required, (req, res) => {
    const order = orders.accessibleOrder(db, req.user, req.params.id);
    if (order.kind !== 'document') throw auth.fail(404, 'PDF не найден.');
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
  app.post('/api/orders/:id/assignment', required, (req, res) =>
    res.json(orders.assignOrder(db, req.user, req.params.id, req.body)),
  );
  app.post('/api/orders/:id/printing', required, (req, res) =>
    res.json(orders.modifyOrder(db, req.user, req.params.id, req.body, 'printing')),
  );
  app.patch('/api/orders/:id/status', required, (req, res) =>
    res.json(orders.modifyOrder(db, req.user, req.params.id, req.body, 'status')),
  );
  app.post('/api/orders/:id/messages', required, (req, res) => {
    orders.accessibleOrder(db, req.user, req.params.id);
    limits.message(req.params.id);
    res.json(orders.modifyOrder(db, req.user, req.params.id, req.body, 'message'));
  });
  app.post('/api/orders/:id/read', required, student, (req, res) => {
    orders.accessibleOrder(db, req.user, req.params.id);
    db.prepare('UPDATE orders SET unread=0 WHERE id=? AND owner_id=?').run(
      req.params.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API не найден.' }));
  if (serverOnly)
    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method)) return next();
      let canonical;
      try {
        canonical = path.posix
          .normalize(decodeURIComponent(req.path).replaceAll('\\', '/'))
          .toLowerCase();
      } catch {
        return next();
      }
      if (!['/', '/index.html'].includes(canonical)) return next();
      const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
      res
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(html.replace('<html lang="ru"', '<html lang="ru" data-mode="server"'));
    });
  app.use(
    express.static(path.join(__dirname, '../dist'), {
      dotfiles: 'deny',
      index: 'index.html',
      setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
    }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof multer.MulterError
        ? 400
        : error.code === 'ENOENT'
          ? 404
          : error.status || 500;
    if (status >= 500) console.error('API error:', error.code || 'INTERNAL_ERROR');
    res.status(status).json({
      ...(error.code === 'PRICE_CHANGED' ? { code: error.code, price: error.price } : {}),
      error:
        status === 507
          ? 'Недостаточно свободного места. Обратись к сотруднику.'
          : status >= 500
            ? 'Не удалось сохранить или загрузить данные. Повтори действие.'
            : error.code === 'ENOENT'
              ? 'Файл не найден.'
              : error.type === 'entity.parse.failed'
                ? 'Некорректный JSON запроса.'
                : error.message,
    });
  });
  return {
    app,
    db,
    async drain() {
      while (operations.size) await Promise.allSettled([...operations]);
    },
    close: () => {
      if (db.open) db.close();
    },
  };
}
module.exports = { createApi };
