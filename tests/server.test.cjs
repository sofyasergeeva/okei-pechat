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
      assert.equal(response.status, status, await response.clone().text());
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
  for (const status of ['work', 'ready'])
    o = await (
      await staff('/api/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: { version: o.version, status, checked: true },
      })
    ).json();
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
