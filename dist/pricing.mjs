import { MERCH_PRICE } from './customer/orders.mjs';
export const priceFields = [
  ...['A4', 'A3'].flatMap((format) => [
    [format + '_mono_one', format, 'Чёрно-белая · одна сторона', '₽ / лист'],
    [format + '_mono_two', format, 'Чёрно-белая · две стороны', '₽ / лист'],
    [format + '_color_one', format, 'Цветная · одна сторона', '₽ / лист'],
    [format + '_color_two', format, 'Цветная · две стороны', '₽ / лист'],
    [format + '_photo_one', format, 'Фотобумага · одна сторона', '₽ / лист'],
  ]),
  ['spiralSmall', 'Переплёт', 'Брошюровка · до 50 листов', '₽ / экземпляр'],
  ['spiralLarge', 'Переплёт', 'Брошюровка · больше 50 листов', '₽ / экземпляр'],
  ['diploma', 'Переплёт', 'Дипломный переплёт', '₽ / экземпляр'],
  ['merch', 'Мерч', 'Футболка с принтом · обе стороны', '₽ / шт.'],
];
export const moneyFields = [
  'print',
  'binding',
  'bindingPerCopy',
  'total',
  'savings',
  'rateOne',
  'rateTwo',
];
export function initialPrices(math) {
  return Object.fromEntries(
    priceFields.map(([key]) => {
      const [format, color, side] = key.split('_');
      const value =
        key === 'merch'
          ? MERCH_PRICE
          : key.includes('_')
            ? math.rates[format][color][side]
            : math.bindings[key];
      return [key, value * 100];
    }),
  );
}
export function parsePrice(value) {
  if (typeof value !== 'string' || !/^\d{1,7}(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw Error('Укажи цену с точностью до копейки.');
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents < 1 || cents > 100000000) throw Error('Цена — от 0,01 до 1 000 000 ₽.');
  return cents;
}
export const priceText = (cents) => (cents / 100).toFixed(2);
export function quoteWithPrices(math, draft, book) {
  const rates = Object.fromEntries(
    ['A4', 'A3'].map((format) => [
      format,
      Object.fromEntries(
        ['mono', 'color', 'photo'].map((color) => [
          color,
          {
            one: book.values[format + '_' + color + '_one'],
            two: color === 'photo' ? null : book.values[format + '_' + color + '_two'],
          },
        ]),
      ),
    ]),
  );
  const q = { ...math.quote(draft, { rates, bindings: book.values }) };
  q.totalKopecks = q.total;
  for (const name of moneyFields) if (q[name] !== null) q[name] /= 100;
  return q;
}
