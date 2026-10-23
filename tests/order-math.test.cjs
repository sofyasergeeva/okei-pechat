const test = require('node:test');
const assert = require('node:assert/strict');
const { loadOrderMath } = require('./customer-harness.cjs');

const math = loadOrderMath();
const base = {
  pages: 3,
  copies: 1,
  format: 'A4',
  paper: 'normal',
  color: 'mono',
  duplex: false,
  binding: 'none',
};
const quote = (changes = {}) => math.quote({ ...base, ...changes });

test('Тарифы: A4/A3, чёрно-белая, цветная и фотопечать', () => {
  for (const [parameters, total] of [
    [{ copies: 2 }, 24],
    [{ pages: 2, color: 'color' }, 50],
    [{ pages: 2, format: 'A3' }, 20],
    [{ pages: 4, format: 'A3', color: 'color', duplex: true }, 160],
    [{ pages: 2, paper: 'photo', color: 'color' }, 80],
    [{ pages: 2, format: 'A3', paper: 'photo', color: 'color' }, 160],
  ]) {
    assert.equal(quote(parameters).total, total, JSON.stringify(parameters));
  }
});

test('Нечётный duplex: 3 страницы × 2 копии, 4 листа, 20 ₽', () => {
  const result = quote({ copies: 2, duplex: true });
  assert.equal(result.total, 20);
  assert.equal(result.sheets, 4);
  assert.equal(result.sheetsPerCopy, 2);
  assert.equal(result.pairs, 2);
  assert.equal(result.singles, 2);
  assert.equal(result.impressions, 6);
  assert.equal(result.savings, 4);
});

test('Стоимость учитывает selectedPages вместо полного размера PDF', () => {
  const result = quote({ pages: 100, selectedPages: 2 });
  assert.equal(result.pages, 2);
  assert.equal(result.sheets, 2);
  assert.equal(result.total, 8);
});

test('Копии: допустимы границы 1 и 99, числовое значение из поля ввода', () => {
  assert.equal(quote({ copies: 1 }).total, 12);
  assert.equal(quote({ copies: 99 }).total, 1188);
  assert.equal(quote({ copies: '2' }).copies, 2);
});

test('Порог брошюровки определяется физическими листами каждой копии', () => {
  for (const [parameters, binding, total] of [
    [{ pages: 50 }, 100, 300],
    [{ pages: 51 }, 150, 354],
    [{ pages: 51, duplex: true }, 100, 254],
    [{ pages: 100, duplex: true }, 100, 400],
    [{ pages: 102, duplex: true }, 150, 456],
  ]) {
    const result = quote({ ...parameters, binding: 'spiral' });
    assert.equal(result.binding, binding, JSON.stringify(parameters));
    assert.equal(result.total, total, JSON.stringify(parameters));
  }
});

test('Дипломный переплёт оплачивается для каждой копии', () => {
  const result = quote({ binding: 'diploma', copies: 2 });
  assert.equal(result.binding, 1050);
  assert.equal(result.total, 1074);
});

test('Пустой диапазон выбирает все страницы', () => {
  assert.deepEqual(Array.from(math.selection(3, '   ')), [1, 2, 3]);
});

test('Диапазоны: пробелы, два допустимых тире, сортировка и удаление повторов', () => {
  assert.deepEqual(Array.from(math.selection(8, ' 5, 1-3, 2–4 ')), [1, 2, 3, 4, 5]);
});

test('Диапазоны отклоняют неверный синтаксис и страницы за границами PDF', () => {
  for (const range of ['0', '1-6', '4-2', '1,', 'a', '1-2-3']) {
    assert.throws(() => math.selection(5, range), undefined, range);
  }
});

test('Разбор диапазонов отклоняет недопустимое число страниц PDF', () => {
  for (const pages of [0, -1, 1.5, NaN]) {
    assert.throws(() => math.selection(pages, ''), /страницы PDF/);
  }
});

test('Расчёт отклоняет пустое, отрицательное и дробное количество страниц', () => {
  for (const pages of [0, -1, 1.5, undefined]) {
    assert.throws(() => quote({ pages }), /хотя бы одну страницу/);
  }
});

test('Расчёт отклоняет недопустимое количество копий', () => {
  for (const copies of ['', 0, -1, 1.5, 100, NaN, Infinity]) {
    assert.throws(() => quote({ copies }), /от 1 до 99/);
  }
});

test('Расчёт отклоняет неизвестный формат и цвет обычной печати', () => {
  assert.throws(() => quote({ format: 'A5' }), /формат и цвет/);
  assert.throws(() => quote({ color: 'unknown' }), /формат и цвет/);
});

test('Фотобумага не допускает двустороннюю печать', () => {
  assert.throws(() => quote({ paper: 'photo', duplex: true }), /только для односторонней/);
});
