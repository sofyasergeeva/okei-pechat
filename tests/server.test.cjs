const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createApi } = require('../server/app.cjs');
const { createUser } = require('../server/auth.cjs');
const params = {
  format: 'A4',
  color: 'mono',
  paper: 'normal',
  binding: 'none',
  duplex: false,
  copies: 1,
  useRange: false,
  range: '',
  comment: '',
};
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'okei-api-test-'));
  let api, server, origin;
  async function start() {
    api = await createApi({ dataDir: directory });
    server = await new Promise((resolve) => {
      const s = api.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    origin = 'http://127.0.0.1:' + server.address().port;
    api.app.locals.origin = origin;
  }
  async function stop() {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    api.close();
  }
  await start();
  t.after(async () => {
    await stop();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('okei-api-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  function client() {
    let cookie = '';
    return async (route, { method = 'GET', body, status = 200, headers = {} } = {}) => {
      const multipart = body instanceof FormData;
      const response = await fetch(origin + route, {
        method,
        headers: {
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      if (Array.isArray(status))
        assert.ok(status.includes(response.status), await response.clone().text());
      else assert.equal(response.status, status, await response.clone().text());
      return response;
    };
  }
  async function register(login) {
    const c = client();
    const r = await c('/api/auth/register', {
      method: 'POST',
      status: 201,
      body: { login, password: 'test-password-2026', name: login, group: 'ИСП-24' },
    });
    return { c, user: await r.json() };
  }
  async function upload(c, bytes) {
    const form = new FormData();
    form.set(
      'file',
      new Blob([bytes || (await fs.readFile(path.join(__dirname, '../dist/assets/sample.pdf')))], {
        type: 'application/pdf',
      }),
      'sample.pdf',
    );
    return c('/api/files', { method: 'POST', body: form, status: 201 });
  }
  return {
    client,
    register,
    upload,
    get api() {
      return api;
    },
    restart: async () => {
      await stop();
      await start();
    },
  };
}
test('HTTP: registration, cookie sessions, roles, ownership and private PDF access', async (t) => {
  const f = await fixture(t),
    { c, user } = await f.register('alice'),
    other = await f.register('bob');
  assert.equal(user.role, 'student');
  assert.match((await c('/api/auth/session')).headers.get('cache-control'), /no-store/);
  const stored = f.api.db
    .prepare('SELECT password_hash FROM users WHERE id=?')
    .get(user.id).password_hash;
  assert.ok(stored.startsWith('scrypt$'));
  assert.ok(!stored.includes('test-password'));
  await other.c('/api/auth/register', {
    method: 'POST',
    status: 400,
    body: { login: 'attacker', password: 'test-password', name: 'X', group: 'X', role: 'staff' },
  });
  const file = await (await f.upload(c)).json();
  assert.equal(file.pages, 3);
  const order = await (
    await c('/api/orders', {
      method: 'POST',
      status: 201,
      body: {
        fileKey: file.id,
        params: { ...params, pages: 999 },
        total: 1,
        owner_id: other.user.id,
        role: 'staff',
      },
    })
  ).json();
  assert.equal(order.total, 12);
  assert.equal(order.params.pages, 3);
  assert.equal(order.customer.name, 'alice');
  await other.c('/api/orders/' + order.id, { status: 404 });
  await other.c('/api/files/' + file.id, { status: 404 });
  await other.c('/api/orders/' + order.id + '/file', { status: 404 });
  await f.client()('/api/orders', { status: 401 });
  const pdf = await c('/api/orders/' + order.id + '/file');
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition'), /^attachment/);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    '%PDF-',
  );
  await c('/api/orders', {
    method: 'POST',
    status: 403,
    headers: { Origin: 'https://example.org' },
    body: {},
  });
  await c('/api/auth/logout', { method: 'POST' });
  assert.equal(await (await c('/api/auth/session')).json(), null);
  const login = await c('/api/auth/login', {
    method: 'POST',
    body: { login: 'ALICE', password: 'test-password-2026' },
  });
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await login.json()).id, user.id);
});
test('HTTP: two independent sessions exchange statuses/messages; conflicts rejected; restart persists data and PDFs', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('customer');
  await createUser(
    f.api.db,
    { login: 'operator', password: 'test-password-2026', name: 'Operator', group: 'Print' },
    'staff',
  );
  const staff = f.client();
  await staff('/api/auth/login', {
    method: 'POST',
    body: { login: 'operator', password: 'test-password-2026' },
  });
  const file = await (await f.upload(c)).json();
  let o = await (
    await c('/api/orders', {
      method: 'POST',
      status: 201,
      body: { fileKey: file.id, params: { ...params, copies: 2, duplex: true } },
    })
  ).json();
  assert.equal(o.total, 20);
  assert.equal(o.quote.sheets, 4);
  assert.equal((await (await staff('/api/orders')).json())[0].id, o.id);
  await c('/api/orders/' + o.id + '/status', {
    method: 'PATCH',
    status: 403,
    body: { version: o.version, status: 'work', checked: true },
  });
  await staff('/api/orders/' + o.id + '/status', {
    method: 'PATCH',
    status: 400,
    body: { version: o.version, status: 'work' },
  });
  o = await (
    await staff('/api/orders/' + o.id + '/messages', {
      method: 'POST',
      body: { version: o.version, text: 'Confirm mono?', pause: true },
    })
  ).json();
  assert.equal(o.status, 'attention');
  assert.equal(o.unread, 1);
  await c('/api/orders/' + o.id + '/messages', {
    method: 'POST',
    status: 409,
    body: { version: 1, text: 'Old snapshot' },
  });
  o = await (
    await c('/api/orders/' + o.id + '/messages', {
      method: 'POST',
      body: { version: o.version, text: 'Confirmed' },
    })
  ).json();
  assert.equal(o.status, 'review');
  for (const status of ['work', 'ready']) {
    if (status === 'ready')
      o = await (
        await staff('/api/orders/' + o.id + '/printing', {
          method: 'POST',
          body: { version: o.version },
        })
      ).json();
    o = await (
      await staff('/api/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: { version: o.version, status, checked: true },
      })
    ).json();
  }
  await staff('/api/orders/' + o.id + '/status', {
    method: 'PATCH',
    status: 400,
    body: { version: o.version, status: 'issued' },
  });
  o = await (
    await staff('/api/orders/' + o.id + '/status', {
      method: 'PATCH',
      body: { version: o.version, status: 'issued', paid: true },
    })
  ).json();
  assert.equal(o.payment, 'paid');
  await f.restart();
  const saved = await (await c('/api/orders/' + o.id)).json();
  assert.deepEqual(saved, o);
  assert.equal((await staff('/api/orders/' + o.id + '/file')).status, 200);
});
test('HTTP: failed transaction leaves no order or event; retry saves exactly once', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('failure'),
    file = await (await f.upload(c)).json();
  f.api.db.exec(
    "CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END",
  );
  await c('/api/orders', { method: 'POST', status: 500, body: { fileKey: file.id, params } });
  assert.deepEqual(await (await c('/api/orders')).json(), []);
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
  f.api.db.exec('DROP TRIGGER fail_event');
  await c('/api/orders', { method: 'POST', status: 201, body: { fileKey: file.id, params } });
  assert.equal((await (await c('/api/orders')).json()).length, 1);
});
test('HTTP: invalid files, parameters and login attempts are rejected', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('validation');
  const bad = new FormData();
  bad.set('file', new Blob(['not PDF']), 'fake.pdf');
  await c('/api/files', { method: 'POST', status: 400, body: bad });
  const file = await (await f.upload(c)).json();
  for (const patch of [
    { copies: 0 },
    { copies: 1.2 },
    { copies: 100 },
    { format: 'A0' },
    { paper: 'photo', duplex: true },
    { useRange: true, range: '999' },
    { useRange: true, range: '' },
  ])
    await c('/api/orders', {
      method: 'POST',
      status: 400,
      body: { fileKey: file.id, params: { ...params, ...patch } },
    });
  assert.equal((await (await c('/api/orders')).json()).length, 0);
  for (let i = 0; i < 10; i++)
    await c('/api/auth/login', {
      method: 'POST',
      status: 401,
      body: { login: 'missing', password: 'wrong-password' },
    });
  await c('/api/auth/login', {
    method: 'POST',
    status: 429,
    body: { login: 'missing', password: 'wrong-password' },
  });
});

