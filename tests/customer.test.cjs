const test = require('node:test');
const assert = require('node:assert/strict');
const { Blob } = require('node:buffer');
const { createCustomerHarness, orderFixture } = require('./customer-harness.cjs');

test('Новый заказ отменяется с сохранением параметров и истории', async () => {
  const initial = orderFixture();
  const app = createCustomerHarness({ orders: [initial] });
  await app.click({ cCancel: initial.id });
  await app.click({ cConfirmCancel: initial.id });
  const order = app.data().orders[0];
  assert.equal(order.status, 'cancelled');
  assert.deepEqual(
    order.events.map((event) => event.status),
    ['new', 'cancelled'],
  );
  assert.deepEqual(order.params, initial.params);
  assert.equal(app.customer.activeCount(), 0);
});

test('Заказ в работе не допускает отмену заказчиком', async () => {
  const initial = orderFixture('work');
  const app = createCustomerHarness({ orders: [initial] });
  await app.click({ cConfirmCancel: initial.id });
  assert.deepEqual(app.data().orders[0], initial);
});

test('Ответ на уточнение сохраняет сообщение и переводит attention в review', async () => {
  const initial = orderFixture('attention');
  const app = createCustomerHarness({ orders: [initial] });
  await app.click({ cOrder: initial.id, cTab: 'chat' });
  app.element('#c-message').value = '  Печатать в цвете.  ';
  await app.submit('c-chat-form');
  const order = app.data().orders[0];
  assert.equal(order.status, 'review');
  assert.deepEqual(
    order.events.map((event) => event.status),
    ['attention', 'review'],
  );
  assert.equal(order.messages.length, 1);
  assert.equal(order.messages[0].author, 'user');
  assert.equal(order.messages[0].text, 'Печатать в цвете.');
  assert.ok(Number.isFinite(Date.parse(order.messages[0].time)));
});

test('Активные заказы исключают выданные и отменённые', () => {
  const statuses = ['new', 'work', 'ready', 'attention', 'review', 'issued', 'cancelled'];
  const app = createCustomerHarness({
    orders: statuses.map((status, index) => orderFixture(status, String(2001 + index))),
  });
  assert.equal(app.customer.activeCount(), 5);
});

test('Макет оформляется с сохранением JSON, превью и ссылки на владельца', async () => {
  const app = createCustomerHarness();
  const design = { title: 'Test design', size: 'M', count: 2, front: [], back: [] };
  const preview = new Blob(['test preview'], { type: 'image/png' });
  const id = await app.customer.createStudioOrder(design, preview);
  const order = app.data().orders[0];
  assert.equal(order.id, id);
  assert.equal(order.status, 'new');
  assert.equal(order.total, 1900);
  assert.equal(order.customer.name, 'alice');
  assert.deepEqual(JSON.parse(await app.files.get(order.designKey).text()), design);
  assert.equal(app.files.get(order.previewKey), preview);
  assert.equal(app.element('#modal').hidden, false);
  assert.match(app.element('#modalContent').innerHTML, /data-c-success-order=/);
});
