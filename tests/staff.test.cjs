const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { orderFixture } = require('./customer-harness.cjs');
const model = () => import('../dist/staff/orders.mjs');
test('Staff: checked transitions, pause/resume, payment and cancellation retain history', async () => {
  const m = await model(),
    order = orderFixture();
  assert.equal(m.canAdvance(order, 'work', false), false);
  assert.equal(m.canAdvance(order, 'ready', true), false);
  assert.equal(m.canAdvance(order, 'work', true), true);
  m.advanceConfirmed(order, 'new', 'work');
  assert.equal(order.status, 'work');
  assert.equal(order.checkedBy, 'staff_01');
  m.appendStaffMessage(order, 'Уточнение', true);
  assert.equal(order.status, 'attention');
  assert.equal(order.resumeStatus, 'work');
  assert.equal(order.unread, 1);
  assert.equal(order.messages[0].text, 'Уточнение');
  m.resumeConfirmed(order);
  assert.equal(order.status, 'work');
  m.advanceConfirmed(order, 'work', 'ready');
  m.issuePaid(order);
  assert.equal(order.status, 'issued');
  assert.equal(order.payment, 'paid');
  assert.ok(order.paidAt);
  const before = structuredClone(order);
  m.cancelWithReason(order, 'Отмена');
  assert.deepEqual(order, before);
  assert.deepEqual(
    order.events.map((e) => e.status),
    ['new', 'work', 'attention', 'work', 'ready', 'issued'],
  );
});
test('Staff: group totals exclude cancellations; CSV protects formulas and quotes', async () => {
  const m = await model();
  const orders = ['new', 'issued', 'cancelled'].map((status, i) => ({
    ...orderFixture(status, String(i)),
    customer: { name: '=SUM(1)', group: 'ИСП-23' },
    _store: m.fixtureKey,
  }));
  orders[1].payment = 'paid';
  orders[0].title = 'a"b.pdf';
  assert.deepEqual(m.summarizeGroups(orders), {
    rows: [{ name: 'ИСП-23', count: 2, active: 1, issued: 1, total: 24, paid: 12 }],
    total: 24,
    paid: 12,
  });
  const csv = m.createCSV(orders);
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv, /"'=SUM\(1\)"/);
  assert.match(csv, /"a""b.pdf"/);
  assert.equal(csv.split('\r\n').length, 4);
});
test('Staff: existing storage rejects stale updates and retains unknown fields', async () => {
  const m = await model(),
    { createStaffStorage } = await import('../dist/staff/storage.mjs');
  const values = new Map([
    [m.fixtureKey, JSON.stringify({ orders: [] })],
    [
      'okei-customer-v1:alice',
      JSON.stringify({
        orders: [orderFixture()],
        profile: { name: 'Alice', group: 'ИСП-23' },
        extension: 42,
      }),
    ],
  ]);
  let failed = false,
    conflicts = 0;
  const notices = [];
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (failed) throw Error('quota');
      values.set(key, value);
    },
    key: (index) => [...values.keys()][index],
    get length() {
      return values.size;
    },
  };
  const state = m.createStaffState(),
    repo = createStaffStorage(state, {
      storage,
      indexedDB: null,
      notify: (message) => notices.push(message),
      onConflict: () => conflicts++,
    });
  repo.load();
  const ref = state.all[0]._ref;
  state.checked.add(ref);
  const current = JSON.parse(values.get('okei-customer-v1:alice'));
  current.orders[0].status = 'work';
  values.set('okei-customer-v1:alice', JSON.stringify(current));
  assert.equal(
    repo.update(ref, (o) => m.changeStatus(o, 'cancelled')),
    false,
  );
  assert.equal(conflicts, 1);
  assert.equal(state.checked.has(ref), false);
  assert.equal(state.all[0].status, 'work');
  assert.equal(
    repo.update(ref, (o) => m.changeStatus(o, 'ready')),
    true,
  );
  assert.equal(JSON.parse(values.get('okei-customer-v1:alice')).extension, 42);
  failed = true;
  assert.equal(
    repo.update(ref, (o) => m.changeStatus(o, 'issued')),
    false,
  );
  assert.equal(JSON.parse(values.get('okei-customer-v1:alice')).orders[0].status, 'ready');
  assert.match(notices.at(-1), /Не удалось сохранить/);
});