test('API client: invalidating a session rejects a delayed response from the previous account', async () => {
  const { createApiClient } = await import('../dist/api.mjs');
  const original = globalThis.fetch;
  let respond;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      respond = resolve;
    });
  try {
    const api = createApiClient(),
      pending = api.request('/orders');
    api.invalidate();
    respond(new Response('[]', { headers: { 'Content-Type': 'application/json' } }));
    await assert.rejects(pending, /Сессия изменилась/);
  } finally {
    globalThis.fetch = original;
  }
});
test('HTTP: customer cancellation, validation errors and revoked/expired sessions', async (t) => {
  const f = await fixture(t),
    { c, user } = await f.register('cancel_customer'),
    file = await (await f.upload(c)).json();
  let order = await (
    await c('/api/orders', { method: 'POST', status: 201, body: { fileKey: file.id, params } })
  ).json();
  await c('/api/orders/' + order.id + '/status', { method: 'PATCH', body: null, status: 400 });
  order = await (
    await c('/api/orders/' + order.id + '/status', {
      method: 'PATCH',
      body: { version: order.version, status: 'cancelled' },
    })
  ).json();
  assert.equal(order.status, 'cancelled');
  assert.equal(order.events.length, 2);
  await c('/api/orders/' + order.id + '/status', {
    method: 'PATCH',
    status: 403,
    body: { version: order.version, status: 'work' },
  });
  const login = await c('/api/auth/login', {
    method: 'POST',
    body: { login: 'cancel_customer', password: 'test-password-2026' },
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  await c('/api/auth/logout', { method: 'POST' });
  await f.client()('/api/orders', { headers: { Cookie: cookie }, status: 401 });
  await c('/api/auth/login', {
    method: 'POST',
    body: { login: 'cancel_customer', password: 'test-password-2026' },
  });
  f.api.db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(user.id);
  await c('/api/orders', { status: 401 });
});

test('Process restart: a fresh Node process restores the account, session, order and PDF', async (t) => {
  const { spawn } = require('node:child_process'),
    net = require('node:net');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'okei-process-test-'));
  const port = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
  const origin = 'http://127.0.0.1:' + port;
  let child;
  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, '../server/index.cjs')], {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        PUBLIC_ORIGIN: origin,
        DATA_DIR: directory,
        NODE_ENV: 'test',
        COOKIE_SECURE: 'false',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timeout')), 10000);
      child.once('error', reject);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(Error('Server exited: ' + code));
      });
      child.stdout.once('data', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill();
    });
  }
  t.after(async () => {
    await stop();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('okei-process-test-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  await start();
  let r = await fetch(origin + '/api/auth/register', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: 'restart_customer',
      password: 'restart-password',
      name: 'Restart',
      group: 'TEST',
    }),
  });
  assert.equal(r.status, 201);
  const user = await r.json(),
    cookie = r.headers.get('set-cookie').split(';')[0];
  const form = new FormData();
  form.set(
    'file',
    new Blob([await fs.readFile(path.join(__dirname, '../dist/assets/sample.pdf'))]),
    'sample.pdf',
  );
  r = await fetch(origin + '/api/files', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie },
    body: form,
  });
  assert.equal(r.status, 201);
  const file = await r.json();
  r = await fetch(origin + '/api/orders', {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileKey: file.id, params }),
  });
  assert.equal(r.status, 201);
  const order = await r.json();
  await stop();
  await start();
  r = await fetch(origin + '/api/auth/session', { headers: { Cookie: cookie } });
  assert.equal((await r.json()).id, user.id);
  r = await fetch(origin + '/api/orders/' + order.id, { headers: { Cookie: cookie } });
  assert.deepEqual(await r.json(), order);
  r = await fetch(origin + '/api/orders/' + order.id + '/file', { headers: { Cookie: cookie } });
  assert.equal(
    Buffer.from(await r.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    '%PDF-',
  );
});

