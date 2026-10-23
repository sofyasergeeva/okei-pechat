// Deliberately separate from npm test until K1-K3 are fixed.
// These assertions describe correct behavior; failures must not be inverted or skipped.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Blob } = require('node:buffer');
const { createCustomerHarness, orderFixture } = require('./customer-harness.cjs');

test('К2: отказ localStorage не показывает успешное оформление', async () => {
  const app = createCustomerHarness();
  app.storage.failWrites = true;
  await app.customer
    .createStudioOrder({ title: 'Quota test', size: 'M', count: 1 }, new Blob(['preview']))
    .catch(() => {}); // A future implementation may reject or report the failure through the UI.

  assert.ok(app.storage.failedWrites > 0, 'Отказ записи должен действительно произойти');
  assert.equal(app.data().orders.length, 0);
  assert.equal(app.element('#modal').hidden, true, 'Нельзя открывать окно успеха после отказа');
  assert.doesNotMatch(app.element('#modalContent').innerHTML, /data-c-success-order=/);
});

test('К3: незавершённое оформление Alice не создаёт заказ в аккаунте Bob', async () => {
  const app = createCustomerHarness();
  const gate = app.pauseNextFileWrite();
  const pending = app.customer.createStudioOrder(
    { title: 'Alice design', size: 'M', count: 1 },
    new Blob(['preview']),
  );
  await gate.started;
  try {
    app.login('bob');
  } finally {
    gate.resume();
  }
  await pending.catch(() => {}); // Cancelling the old session is also a valid future fix.

  assert.equal(app.data('bob').profile.name, 'bob');
  assert.equal(app.data('bob').orders.length, 0, 'Bob не должен получить заказ с макетом Alice');
});
