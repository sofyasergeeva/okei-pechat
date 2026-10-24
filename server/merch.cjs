const { PDFDocument } = require('pdf-lib');
const { fail } = require('./auth.cjs');
const { MERCH_PRICE } = require('../dist/customer/orders.mjs');
const { colors } = require('../dist/studio/model.mjs');
const mb = 1024 * 1024;
async function png(buffer, width, height) {
  if (
    !buffer ||
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw fail(400, 'Нужен корректный PNG.');
  const w = buffer.readUInt32BE(16),
    h = buffer.readUInt32BE(20);
  if ((width && (w !== width || h !== height)) || w < 1 || h < 1 || w > 2400 || h > 3368)
    throw fail(400, 'Недопустимый размер PNG.');
  try {
    const doc = await PDFDocument.create();
    await doc.embedPng(buffer);
  } catch {
    throw fail(400, 'Не удалось прочитать PNG.');
  }
}
async function validateDesign(d) {
  if (
    !d ||
    d.version !== 1 ||
    typeof d.title !== 'string' ||
    d.title.length > 40 ||
    !['XS', 'S', 'M', 'L', 'XL'].includes(d.size) ||
    !Number.isInteger(d.count) ||
    d.count < 1 ||
    d.count > 30 ||
    !colors.some(([color, name]) => d.shirtColor === color && d.shirtColorName === name)
  )
    throw fail(400, 'Проверь размер, количество и цвет футболки.');
  if (
    !Array.isArray(d.front) ||
    !Array.isArray(d.back) ||
    d.front.length > 12 ||
    d.back.length > 12 ||
    (!d.front.length && !d.back.length)
  )
    throw fail(400, 'Нужно от 1 до 12 элементов на стороне.');
  const color = (value) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value);
  const ids = new Set();
  for (const layer of [...d.front, ...d.back]) {
    if (
      !layer ||
      typeof layer.id !== 'string' ||
      layer.id.length > 100 ||
      ids.has(layer.id) ||
      !['text', 'image'].includes(layer.type) ||
      !['x', 'y', 'w', 'h', 'rotation'].every((key) => Number.isFinite(layer[key])) ||
      layer.x < 0 ||
      layer.x > 1 ||
      layer.y < 0 ||
      layer.y > 1 ||
      layer.w <= 0 ||
      layer.w > 1.001 ||
      layer.h <= 0 ||
      layer.h > 1.001 ||
      Math.abs(layer.rotation) > 180
    )
      throw fail(400, 'Недопустимый элемент макета.');
    ids.add(layer.id);
    if (layer.type === 'text') {
      if (
        typeof layer.text !== 'string' ||
        layer.text.length > 100 ||
        !color(layer.color) ||
        !['Manrope', 'Georgia', 'monospace'].includes(layer.font) ||
        !Number.isInteger(layer.weight) ||
        layer.weight < 100 ||
        layer.weight > 900
      )
        throw fail(400, 'Проверь текст и шрифт макета.');
    } else {
      if (
        typeof layer.label !== 'string' ||
        layer.label.length > 512 ||
        typeof layer.src !== 'string'
      )
        throw fail(400, 'Проверь изображение макета.');
      if (layer.src === '/assets/college-red.svg') continue;
      const match = layer.src.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match || match[1].length > 14 * mb)
        throw fail(400, 'Используй встроенное PNG-изображение до 10 МБ.');
      const bytes = Buffer.from(match[1], 'base64');
      if (bytes.length > 10 * mb || bytes.toString('base64') !== match[1])
        throw fail(400, 'Некорректное изображение.');
      await png(bytes);
      if (bytes.readUInt32BE(16) > 2000 || bytes.readUInt32BE(20) > 2000)
        throw fail(400, 'Изображение превышает размер экспорта конструктора.');
    }
  }
  return d;
}
async function attachments(files) {
  const allowed = ['design', 'preview', 'front', 'back'];
  if (
    !files?.length ||
    files.some((f) => !allowed.includes(f.fieldname)) ||
    new Set(files.map((f) => f.fieldname)).size !== files.length ||
    files.reduce((sum, f) => sum + f.size, 0) > 50 * mb
  )
    throw fail(400, 'Нужен полный пакет макета до 50 МБ.');
  const get = (kind) => files.find((f) => f.fieldname === kind);
  if (
    !get('design') ||
    get('design').size > 20 * mb ||
    !get('preview') ||
    get('preview').size > 8 * mb
  )
    throw fail(400, 'Нужны JSON до 20 МБ и PNG-превью до 8 МБ.');
  let design;
  try {
    design = JSON.parse(get('design').buffer.toString('utf8'));
  } catch {
    throw fail(400, 'Не удалось прочитать JSON макета.');
  }
  await validateDesign(design);
  await png(get('preview').buffer, 1440, 1000);
  for (const side of ['front', 'back']) {
    if (Boolean(get(side)) !== Boolean(design[side].length))
      throw fail(400, 'Не хватает PNG принта или есть лишняя сторона.');
    if (get(side)) {
      if (get(side).size > 12 * mb) throw fail(400, 'PNG принта — до 12 МБ.');
      await png(get(side).buffer, 2400, 3368);
    }
  }
  return design;
}
function parameters(design, rateKopecks = MERCH_PRICE * 100) {
  return {
    params: {
      design: 'studio',
      size: design.size,
      copies: design.count,
      shirtColorName: design.shirtColorName,
      shirtColor: design.shirtColor,
      title: design.title,
    },
    quote: {
      copies: design.count,
      rate: rateKopecks / 100,
      total: (design.count * rateKopecks) / 100,
      totalKopecks: design.count * rateKopecks,
    },
  };
}
module.exports = { attachments, parameters };