async function operator(f) {
  await createUser(
    f.api.db,
    { login: 'operator_test', password: 'test-password-2026', name: 'Operator', group: 'Print' },
    'staff',
  );
  const staff = f.client();
  await staff('/api/auth/login', {
    method: 'POST',
    body: { login: 'operator_test', password: 'test-password-2026' },
  });
  return staff;
}
async function newOrder(c, fileKeys, options = {}) {
  return (
    await c('/api/orders', {
      method: 'POST',
      status: 201,
      body: { fileKeys, params: { ...params, ...options } },
    })
  ).json();
}
test('Cancellation: allowed in work before printing, idempotent, private and atomic against start', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('cancel_before_print'),
    other = await f.register('foreign_cancel'),
    staff = await operator(f),
    file = await (await f.upload(c)).json();
  let o = await newOrder(c, [file.id]);
  o = await (
    await staff('/api/orders/' + o.id + '/status', {
      method: 'PATCH',
      body: { version: o.version, status: 'work', checked: true },
    })
  ).json();
  assert.equal(o.canCancel, true);
  await c('/api/orders/' + o.id + '/printing', {
    method: 'POST',
    body: { version: o.version },
    status: 403,
  });
  await staff('/api/orders/' + o.id + '/status', {
    method: 'PATCH',
    body: { version: o.version, status: 'ready' },
    status: 409,
  });
  await other.c('/api/orders/' + o.id + '/status', {
    method: 'PATCH',
    body: { version: o.version, status: 'cancelled' },
    status: 404,
  });
  const cancelled = await (
    await c('/api/orders/' + o.id + '/status', {
      method: 'PATCH',
      body: { version: o.version, status: 'cancelled' },
    })
  ).json();
  assert.ok(cancelled.cancelledAt);
  assert.equal(cancelled.printingStartedAt, null);
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(
    await (
      await c('/api/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: { version: o.version, status: 'cancelled' },
      })
    ).json(),
    cancelled,
  );
  assert.equal((await staff('/api/orders/' + o.id + '/files/' + file.id)).status, 200);
  for (const startFirst of [true, false]) {
    o = await newOrder(c, [file.id]);
    o = await (
      await staff('/api/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: { version: o.version, status: 'work', checked: true },
      })
    ).json();
    const start = () =>
      staff('/api/orders/' + o.id + '/printing', {
        method: 'POST',
        body: { version: o.version },
        status: [200, 409],
      });
    const cancel = () =>
      c('/api/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: { version: o.version, status: 'cancelled' },
        status: [200, 409],
      });
    const outcomes = await Promise.all(startFirst ? [start(), cancel()] : [cancel(), start()]);
    assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 409]);
    const saved = await (await c('/api/orders/' + o.id)).json();
    assert.notEqual(Boolean(saved.printingStartedAt), saved.status === 'cancelled');
    if (saved.printingStartedAt) {
      assert.equal(saved.canCancel, false);
      await c('/api/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: { version: saved.version, status: 'cancelled' },
        status: 409,
      });
    }
  }
  await f.restart();
  assert.deepEqual(await (await c('/api/orders/' + cancelled.id)).json(), cancelled);
});
test('Multiple PDFs: independent odd duplex/binding totals, every attachment protected, messages persist', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('multi_pdf'),
    other = await f.register('multi_foreign'),
    staff = await operator(f);
  const { PDFDocument } = require('pdf-lib'),
    pdf = await PDFDocument.create();
  pdf.addPage();
  const one = Buffer.from(await pdf.save()),
    three = await fs.readFile(path.join(__dirname, '../dist/assets/sample.pdf'));
  const form = new FormData();
  form.append('files', new Blob([three]), 'Первый.pdf');
  form.append('files', new Blob([one]), 'Второй.pdf');
  const uploaded = await (
    await c('/api/files', { method: 'POST', body: form, status: 201 })
  ).json();
  assert.equal(uploaded.files[0].name, 'Первый.pdf');
  assert.deepEqual(
    uploaded.files.map((f) => f.pages),
    [3, 1],
  );
  let o = await newOrder(
    c,
    uploaded.files.map((f) => f.id),
    { duplex: true, copies: 2, binding: 'spiral' },
  );
  assert.equal(o.total, 428);
  const { calculateDocumentsQuote } = await import('../dist/customer/orders.mjs');
  const { loadOrderMath } = require('./customer-harness.cjs');
  assert.deepEqual(
    calculateDocumentsQuote(
      { ...params, duplex: true, copies: 2, binding: 'spiral', files: uploaded.files },
      loadOrderMath(),
    ).q,
    o.quote,
  );
  assert.equal(o.quote.print, 28);
  assert.equal(o.quote.sheets, 6);
  assert.equal(o.quote.binding, 400);
  assert.deepEqual(
    o.files.map((f) => f.quote.total),
    [220, 208],
  );
  for (let i = 0; i < o.files.length; i++) {
    const file = o.files[i],
      r = await staff('/api/orders/' + o.id + '/files/' + file.id);
    assert.match(r.headers.get('content-disposition'), /^attachment/);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), i === 0 ? three : one);
    await other.c('/api/orders/' + o.id + '/files/' + file.id, { status: 404 });
    await staff('/api/files/' + file.id);
  }
  o = await (
    await staff('/api/orders/' + o.id + '/messages', {
      method: 'POST',
      body: { version: o.version, text: 'Both files received', pause: true },
    })
  ).json();
  o = await (
    await c('/api/orders/' + o.id + '/messages', {
      method: 'POST',
      body: { version: o.version, text: 'Print both' },
    })
  ).json();
  await f.restart();
  assert.deepEqual(await (await staff('/api/orders/' + o.id)).json(), o);
  await c('/api/orders', {
    method: 'POST',
    status: 400,
    body: { fileKeys: [o.files[0].id, 'missing'], params },
  });
  await c('/api/orders', {
    method: 'POST',
    status: 400,
    body: { fileKeys: o.files.map((f) => f.id), params: { ...params, useRange: true, range: '2' } },
  });
  assert.equal((await (await c('/api/orders')).json()).length, 1);
});
test('Batch failure: bad PDF, excess count, failed metadata and attachment writes leave no partial order', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('batch_failure'),
    bytes = await fs.readFile(path.join(__dirname, '../dist/assets/sample.pdf'));
  const form = new FormData();
  form.append('files', new Blob([bytes]), 'good.pdf');
  form.append('files', new Blob(['%PDF-1.7\ninvalid']), 'bad.pdf');
  await c('/api/files', { method: 'POST', body: form, status: 400 });
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM files').get().n, 0);
  assert.deepEqual(await fs.readdir(path.join(f.api.db.name, '../pdf')), []);
  const excess = new FormData();
  for (let i = 0; i < 11; i++) excess.append('files', new Blob([bytes]), i + '.pdf');
  await c('/api/files', { method: 'POST', body: excess, status: 400 });
  f.api.db.exec(
    "CREATE TRIGGER fail_second_file BEFORE INSERT ON files WHEN NEW.name='fail.pdf' BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  const batch = new FormData();
  batch.append('files', new Blob([bytes]), 'good.pdf');
  batch.append('files', new Blob([bytes]), 'fail.pdf');
  await c('/api/files', { method: 'POST', body: batch, status: 500 });
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM files').get().n, 0);
  assert.deepEqual(await fs.readdir(path.join(f.api.db.name, '../pdf')), []);
  f.api.db.exec('DROP TRIGGER fail_second_file');
  const a = await (await f.upload(c)).json(),
    b = await (await f.upload(c)).json();
  f.api.db.exec(
    "CREATE TRIGGER fail_attachment BEFORE INSERT ON order_files WHEN NEW.position=1 BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  await c('/api/orders', { method: 'POST', status: 500, body: { fileKeys: [a.id, b.id], params } });
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM order_files').get().n, 0);
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
});
test('Migration v1: existing single-PDF order, exact price, messages and file survive repeatable upgrade', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('legacy_single'),
    file = await (await f.upload(c)).json();
  let o = await newOrder(c, [file.id]);
  o = await (
    await c('/api/orders/' + o.id + '/messages', {
      method: 'POST',
      body: { version: o.version, text: 'Legacy message' },
    })
  ).json();
  f.api.db.exec(
    'DROP TABLE order_files; ALTER TABLE orders DROP COLUMN printing_started_at; ALTER TABLE orders DROP COLUMN cancelled_at; PRAGMA user_version=1;',
  );
  await f.restart();
  const migrated = await (await c('/api/orders/' + o.id)).json();
  assert.deepEqual(migrated, o);
  assert.equal(f.api.db.pragma('user_version', { simple: true }), 2);
  assert.equal(migrated.files.length, 1);
  await c('/api/orders/' + o.id + '/file');
  await f.restart();
  assert.deepEqual(await (await c('/api/orders/' + o.id)).json(), o);
});
