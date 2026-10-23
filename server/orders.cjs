const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { fail } = require('./auth.cjs');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/order-math.js'), 'utf8'), context);
const math = context.OrderMath;
function parameters(input, pages) {
  if (
    !input ||
    !['A4', 'A3'].includes(input.format) ||
    !['mono', 'color'].includes(input.color) ||
    !['normal', 'photo'].includes(input.paper) ||
    !['none', 'spiral', 'diploma'].includes(input.binding) ||
    typeof input.duplex !== 'boolean' ||
    typeof input.useRange !== 'boolean' ||
    !Number.isInteger(input.copies) ||
    input.copies < 1 ||
    input.copies > 99 ||
    typeof input.range !== 'string' ||
    input.range.length > 5000 ||
    typeof input.comment !== 'string' ||
    input.comment.length > 1000
  )
    throw fail(400, 'Недопустимые параметры печати.');
  if (input.paper === 'photo' && (input.duplex || input.color !== 'color'))
    throw fail(400, 'Фотобумага: цветная односторонняя печать.');
  if (input.useRange && !input.range.trim()) throw fail(400, 'Укажи диапазон страниц.');
  const params = {
    pages,
    format: input.format,
    color: input.color,
    paper: input.paper,
    binding: input.binding,
    duplex: input.duplex,
    copies: input.copies,
    useRange: input.useRange,
    range: input.range,
    comment: input.comment,
  };
  try {
    const selected = math.selection(pages, params.useRange ? params.range : '');
    params.selectedPages = selected.length;
    params.pageList = selected;
    return { params, quote: math.quote(params) };
  } catch (error) {
    throw fail(400, error.message);
  }
}
async function validatePDF(file) {
  if (
    !file ||
    file.size < 1 ||
    file.size > 25 * 1024 * 1024 ||
    !file.buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-')
  )
    throw fail(400, 'Нужен PDF до 25 МБ.');
  let pdf;
  try {
    pdf = await PDFDocument.load(file.buffer, {
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch {
    throw fail(400, 'Не удалось прочитать PDF. Проверь файл и сними пароль.');
  }
  const pages = pdf.getPageCount();
  if (pages < 1 || pages > 2000) throw fail(400, 'Допустим PDF от 1 до 2000 страниц.');
  return pages;
}
function orderView(db, row) {
  return {
    id: String(row.id),
    kind: 'document',
    title: row.title,
    fileKey: row.file_id,
    status: row.status,
    total: row.total,
    created: row.created,
    version: row.version,
    params: JSON.parse(row.params),
    quote: JSON.parse(row.quote),
    comment: row.comment,
    customer: { name: row.customer_name, group: row.customer_group },
    payment: row.payment,
    paidAt: row.paid_at,
    cancelReason: row.cancel_reason,
    resumeStatus: row.resume_status,
    unread: row.unread,
    events: db.prepare('SELECT status,time FROM events WHERE order_id=? ORDER BY id').all(row.id),
    messages: db
      .prepare('SELECT id,author,text,time FROM messages WHERE order_id=? ORDER BY time,rowid')
      .all(row.id),
  };
}
function accessibleOrder(db, user, id) {
  if (!/^\d+$/.test(String(id))) throw fail(404, 'Заказ не найден.');
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!row || (user.role !== 'staff' && row.owner_id !== user.id))
    throw fail(404, 'Заказ не найден.');
  return row;
}
function createOrder(db, user, body) {
  const file = db
    .prepare('SELECT * FROM files WHERE id=? AND owner_id=?')
    .get(String(body?.fileKey || ''), user.id);
  if (!file) throw fail(400, 'Файл не найден. Загрузи PDF снова.');
  const { params, quote } = parameters(body.params, file.pages);
  const time = new Date().toISOString();
  return db.transaction(() => {
    const id = db
      .prepare(
        "INSERT INTO orders(owner_id,file_id,title,status,total,params,quote,comment,customer_name,customer_group,created) VALUES (?,?,?,'new',?,?,?,?,?,?,?)",
      )
      .run(
        user.id,
        file.id,
        file.name,
        quote.total,
        JSON.stringify(params),
        JSON.stringify(quote),
        params.comment,
        user.name,
        user.group_name,
        time,
      ).lastInsertRowid;
    db.prepare('INSERT INTO events(order_id,status,time) VALUES (?,?,?)').run(id, 'new', time);
    return orderView(db, accessibleOrder(db, user, String(id)));
  })();
}
function modifyOrder(db, user, id, body, type) {
  if (!body || typeof body !== 'object') throw fail(400, 'Проверь параметры запроса.');
  return db.transaction(() => {
    const order = accessibleOrder(db, user, id);
    if (body.version !== order.version)
      throw fail(409, 'Заказ изменился. Обнови данные и повтори действие.');
    let status = order.status;
    const time = new Date().toISOString();
    let payment = order.payment,
      paidAt = order.paid_at,
      cancelReason = order.cancel_reason,
      resumeStatus = order.resume_status,
      unread = order.unread;
    if (type === 'message') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text || text.length > 2000) throw fail(400, 'Сообщение: от 1 до 2000 символов.');
      db.prepare('INSERT INTO messages VALUES (?,?,?,?,?)').run(
        randomUUID(),
        id,
        user.role === 'staff' ? 'staff' : 'user',
        text,
        time,
      );
      if (user.role === 'staff') {
        unread++;
        if (body.pause === true && ['new', 'work', 'review'].includes(status)) {
          resumeStatus = status;
          status = 'attention';
        }
      } else if (status === 'attention') status = 'review';
    } else {
      const next = body.status;
      if (user.role !== 'staff') {
        if (status !== 'new' || next !== 'cancelled')
          throw fail(403, 'Заказчик может отменить только новый заказ.');
        status = 'cancelled';
      } else if (next === 'cancelled') {
        if (
          !['new', 'work', 'review'].includes(status) ||
          typeof body.reason !== 'string' ||
          !body.reason.trim() ||
          body.reason.length > 300
        )
          throw fail(400, 'Укажи причину отмены активного заказа.');
        cancelReason = body.reason.trim();
        status = next;
      } else if (status === 'ready' && next === 'issued') {
        if (body.paid !== true) throw fail(400, 'Подтверди получение оплаты.');
        payment = 'paid';
        paidAt = time;
        status = next;
      } else if (
        { new: 'work', review: 'work', work: 'ready', attention: 'work' }[status] === next
      ) {
        if (['new', 'review', 'attention'].includes(status) && body.checked !== true)
          throw fail(400, 'Подтверди проверку файла или согласование.');
        status = next;
      } else throw fail(409, 'Недопустимый переход статуса.');
    }
    db.prepare(
      'UPDATE orders SET status=?,payment=?,paid_at=?,cancel_reason=?,resume_status=?,unread=?,version=version+1 WHERE id=?',
    ).run(status, payment, paidAt, cancelReason, resumeStatus, unread, id);
    if (status !== order.status)
      db.prepare('INSERT INTO events(order_id,status,time) VALUES (?,?,?)').run(id, status, time);
    return orderView(db, accessibleOrder(db, user, id));
  })();
}
module.exports = { parameters, validatePDF, orderView, accessibleOrder, createOrder, modifyOrder };
