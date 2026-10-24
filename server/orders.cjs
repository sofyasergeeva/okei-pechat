const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { fail } = require('./auth.cjs');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/order-math.js'), 'utf8'), context);
const math = context.OrderMath;
const merch = require('./merch.cjs');
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
    const pages = pdf.getPageCount();
    if (pages < 1 || pages > 2000) throw fail(400, 'Допустим PDF от 1 до 2000 страниц.');
    return pages;
  } catch (error) {
    if (error.status === 400) throw error;
    throw fail(400, 'Не удалось прочитать PDF. Проверь файл и сними пароль.');
  }
}
function orderView(db, row) {
  return {
    id: String(row.id),
    kind: row.kind,
    title: row.title,
    fileKey: row.kind === 'document' ? row.file_id : undefined,
    files: db
      .prepare(
        'SELECT f.*,a.params,a.quote FROM order_files a JOIN files f ON f.id=a.file_id WHERE order_id=? ORDER BY position',
      )
      .all(row.id)
      .map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        pages: file.pages,
        kind: file.kind,
        params: JSON.parse(file.params),
        quote: JSON.parse(file.quote),
      })),
    designKey:
      row.kind === 'merch'
        ? db
            .prepare(
              "SELECT a.file_id FROM order_files a JOIN files f ON f.id=a.file_id WHERE order_id=? AND f.kind='design'",
            )
            .get(row.id)?.file_id
        : undefined,
    previewKey:
      row.kind === 'merch'
        ? db
            .prepare(
              "SELECT a.file_id FROM order_files a JOIN files f ON f.id=a.file_id WHERE order_id=? AND f.kind='preview'",
            )
            .get(row.id)?.file_id
        : undefined,
    printingStartedAt: row.printing_started_at,
    cancelledAt: row.cancelled_at,
    canCancel:
      !row.printing_started_at && ['new', 'work', 'attention', 'review'].includes(row.status),
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
  if (!row || (!['staff', 'admin'].includes(user.role) && row.owner_id !== user.id))
    throw fail(404, 'Заказ не найден.');
  return row;
}
function insertOrder(db, user, { kind, fileId, title, params, quote, attachments }) {
  const id = db
    .prepare(
      "INSERT INTO orders(owner_id,file_id,title,status,total,params,quote,comment,customer_name,customer_group,created,kind) VALUES (?,?,?,'new',?,?,?,?,?,?,?,?)",
    )
    .run(
      user.id,
      fileId,
      title,
      quote.total,
      JSON.stringify(params),
      JSON.stringify(quote),
      params.comment || '',
      user.name,
      user.group_name,
      new Date().toISOString(),
      kind,
    ).lastInsertRowid;
  const insert = db.prepare('INSERT INTO order_files VALUES (?,?,?,?,?)');
  attachments.forEach((a, index) =>
    insert.run(id, a.file.id, index, JSON.stringify(a.params || {}), JSON.stringify(a.quote || {})),
  );
  db.prepare('INSERT INTO events(order_id,status,time) VALUES (?,?,?)').run(
    id,
    'new',
    new Date().toISOString(),
  );
  return orderView(db, accessibleOrder(db, user, String(id)));
}
function createOrder(db, user, body, design) {
  if (body?.kind === 'merch') {
    if (!design) throw fail(400, 'Отправь полный пакет из конструктора.');
    return db.transaction(() => {
      const files = (body.fileKeys || []).map((id) =>
        db.prepare('SELECT * FROM files WHERE id=? AND owner_id=?').get(id, user.id),
      );
      const expected = [
        'design',
        'preview',
        ...['front', 'back'].filter((side) => design[side].length),
      ];
      if (
        files.length !== expected.length ||
        files.some((file) => !file) ||
        expected.some((kind) => files.filter((file) => file.kind === kind).length !== 1)
      )
        throw fail(400, 'Неполный пакет макета.');
      const { params, quote } = merch.parameters(design);
      return insertOrder(db, user, {
        kind: 'merch',
        fileId: files.find((file) => file.kind === 'design').id,
        title: 'Футболка «' + (design.title || 'Мой дизайн') + '»',
        params,
        quote,
        attachments: files.map((file) => ({ file })),
      });
    })();
  }
  if (body?.kind && body.kind !== 'document') throw fail(400, 'Недопустимый тип заказа.');
  const ids = body?.fileKeys ?? [body?.fileKey];
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 10 ||
    ids.some((id) => typeof id !== 'string') ||
    new Set(ids).size !== ids.length
  )
    throw fail(400, 'Выбери от 1 до 10 разных PDF.');
  return db.transaction(() => {
    const files = ids.map((id) =>
      db.prepare('SELECT * FROM files WHERE id=? AND owner_id=?').get(id, user.id),
    );
    if (files.some((file) => !file || file.kind !== 'pdf'))
      throw fail(400, 'Файл не найден. Загрузи PDF снова.');
    if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024)
      throw fail(400, 'Общий размер PDF — до 50 МБ.');
    const attachments = files.map((file) => ({ file, ...parameters(body.params, file.pages) }));
    const params = { ...attachments[0].params },
      quote = { ...attachments[0].quote };
    if (files.length > 1) {
      for (const name of ['pages', 'selectedPages'])
        params[name] = attachments.reduce((sum, a) => sum + a.params[name], 0);
      params.pageList = [];
      for (const name of [
        'pages',
        'sheets',
        'sheetsPerCopy',
        'impressions',
        'singles',
        'pairs',
        'binding',
        'bindingPerCopy',
        'print',
        'total',
        'savings',
      ])
        quote[name] = attachments.reduce((sum, a) => sum + a.quote[name], 0);
    }
    return insertOrder(db, user, {
      kind: 'document',
      fileId: files[0].id,
      title: files.length === 1 ? files[0].name : files[0].name + ' и ещё ' + (files.length - 1),
      params,
      quote,
      attachments,
    });
  })();
}
function modifyOrder(db, user, id, body, type) {
  if (!body || typeof body !== 'object') throw fail(400, 'Проверь параметры запроса.');
  return db.transaction(() => {
    const order = accessibleOrder(db, user, id);
    if (type === 'status' && body.status === 'cancelled' && order.status === 'cancelled')
      return orderView(db, order);
    if (body.version !== order.version)
      throw fail(409, 'Заказ изменился. Обнови данные и повтори действие.');
    let status = order.status;
    let printingStartedAt = order.printing_started_at,
      cancelledAt = order.cancelled_at;
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
        ['staff', 'admin'].includes(user.role) ? 'staff' : 'user',
        text,
        time,
      );
      if (['staff', 'admin'].includes(user.role)) {
        unread++;
        if (body.pause === true && ['new', 'work', 'review'].includes(status)) {
          resumeStatus = status;
          status = 'attention';
        }
      } else if (status === 'attention') status = 'review';
    } else if (type === 'printing') {
      if (!['staff', 'admin'].includes(user.role))
        throw fail(403, 'Начать печать может только сотрудник.');
      if (status !== 'work' || printingStartedAt)
        throw fail(409, 'Печать уже началась или заказ не в работе.');
      printingStartedAt = time;
    } else {
      const next = body.status;
      if (next === 'cancelled') {
        if (printingStartedAt || !['new', 'work', 'attention', 'review'].includes(status))
          throw fail(409, 'После начала печати отмена недоступна.');
        if (['staff', 'admin'].includes(user.role)) {
          if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 300)
            throw fail(400, 'Укажи причину отмены.');
          cancelReason = body.reason.trim();
        }
        status = 'cancelled';
        cancelledAt = time;
      } else if (!['staff', 'admin'].includes(user.role)) {
        throw fail(403, 'Изменять статус может только сотрудник.');
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
        if (status === 'work' && next === 'ready' && !printingStartedAt)
          throw fail(409, 'Сначала отметь начало печати.');
        status = next;
      } else throw fail(409, 'Недопустимый переход статуса.');
    }
    db.prepare(
      'UPDATE orders SET status=?,payment=?,paid_at=?,cancel_reason=?,resume_status=?,unread=?,printing_started_at=?,cancelled_at=?,version=version+1 WHERE id=?',
    ).run(
      status,
      payment,
      paidAt,
      cancelReason,
      resumeStatus,
      unread,
      printingStartedAt,
      cancelledAt,
      id,
    );
    if (status !== order.status)
      db.prepare('INSERT INTO events(order_id,status,time) VALUES (?,?,?)').run(id, status, time);
    return orderView(db, accessibleOrder(db, user, id));
  })();
}
module.exports = { parameters, validatePDF, orderView, accessibleOrder, createOrder, modifyOrder };
