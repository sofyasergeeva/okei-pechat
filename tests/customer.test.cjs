const test = require('node:test');
const assert = require('node:assert/strict');
const { Blob } = require('node:buffer');
const { createCustomerHarness, orderFixture } = require('./customer-harness.cjs');

test('К2: отказ оформления PDF сохраняет черновик и файл; повторная попытка создаёт один заказ', async () => {
  const draft = {
    ...orderFixture().params,
    step: 3,
    fileKey: 'pdf-test',
    fileName: 'test-document.pdf',
    fileSize: 3,
    range: '',
    useRange: false,
    comment: 'Не терять комментарий',
  };
  const app = createCustomerHarness({ draft });
  const file = new Blob(['pdf'], { type: 'application/pdf' });
  app.files.set(draft.fileKey, file);
  app.storage.failWrites = true;
  await app.click({ cNext: '' });
  assert.deepEqual(app.data().draft, draft);
  assert.equal(app.files.get(draft.fileKey), file);
  assert.equal(app.data().orders.length, 0);
  assert.equal(app.element('#modal').hidden, true);
  assert.ok(app.notices.some((message) => message.includes('Не удалось сохранить')));

  app.storage.failWrites = false;
  await app.click({ cNext: '' });
  assert.equal(app.data().orders.length, 1);
  assert.equal(app.data().orders[0].fileKey, draft.fileKey);
  assert.equal(app.data().orders[0].comment, draft.comment);
  assert.equal(app.data().draft.fileKey, '');
});

test('К2: повтор сохранения макета после отказа не дублирует заказ', async () => {
  const app = createCustomerHarness();
  const design = { title: 'Retry', size: 'M', count: 1 };
  const preview = new Blob(['preview']);
  app.storage.failWrites = true;
  await assert.rejects(app.customer.createStudioOrder(design, preview), /Заказ не сохранён/);
  app.storage.failWrites = false;
  await app.customer.createStudioOrder(design, preview);
  assert.equal(app.data().orders.length, 1);
});

test('К1: черновик сохраняет свежие заказы и дополнительные поля существующего хранилища', async () => {
  const app = createCustomerHarness({ orders: [orderFixture('work')] });
  const stored = app.data();
  stored.orders[0].status = 'ready';
  stored.legacyMetadata = { keep: true };
  app.storage.setItem(app.keyFor('alice'), JSON.stringify(stored));
  await app.input('c-comment', 'Комментарий к новому заказу');
  assert.equal(app.data().orders[0].status, 'ready');
  assert.equal(app.data().draft.comment, 'Комментарий к новому заказу');
  assert.deepEqual(app.data().legacyMetadata, { keep: true });
});

test('К1: отмена устаревшего заказа не перезаписывает статус сотрудника', async () => {
  const app = createCustomerHarness({ orders: [orderFixture()] });
  const stored = app.data();
  stored.orders[0].status = 'work';
  app.storage.setItem(app.keyFor('alice'), JSON.stringify(stored));
  await app.click({ cConfirmCancel: '2001' });
  assert.equal(app.data().orders[0].status, 'work');
  assert.ok(app.notices.some((message) => message.includes('Заказ изменился')));
});

test('К1: изменение одного заказа сохраняет свежие изменения другого', async () => {
  const app = createCustomerHarness({ orders: [orderFixture(), orderFixture('work', '2002')] });
  const stored = app.data();
  stored.orders[1].status = 'ready';
  app.storage.setItem(app.keyFor('alice'), JSON.stringify(stored));
  await app.click({ cConfirmCancel: '2001' });
  assert.equal(app.data().orders[0].status, 'cancelled');
  assert.equal(app.data().orders[1].status, 'ready');
});

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

test('К1: сохранение профиля не перезаписывает новый статус и сообщение сотрудника', async () => {
  const app = createCustomerHarness({ orders: [orderFixture('work')] });
  await app.click({ cPage: 'profile' });

  // A different tab has already committed these employee changes to the shared origin.
  const employeeData = app.data();
  employeeData.orders[0].status = 'ready';
  employeeData.orders[0].messages.push({
    id: 'staff-message',
    author: 'staff',
    text: 'Заказ готов.',
    time: '2026-01-15T06:00:00.000Z',
  });
  app.storage.setItem(app.keyFor('alice'), JSON.stringify(employeeData));

  app.element('#c-profile-name').value = 'Updated name';
  app.element('#c-profile-group').value = 'TEST-01';
  await app.submit('c-profile-form');
  const saved = app.data();
  assert.equal(saved.profile.name, 'Updated name', 'Обработчик профиля должен выполниться');
  assert.deepEqual(
    { status: saved.orders[0].status, messages: saved.orders[0].messages },
    { status: 'ready', messages: employeeData.orders[0].messages },
    'Изменения сотрудника должны пережить сохранение профиля заказчиком',
  );
});

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
