const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadOrderMath, orderFixture } = require('./customer-harness.cjs');

test('Shared helpers escape text and retain Russian currency, date and plurals', async () => {
  const { escapeHTML, formatMoney, formatDate, plural, createId } =
    await import('../dist/shared.mjs');
  assert.equal(
    escapeHTML('<img title="x" onerror=\'y\'>&'),
    '&lt;img title=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;',
  );
  assert.equal(escapeHTML(null), '');
  assert.equal(escapeHTML(0), '0');
  assert.equal(formatMoney(1234.5).replace(/\u00a0/g, ' '), '1 234,5 ₽');
  assert.match(formatDate('2026-10-22T20:00:00Z'), /23.*окт.*01:00/);
  assert.deepEqual(
    [1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, 'лист', 'листа', 'листов')),
    ['лист', 'листа', 'листов', 'листов', 'лист', 'листа', 'листов'],
  );
  const ids = Array.from({ length: 100 }, () => createId());
  assert.equal(new Set(ids).size, 100);
  assert.ok(ids.every((id) => /^[a-z0-9-]+$/i.test(id)));
});

test('State instances and blank drafts are independent; obsolete sessions are rejected', async () => {
  const { createCustomerState, blank, captureSession, checkSession } =
    await import('../dist/customer/state.mjs');
  const state = createCustomerState(),
    other = createCustomerState();
  state.demoState.count = 5;
  assert.equal(other.demoState.count, 1);
  const draft = blank();
  draft.copies = 99;
  assert.equal(blank().copies, 1);
  state.user = { id: 'alice' };
  state.key = 'okei-customer-v1:alice';
  const operation = captureSession(state);
  assert.doesNotThrow(() => checkSession(state, operation));
  state.sessionId++;
  assert.throws(() => checkSession(state, operation), /Сессия изменилась/);
  state.user = null;
  assert.throws(() => captureSession(state), /Сессия завершена/);
});

test('Quote uses the actual page parser, rejects empty explicit range and leaves the draft intact', async () => {
  const { calculateQuote } = await import('../dist/customer/orders.mjs');
  const { blank } = await import('../dist/customer/state.mjs');
  const math = loadOrderMath();
  const draft = { ...blank(), pages: 5, useRange: true, range: '3,1-2,2', copies: 2, duplex: true };
  const before = structuredClone(draft);
  const { q, selected } = calculateQuote(draft, math);
  assert.deepEqual(Array.from(selected), [1, 2, 3]);
  assert.equal(q.total, 20);
  assert.equal(q.sheets, 4);
  assert.deepEqual(draft, before);
  assert.match(calculateQuote({ ...draft, range: ' ' }, math).error, /Укажи страницы/);
});

test('Order filters keep status priority and search without reordering the original list', async () => {
  const { activeOrders, filteredOrders } = await import('../dist/customer/orders.mjs');
  const orders = ['issued', 'new', 'work', 'cancelled', 'review', 'ready', 'attention'].map(
    (status, i) => orderFixture(status, String(2001 + i)),
  );
  const before = structuredClone(orders);
  assert.deepEqual(
    activeOrders(orders).map((order) => order.status),
    ['attention', 'ready', 'review', 'work', 'new'],
  );
  assert.deepEqual(
    filteredOrders(orders, 'completed', '').map((order) => order.status),
    ['issued'],
  );
  assert.deepEqual(
    filteredOrders(orders, 'cancelled', '2004').map((order) => order.status),
    ['cancelled'],
  );
  assert.equal(filteredOrders(orders, 'all', 'TEST-DOCUMENT.PDF').length, 7);
  assert.deepEqual(orders, before);
});

test('Repeat document keeps existing parameters and requests a file for demo orders', async () => {
  const { repeatDocument } = await import('../dist/customer/orders.mjs');
  const order = orderFixture('issued');
  order.params.copies = 3;
  const before = structuredClone(order);
  const missing = repeatDocument(order);
  assert.equal(missing.step, 1);
  assert.equal(missing.pages, 0);
  assert.equal(missing.fileKey, '');
  assert.equal(missing.copies, 3);
  order.fileKey = 'old-file';
  const draft = repeatDocument(order);
  assert.equal(draft.step, 2);
  assert.equal(draft.fileKey, 'old-file');
  assert.equal(draft.fileName, order.title);
  assert.equal(draft.pages, 3);
  assert.deepEqual(order.params, before.params);
});

test('Demo status transitions append history and stop at issued/cancelled', async () => {
  const { advanceDemoStatus } = await import('../dist/customer/orders.mjs');
  const order = orderFixture();
  for (const expected of ['work', 'ready', 'issued']) {
    assert.equal(advanceDemoStatus(order), true);
    assert.equal(order.status, expected);
    assert.equal(order.events.at(-1).status, expected);
  }
  const before = structuredClone(order);
  assert.equal(advanceDemoStatus(order), false);
  assert.deepEqual(order, before);
  assert.equal(advanceDemoStatus(orderFixture('cancelled')), false);
  assert.equal(advanceDemoStatus(orderFixture('attention')), true);
});
