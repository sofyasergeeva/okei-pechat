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
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'okei-api-test-'));
  let api, server, origin;
  async function start() {
    api = await createApi({ dataDir: directory, ...options });
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
    await api.drain();
    api.close();
  }
  await start();
  t.after(async () => {
    await stop();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('okei-api-test-'));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
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
  async function upload(c, bytes, status = 201) {
    const form = new FormData();
    form.set(
      'file',
      new Blob([bytes || (await fs.readFile(path.join(__dirname, '../dist/assets/sample.pdf')))], {
        type: 'application/pdf',
      }),
      'sample.pdf',
    );
    return c('/api/files', { method: 'POST', body: form, status });
  }
  return {
    directory,
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
test('Migration v1/v2: existing single-PDF order, exact price, messages and file survive repeatable upgrade', async (t) => {
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
    'DROP TABLE order_files; ALTER TABLE orders DROP COLUMN printing_started_at; ALTER TABLE orders DROP COLUMN cancelled_at; ALTER TABLE orders DROP COLUMN kind; ALTER TABLE files DROP COLUMN kind; PRAGMA user_version=1;',
  );
  await f.restart();
  const migrated = await (await c('/api/orders/' + o.id)).json();
  assert.deepEqual(migrated, o);
  assert.equal(f.api.db.pragma('user_version', { simple: true }), 4);
  assert.equal(migrated.files.length, 1);
  f.api.db.exec(
    'ALTER TABLE orders DROP COLUMN kind; ALTER TABLE files DROP COLUMN kind; PRAGMA user_version=2;',
  );
  await f.restart();
  assert.equal(f.api.db.pragma('user_version', { simple: true }), 4);
  assert.deepEqual(await (await c('/api/orders/' + o.id)).json(), o);
  assert.deepEqual(f.api.db.pragma('foreign_key_check'), []);
  await c('/api/orders/' + o.id + '/file');
  await f.restart();
  assert.deepEqual(await (await c('/api/orders/' + o.id)).json(), o);
});

let merchImages;
function merchPackage(design, patch = {}) {
  if (!merchImages) {
    const { PNG } = require('../node_modules/playwright-core/lib/utilsBundle.js');
    merchImages = {
      preview: PNG.sync.write(new PNG({ width: 1440, height: 1000 })),
      front: PNG.sync.write(new PNG({ width: 2400, height: 3368 })),
    };
  }
  const body = new FormData();
  body.set(
    'design',
    new Blob([JSON.stringify(design)], { type: 'application/json' }),
    'design.json',
  );
  body.set('preview', new Blob([patch.preview || merchImages.preview]), 'preview.png');
  for (const side of ['front', 'back'])
    if (design[side]?.length && patch.omit !== side)
      body.set(side, new Blob([patch[side] || merchImages.front]), side + '.png');
  return body;
}
test('Merch: shared queue, validated price, private production files, cancellation and restart', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('merch_customer'),
    other = await f.register('merch_other'),
    staff = await operator(f);
  const design = require('../dist/studio/model.mjs').fresh();
  design.size = 'L';
  design.count = 2;
  design.total = 1;
  let order = await (
    await c('/api/orders', { method: 'POST', status: 201, body: merchPackage(design) })
  ).json();
  assert.equal(order.kind, 'merch');
  assert.equal(order.total, 1900);
  assert.equal(order.params.size, 'L');
  assert.equal(order.params.copies, 2);
  assert.deepEqual(
    order.files.map((file) => file.kind),
    ['design', 'preview', 'front'],
  );
  assert.ok(order.files.every((file) => file.pages === null));
  for (const file of order.files) {
    await other.c('/api/orders/' + order.id + '/files/' + file.id, { status: 404 });
    await other.c('/api/files/' + file.id, { status: 404 });
    const response = await staff('/api/orders/' + order.id + '/files/' + file.id);
    assert.match(response.headers.get('content-disposition'), /^attachment/);
    if (file.kind === 'design') assert.deepEqual(await response.json(), design);
    else assert.deepEqual(Buffer.from(await response.arrayBuffer()), merchImages[file.kind]);
  }
  order = await (
    await staff('/api/orders/' + order.id + '/status', {
      method: 'PATCH',
      body: { version: order.version, status: 'work', checked: true },
    })
  ).json();
  assert.equal(order.canCancel, true);
  order = await (
    await c('/api/orders/' + order.id + '/status', {
      method: 'PATCH',
      body: { version: order.version, status: 'cancelled' },
    })
  ).json();
  assert.ok(order.cancelledAt);
  let made = await (
    await c('/api/orders', { method: 'POST', status: 201, body: merchPackage(design) })
  ).json();
  made = await (
    await staff('/api/orders/' + made.id + '/status', {
      method: 'PATCH',
      body: { version: made.version, status: 'work', checked: true },
    })
  ).json();
  made = await (
    await staff('/api/orders/' + made.id + '/printing', {
      method: 'POST',
      body: { version: made.version },
    })
  ).json();
  assert.ok(made.printingStartedAt);
  assert.equal(made.canCancel, false);
  await c('/api/orders/' + made.id + '/status', {
    method: 'PATCH',
    status: 409,
    body: { version: made.version, status: 'cancelled' },
  });
  made = await (
    await staff('/api/orders/' + made.id + '/messages', {
      method: 'POST',
      body: { version: made.version, text: 'Production files received' },
    })
  ).json();
  made = await (
    await c('/api/orders/' + made.id + '/messages', {
      method: 'POST',
      body: { version: made.version, text: 'Confirmed' },
    })
  ).json();
  await f.restart();
  assert.deepEqual(await (await staff('/api/orders/' + made.id)).json(), made);
  for (const file of made.files) await staff('/api/orders/' + made.id + '/files/' + file.id);
});
test('Merch: missing or invalid assets and failed transaction never create a partial order', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('merch_failure'),
    fresh = require('../dist/studio/model.mjs').fresh;
  for (const design of [
    { ...fresh(), size: 'XXL' },
    { ...fresh(), count: 0 },
    { ...fresh(), front: [{ ...fresh().front[0], src: 'https://example.org/image.png' }] },
  ])
    await c('/api/orders', { method: 'POST', status: 400, body: merchPackage(design) });
  await c('/api/orders', {
    method: 'POST',
    status: 400,
    body: merchPackage(fresh(), { omit: 'front' }),
  });
  await c('/api/orders', {
    method: 'POST',
    status: 400,
    body: merchPackage(fresh(), { front: Buffer.from('not a PNG') }),
  });
  f.api.db.exec(
    "CREATE TRIGGER fail_merch_attachment BEFORE INSERT ON order_files WHEN NEW.position=1 BEGIN SELECT RAISE(ABORT,'test'); END",
  );
  await c('/api/orders', { method: 'POST', status: 500, body: merchPackage(fresh()) });
  for (const table of ['orders', 'files', 'events', 'order_files'])
    assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM ' + table).get().n, 0);
  assert.deepEqual(await fs.readdir(path.join(f.api.db.name, '../pdf')), []);
  f.api.db.exec('DROP TRIGGER fail_merch_attachment');
  await c('/api/orders', { method: 'POST', status: 201, body: merchPackage(fresh()) });
  assert.equal((await (await c('/api/orders')).json()).length, 1);
});
test('Polling: one in-flight read, visible sessions only, recovery after failure and stop on logout', async (t) => {
  const { createApiClient, createOrderPolling } = await import('../dist/api.mjs');
  const original = globalThis.fetch;
  let release,
    requests = 0;
  globalThis.fetch = () => {
    requests++;
    return new Promise((resolve) => {
      release = () =>
        resolve(new Response('[]', { headers: { 'Content-Type': 'application/json' } }));
    });
  };
  try {
    const api = createApiClient(),
      one = api.request('/orders'),
      two = api.request('/orders');
    assert.equal(one, two);
    assert.equal(requests, 1);
    release();
    await one;
  } finally {
    globalThis.fetch = original;
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const document = {
    hidden: false,
    addEventListener(type, fn) {
      this[type] = fn;
    },
  };
  let calls = 0,
    finish,
    fail = false,
    active = true;
  const polling = createOrderPolling({
    document,
    active: () => active,
    update: async () => {
      calls++;
      if (fail) {
        fail = false;
        throw Error('Temporary network failure');
      }
      await new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const flush = () => new Promise(setImmediate);
  polling.start();
  t.mock.timers.tick(27000);
  assert.equal(calls, 1);
  document.visibilitychange();
  t.mock.timers.tick(54000);
  assert.equal(calls, 1);
  finish();
  await flush();
  document.hidden = true;
  document.visibilitychange();
  t.mock.timers.tick(54000);
  assert.equal(calls, 1);
  document.hidden = false;
  fail = true;
  document.visibilitychange();
  await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(27000);
  assert.equal(calls, 3);
  finish();
  await flush();
  active = false;
  t.mock.timers.tick(27000);
  assert.equal(calls, 3);
  polling.stop();
  active = true;
  t.mock.timers.tick(54000);
  assert.equal(calls, 3);
});

test('Limits: failed filesystem writes roll back, concurrent uploads respect quotas, orders/users/messages are bounded', async (t) => {
  const bytes = await fs.readFile(path.join(__dirname, '../dist/assets/sample.pdf'));
  const f = await fixture(t, {
    limits: {
      userBytes: bytes.length,
      totalBytes: bytes.length * 2,
      userOrders: 1,
      totalOrders: 2,
      users: 3,
    },
  });
  const { c, user } = await f.register('quota_alice');
  const originalOpen = fs.open;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (String(args[0]).startsWith(path.join(f.directory, 'pdf'))) {
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async () => {
        await write(Buffer.from('partial'));
        throw Object.assign(Error('simulated disk failure'), { code: 'ENOSPC' });
      };
    }
    return handle;
  };
  try {
    await f.upload(c, bytes, 500);
  } finally {
    fs.open = originalOpen;
  }
  assert.deepEqual(await fs.readdir(path.join(f.directory, 'pdf')), []);
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM files').get().n, 0);
  const statfs = fs.statfs;
  fs.statfs = async () => ({ bavail: 0, bsize: 4096 });
  try {
    await f.upload(c, bytes, 507);
  } finally {
    fs.statfs = statfs;
  }
  assert.deepEqual(await fs.readdir(path.join(f.directory, 'pdf')), []);
  const results = await Promise.all([
    f.upload(c, bytes, [201, 413, 429]),
    f.upload(c, bytes, [201, 413, 429]),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  const file = await results.find((r) => r.status === 201).json();
  const bob = await f.register('quota_bob'),
    carol = await f.register('quota_carol');
  const second = await (await f.upload(bob.c, bytes)).json();
  await f.upload(carol.c, bytes, 413);
  await f.register('quota_excess').then(
    () => assert.fail('Registration must be rejected'),
    (error) => assert.match(error.message, /429/),
  );
  const order = await newOrder(c, [file.id]);
  await c('/api/orders', { method: 'POST', status: 429, body: { fileKey: file.id, params } });
  await newOrder(bob.c, [second.id]);
  await carol.c('/api/orders', { method: 'POST', status: 429, body: { fileKey: file.id, params } });
  const insert = f.api.db.prepare('INSERT INTO messages VALUES (?,?,?,?,?)');
  f.api.db.transaction(() => {
    for (let i = 0; i < 200; i++)
      insert.run('quota-' + i, order.id, 'user', 'bounded', new Date().toISOString());
  })();
  await c('/api/orders/' + order.id + '/messages', {
    method: 'POST',
    status: 429,
    body: { version: order.version, text: 'beyond limit' },
  });
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM messages').get().n, 200);
  assert.equal(f.api.db.prepare('SELECT SUM(size) n FROM files').get().n, bytes.length * 2);
  assert.equal(f.api.db.prepare('SELECT COUNT(*) n FROM files WHERE owner_id=?').get(user.id).n, 1);
  const row = f.api.db.prepare('SELECT storage_name FROM files WHERE id=?').get(file.id);
  await fs.unlink(path.join(f.directory, 'pdf', row.storage_name));
  const missing = await c('/api/files/' + file.id, { status: 404 });
  assert.deepEqual(await missing.json(), { error: 'Файл не найден.' });
});

test('Backup: live WAL snapshot restores multiple PDF/merch orders and every byte; damaged backups and overwrite are rejected', async (t) => {
  const { createBackup, restoreBackup } = require('../server/backup.cjs');
  const f = await fixture(t),
    { c } = await f.register('backup_customer');
  const staff = await operator(f);
  const first = await (await f.upload(c)).json(),
    second = await (await f.upload(c)).json();
  let pdf = await newOrder(c, [first.id, second.id]);
  pdf = await (
    await staff('/api/orders/' + pdf.id + '/messages', {
      method: 'POST',
      body: { version: pdf.version, text: 'Saved before backup' },
    })
  ).json();
  const merch = await (
    await c('/api/orders', {
      method: 'POST',
      status: 201,
      body: merchPackage(require('../dist/studio/model.mjs').fresh()),
    })
  ).json();
  assert.ok((await fs.stat(path.join(f.directory, 'okei.sqlite-wal'))).size > 0);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'okei-backup-test-'));
  let restored, server;
  t.after(async () => {
    if (server)
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    restored?.close();
    assert.equal(path.dirname(temp), os.tmpdir());
    assert.ok(path.basename(temp).startsWith('okei-backup-test-'));
    await fs.rm(temp, { recursive: true, force: true });
  });
  const snapshot = path.join(temp, 'snapshot'),
    destination = path.join(temp, 'restored');
  await createBackup(f.directory, snapshot);
  await c('/api/orders/' + pdf.id + '/messages', {
    method: 'POST',
    body: { version: pdf.version, text: 'Only in live database' },
  });
  await f.restart();
  await restoreBackup(snapshot, destination);
  restored = await createApi({ dataDir: destination });
  assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  server = await new Promise((resolve) => {
    const s = restored.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  restored.app.locals.origin = origin;
  const login = await fetch(origin + '/api/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'backup_customer', password: 'test-password-2026' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const response = await fetch(origin + '/api/orders', { headers: { Cookie: cookie } });
  assert.deepEqual(await response.json(), [merch, pdf]);
  const rows = restored.db.prepare('SELECT storage_name,size FROM files').all();
  assert.equal(rows.length, 5);
  for (const row of rows)
    assert.deepEqual(
      await fs.readFile(path.join(destination, 'pdf', row.storage_name)),
      await fs.readFile(path.join(f.directory, 'pdf', row.storage_name)),
    );
  for (const order of [pdf, merch])
    for (const file of order.files) {
      const r = await fetch(origin + '/api/orders/' + order.id + '/files/' + file.id, {
        headers: { Cookie: cookie },
      });
      assert.equal(r.status, 200);
      assert.equal((await r.arrayBuffer()).byteLength, file.size);
    }
  const partial = path.join(temp, 'partial-restore');
  const copyFile = fs.copyFile;
  fs.copyFile = async (from, to, ...args) => {
    if (String(to).startsWith(path.join(partial, 'pdf')))
      throw Object.assign(Error('simulated copy failure'), { code: 'ENOSPC' });
    return copyFile(from, to, ...args);
  };
  try {
    await assert.rejects(restoreBackup(snapshot, partial), /simulated copy failure/);
  } finally {
    fs.copyFile = copyFile;
  }
  assert.throws(() => require('../server/db.cjs').openDatabase(partial), /Incomplete restore/);
  await assert.rejects(restoreBackup(snapshot, destination), /already exists/);
  await assert.rejects(createBackup(f.directory, path.join(f.directory, 'nested')), /separate/);
  const file = path.join(snapshot, 'pdf', rows[0].storage_name),
    damaged = await fs.readFile(file);
  damaged[0] ^= 1;
  await fs.writeFile(file, damaged);
  await assert.rejects(restoreBackup(snapshot, path.join(temp, 'damaged')), /checksum/);
  assert.equal(require('node:fs').existsSync(path.join(temp, 'damaged')), false);
});

test('Production boundary: server-only entry, secure cookies, CSRF/Host, private paths, body limits and untrusted proxy headers', async (t) => {
  const f = await fixture(t, { serverOnly: true, secureCookies: true }),
    anonymous = f.client();
  const registration = await anonymous('/api/auth/register', {
    method: 'POST',
    status: 201,
    body: {
      login: 'secure_customer',
      password: 'test-password-2026',
      name: 'Secure',
      group: 'Test',
    },
  });
  assert.match(
    registration.headers.get('set-cookie'),
    /__Host-okei.sid=.*HttpOnly; Secure; SameSite=Strict/,
  );
  for (const route of [
    '/',
    '/index.html?mode=demo',
    '/%69ndex.html?mode=demo',
    '//index.html?mode=demo',
  ]) {
    const r = await anonymous(route);
    assert.match(await r.text(), /data-mode="server"/);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  }
  await anonymous('/healthz');
  await anonymous('/api/auth/login', {
    method: 'POST',
    status: 400,
    body: { login: { toString: null, valueOf: null }, password: 'invalid-password' },
  });
  for (const route of [
    '/.env',
    '/server/auth.cjs',
    '/package.json',
    '/var/okei/okei.sqlite',
    '/backups/manifest.json',
  ])
    await anonymous(route, { status: 404 });
  await anonymous('/api/profile', {
    method: 'PATCH',
    status: 403,
    headers: { Origin: 'https://evil.example' },
    body: { name: 'Changed', group: 'Test' },
  });
  await anonymous('/api/profile', {
    method: 'PATCH',
    status: 403,
    headers: { Origin: '' },
    body: { name: 'Changed', group: 'Test' },
  });
  const hostStatus = await new Promise((resolve, reject) => {
    require('node:http')
      .get(
        f.api.app.locals.origin + '/api/orders',
        { headers: { Host: 'evil.example' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
      .on('error', reject);
  });
  assert.equal(hostStatus, 403);
  await anonymous('/api/profile', {
    method: 'PATCH',
    status: 413,
    body: { name: 'x'.repeat(34000), group: 'Test' },
  });
  for (let i = 0; i < 11; i++)
    await anonymous('/api/auth/login', {
      method: 'POST',
      status: i < 10 ? 401 : 429,
      headers: { 'X-Forwarded-For': '192.0.2.' + (i + 1) },
      body: { login: 'unknown_user', password: 'bad-password-2026' },
    });
  const sessions = require('../server/auth.cjs').createSessions(f.api.db);
  const account = f.api.db.prepare('SELECT id FROM users WHERE login=?').get('secure_customer');
  for (let i = 0; i < 12; i++) sessions.issue({ cookie() {} }, account);
  assert.equal(
    f.api.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(account.id).n,
    10,
  );
  const link = path.join(f.directory, 'public-link');
  await fs.symlink(path.join(__dirname, '../dist'), link, 'junction');
  assert.throws(() => require('../server/db.cjs').openDatabase(link), /outside dist/);
  const unsafe = path.join(f.directory, 'unsafe');
  await fs.mkdir(unsafe);
  await fs.symlink(path.join(__dirname, '../dist'), path.join(unsafe, 'pdf'), 'junction');
  assert.throws(() => require('../server/db.cjs').openDatabase(unsafe), /must not be a symlink/);
});

test('Personnel: admin-only management, validated changes, session revocation and last-admin protection', async (t) => {
  const f = await fixture(t),
    student = await f.register('personnel_student'),
    staff = await operator(f);
  const user = await createUser(
    f.api.db,
    {
      login: 'personnel_admin',
      password: 'test-password-2026',
      name: 'Admin',
      group: 'Типография',
    },
    'admin',
  );
  const admin = f.client();
  await admin('/api/auth/login', {
    method: 'POST',
    body: { login: user.login, password: 'test-password-2026' },
  });
  for (const c of [student.c, staff]) {
    await c('/api/staff', { status: 403 });
    await c('/api/staff', {
      method: 'POST',
      status: 403,
      body: { login: 'forbidden', name: 'X', password: 'test-password-2026' },
    });
    await c('/api/staff/' + user.id, { method: 'PATCH', status: 403, body: { active: false } });
  }
  await f.client()('/api/staff', { status: 401 });
  await student.c('/api/auth/register', {
    method: 'POST',
    status: 400,
    body: {
      login: 'self_admin',
      password: 'test-password-2026',
      name: 'X',
      group: 'X',
      role: 'admin',
    },
  });
  const list = await (await admin('/api/staff')).json();
  assert.ok(list.every((u) => !('password_hash' in u) && !('password' in u)));
  await admin('/api/staff', {
    method: 'POST',
    status: 400,
    body: { login: 'escalated', name: 'X', password: 'test-password-2026', role: 'admin' },
  });
  const employee = await (
    await admin('/api/staff', {
      method: 'POST',
      status: 201,
      body: { login: 'new_operator', name: 'Employee', password: 'test-password-2026' },
    })
  ).json();
  assert.equal(employee.role, 'staff');
  assert.equal(employee.active, true);
  const a = f.client(),
    b = f.client();
  for (const c of [a, b])
    await c('/api/auth/login', {
      method: 'POST',
      body: { login: employee.login, password: 'test-password-2026' },
    });
  await admin('/api/staff/' + employee.id, {
    method: 'PATCH',
    status: 400,
    body: { role: 'admin' },
  });
  await admin('/api/staff/' + employee.id, {
    method: 'PATCH',
    status: 400,
    body: { active: 'false' },
  });
  await admin('/api/staff/' + employee.id, { method: 'PATCH', status: 400, body: { name: ' ' } });
  await admin('/api/staff/' + employee.id, {
    method: 'PATCH',
    status: 400,
    body: { password: 'short' },
  });
  await admin('/api/staff/' + student.user.id, {
    method: 'PATCH',
    status: 404,
    body: { active: false },
  });
  const renamed = await (
    await admin('/api/staff/' + employee.id, { method: 'PATCH', body: { name: 'Новое имя' } })
  ).json();
  assert.equal(renamed.name, 'Новое имя');
  assert.equal((await (await a('/api/auth/session')).json()).name, 'Новое имя');
  await admin('/api/staff/' + employee.id, {
    method: 'PATCH',
    body: { password: 'changed-password-2026' },
  });
  for (const c of [a, b]) {
    assert.equal(await (await c('/api/auth/session')).json(), null);
    await c('/api/orders', { status: 401 });
  }
  assert.equal(
    f.api.db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(employee.id).n,
    0,
  );
  await a('/api/auth/login', {
    method: 'POST',
    status: 401,
    body: { login: employee.login, password: 'test-password-2026' },
  });
  await a('/api/auth/login', {
    method: 'POST',
    body: { login: employee.login, password: 'changed-password-2026' },
  });
  await admin('/api/staff/' + employee.id, { method: 'PATCH', body: { active: false } });
  await a('/api/orders', { status: 401 });
  await a('/api/auth/login', {
    method: 'POST',
    status: 401,
    body: { login: employee.login, password: 'changed-password-2026' },
  });
  await admin('/api/staff/' + employee.id, { method: 'PATCH', body: { active: true } });
  await a('/api/orders', { status: 401 });
  await a('/api/auth/login', {
    method: 'POST',
    body: { login: employee.login, password: 'changed-password-2026' },
  });
  await admin('/api/staff/' + user.id, { method: 'PATCH', status: 409, body: { active: false } });
  const file = await (await f.upload(student.c)).json();
  let order = await newOrder(student.c, [file.id]);
  assert.ok((await (await admin('/api/orders')).json()).some((o) => o.id === order.id));
  order = await (
    await admin('/api/orders/' + order.id + '/messages', {
      method: 'POST',
      body: { version: order.version, text: 'Administrator message', pause: true },
    })
  ).json();
  assert.equal(order.messages.at(-1).author, 'staff');
  assert.equal((await (await student.c('/api/orders/' + order.id)).json()).status, 'attention');
  await admin('/api/orders/' + order.id + '/file');
  const second = await createUser(
    f.api.db,
    { login: 'second_admin', password: 'test-password-2026', name: 'Second', group: 'Типография' },
    'admin',
  );
  const secondSession = f.client();
  await secondSession('/api/auth/login', {
    method: 'POST',
    body: { login: second.login, password: 'test-password-2026' },
  });
  await admin('/api/staff/' + second.id, { method: 'PATCH', body: { active: false } });
  await secondSession('/api/staff', { status: 401 });
  await admin('/api/staff/' + user.id, { method: 'PATCH', status: 409, body: { active: false } });
});

test('Migration v3 to v4: verified backup, unchanged identities, passwords, sessions, orders and messages; no automatic admins', async (t) => {
  const f = await fixture(t),
    { c } = await f.register('migration_customer');
  await operator(f);
  const file = await (await f.upload(c)).json();
  let order = await newOrder(c, [file.id]);
  order = await (
    await c('/api/orders/' + order.id + '/messages', {
      method: 'POST',
      body: { version: order.version, text: 'Preserved message' },
    })
  ).json();
  const db = f.api.db;
  db.pragma('foreign_keys = OFF');
  db.transaction(() =>
    db.exec(
      "CREATE TABLE users_v3(id TEXT PRIMARY KEY,login TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,name TEXT NOT NULL,group_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('student','staff'))); INSERT INTO users_v3 SELECT id,login,password_hash,name,group_name,role FROM users; DROP TABLE users; ALTER TABLE users_v3 RENAME TO users; PRAGMA user_version=3;",
    ),
  )();
  db.pragma('foreign_keys = ON');
  const users = db.prepare('SELECT * FROM users ORDER BY id').all(),
    sessions = db.prepare('SELECT * FROM sessions ORDER BY token_hash').all();
  const backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'okei-migration-backup-'));
  t.after(() => fs.rm(backupRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const { createBackup } = require('../server/backup.cjs');
  const backup = await createBackup(f.directory, path.join(backupRoot, 'snapshot'));
  const manifest = JSON.parse(await fs.readFile(path.join(backup, 'manifest.json'), 'utf8'));
  const { createHash } = require('node:crypto');
  assert.equal(
    createHash('sha256')
      .update(await fs.readFile(path.join(backup, 'okei.sqlite')))
      .digest('hex'),
    manifest.database,
  );
  await f.restart();
  assert.deepEqual(
    f.api.db
      .prepare('SELECT id,login,password_hash,name,group_name,role FROM users ORDER BY id')
      .all(),
    users,
  );
  assert.deepEqual(f.api.db.prepare('SELECT * FROM sessions ORDER BY token_hash').all(), sessions);
  assert.equal(
    f.api.db.prepare("SELECT count(*) n FROM users WHERE role='admin' OR active<>1").get().n,
    0,
  );
  assert.equal(f.api.db.pragma('user_version', { simple: true }), 4);
  assert.deepEqual(f.api.db.pragma('foreign_key_check'), []);
  assert.deepEqual(await (await c('/api/orders/' + order.id)).json(), order);
  assert.deepEqual(
    Buffer.from(await (await c('/api/orders/' + order.id + '/file')).arrayBuffer()),
    await fs.readFile(path.join(__dirname, '../dist/assets/sample.pdf')),
  );
  await f.restart();
  assert.deepEqual(await (await c('/api/orders/' + order.id)).json(), order);
});

test('Administrator CLI: explicit bootstrap uses DATA_DIR and never promotes an existing employee', async (t) => {
  const f = await fixture(t);
  await operator(f);
  const { promisify } = require('node:util'),
    exec = promisify(require('node:child_process').execFile);
  const run = (login) =>
    exec(process.execPath, [path.join(__dirname, '../server/manage.cjs'), 'admin'], {
      env: {
        ...process.env,
        DATA_DIR: f.directory,
        ADMIN_LOGIN: login,
        ADMIN_PASSWORD: 'cli-password-2026',
      },
    });
  const employee = f.api.db.prepare("SELECT * FROM users WHERE role='staff'").get();
  await assert.rejects(run(employee.login));
  assert.equal(
    f.api.db.prepare('SELECT role FROM users WHERE id=?').get(employee.id).role,
    'staff',
  );
  assert.match((await run('cli_administrator')).stdout, /Administrator account created/);
  const admin = f.client();
  const user = await (
    await admin('/api/auth/login', {
      method: 'POST',
      body: { login: 'cli_administrator', password: 'cli-password-2026' },
    })
  ).json();
  assert.equal(user.role, 'admin');
  assert.equal(user.login, 'cli_administrator');
  await admin('/api/staff');
});

test('Login: disabling or resetting a password during verification cannot issue a new session', async (t) => {
  const f = await fixture(t),
    auth = require('../server/auth.cjs');
  const user = await createUser(
    f.api.db,
    { login: 'login_race', password: 'test-password-2026', name: 'Employee', group: 'Print' },
    'staff',
  );
  const original = auth.verifyPassword;
  t.after(() => {
    auth.verifyPassword = original;
  });
  for (const reset of [false, true]) {
    let arrived, release;
    const started = new Promise((resolve) => {
        arrived = resolve;
      }),
      gate = new Promise((resolve) => {
        release = resolve;
      });
    f.api.db.prepare('UPDATE users SET active=1 WHERE id=?').run(user.id);
    auth.verifyPassword = async (...args) => {
      const valid = await original(...args);
      arrived();
      await gate;
      return valid;
    };
    const response = f.client()('/api/auth/login', {
      method: 'POST',
      status: 401,
      body: { login: user.login, password: 'test-password-2026' },
    });
    await started;
    if (reset)
      f.api.db
        .prepare('UPDATE users SET password_hash=? WHERE id=?')
        .run(await auth.passwordHash('reset-password-2026'), user.id);
    else f.api.db.prepare('UPDATE users SET active=0 WHERE id=?').run(user.id);
    release();
    await response;
    assert.equal(
      f.api.db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(user.id).n,
      0,
    );
  }
});
