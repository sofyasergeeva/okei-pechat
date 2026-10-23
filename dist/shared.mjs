export const formatMoney = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
export const formatDate = (s) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Yekaterinburg',
  }).format(new Date(s));
export const escapeHTML = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const createId = () =>
  globalThis.crypto?.randomUUID?.() ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);
export function plural(n, a, b, c) {
  const v = n % 100;
  return v >= 11 && v <= 14 ? c : n % 10 === 1 ? a : n % 10 >= 2 && n % 10 <= 4 ? b : c;
}
