import { createId as uid } from '../shared.mjs';
import { formatDate as stamp } from '../shared.mjs';
export const fixtureKey = 'okei-staff-demo-v1';
export const labels = {
  new: 'Новый',
  work: 'В работе',
  ready: 'К выдаче',
  attention: 'Ждём ответ',
  review: 'Есть ответ',
  issued: 'Выдан',
  cancelled: 'Отменён',
};
export const icons = {
  new: 'file',
  work: 'clock',
  ready: 'check',
  attention: 'message',
  review: 'message',
  issued: 'check',
  cancelled: 'close',
};
const now = () => new Date().toISOString();
export function createStaffState() {
  return {
    user: null,
    page: 'queue',
    filter: 'active',
    kind: 'all',
    query: '',
    chosen: '',
    all: [],
    detailTab: 'info',
    mobileOpen: false,
    confirm: '',
    checked: new Set(),
    originFocus: null,
    stale: false,
    writing: new Map(),
    framePending: false,
  };
}
export const active = (o) => !['issued', 'cancelled'].includes(o.status);
export function seed() {
  const time = now(),
    base = {
      kind: 'document',
      created: time,
      total: 12,
      params: {
        pages: 3,
        selectedPages: 3,
        copies: 1,
        format: 'A4',
        color: 'mono',
        paper: 'normal',
        duplex: false,
        binding: 'none',
      },
      events: [{ status: 'new', time }],
      messages: [],
      unread: 0,
      staffSample: true,
      sampleFile: true,
      customer: { name: 'Арина', group: 'ИСП-24' },
    };
  return [
    {
      ...base,
      id: '1052',
      title: 'Практическая работа.pdf',
      status: 'new',
      comment: 'Заберу после занятий.',
    },
    {
      ...base,
      id: '1051',
      title: 'Материалы для защиты.pdf',
      status: 'new',
      params: { ...base.params, color: 'color' },
      total: 75,
      customer: { name: 'Мария', group: 'Д-22' },
    },
    {
      ...base,
      id: '1050',
      title: 'Тезисы к проекту.pdf',
      status: 'work',
      params: { ...base.params, duplex: true, copies: 2 },
      total: 20,
      customer: { name: 'Даниил', group: 'ИСП-23' },
      events: [
        { status: 'new', time },
        { status: 'work', time },
      ],
    },
    {
      ...base,
      id: '1049',
      title: 'Футболка «ОКЭИ / Классика»',
      kind: 'merch',
      status: 'ready',
      sampleFile: false,
      params: { size: 'M', copies: 1, design: 'classic' },
      total: 950,
      customer: { name: 'Анастасия', group: 'ЭК-24' },
      events: [
        { status: 'new', time },
        { status: 'work', time },
        { status: 'ready', time },
      ],
    },
    {
      ...base,
      id: '1048',
      title: 'Проектная работа.pdf',
      status: 'attention',
      resumeStatus: 'new',
      customer: { name: 'Алина', group: 'ИСП-24' },
      messages: [
        {
          id: 'fixture-question',
          author: 'staff',
          text: 'На третьей странице схема. Подтверди, что печатаем в чёрно-белом варианте.',
          time,
        },
      ],
    },
    {
      ...base,
      id: '1047',
      title: 'Доклад.pdf',
      status: 'issued',
      payment: 'paid',
      paidAt: time,
      customer: { name: 'Иван', group: 'ИСП-23' },
      events: [
        { status: 'new', time },
        { status: 'work', time },
        { status: 'ready', time },
        { status: 'issued', time },
      ],
    },
  ];
}
export function fingerprint(o) {
  return JSON.stringify([o.status, o.params, o.total, o.messages, o.events]);
}
export function changeStatus(o, status) {
  o.status = status;
  (o.events ??= []).push({ status, time: now() });
}
export function visible(state) {
  return state.all
    .filter(
      (o) =>
        (state.page === 'archive'
          ? !active(o)
          : state.filter === 'all'
            ? true
            : state.filter === 'active'
              ? active(o)
              : state.filter === 'questions'
                ? ['attention', 'review'].includes(o.status)
                : o.status === state.filter) &&
        (state.kind === 'all' || o.kind === state.kind) &&
        (!state.query ||
          [o.id, o.title, o.customer.name, o.customer.group]
            .join(' ')
            .toLowerCase()
            .includes(state.query.toLowerCase())),
    )
    .sort((a, b) =>
      state.page === 'archive'
        ? new Date(b.events?.at(-1)?.time || b.created) -
          new Date(a.events?.at(-1)?.time || a.created)
        : ({ review: 0, new: 1, work: 2, ready: 3, attention: 4 }[a.status] ?? 5) -
            ({ review: 0, new: 1, work: 2, ready: 3, attention: 4 }[b.status] ?? 5) ||
          new Date(a.created) - new Date(b.created),
    );
}
export function summarizeGroups(orders) {
  const map = new Map();
  orders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o) => {
      const k = o.customer.group || 'Без группы';
      if (!map.has(k)) map.set(k, { name: k, count: 0, active: 0, issued: 0, total: 0, paid: 0 });
      const g = map.get(k);
      g.count++;
      g.active += Number(active(o));
      g.issued += Number(o.status === 'issued');
      g.total += o.total;
      g.paid += o.payment === 'paid' ? o.total : 0;
    });
  const rows = [...map.values()].sort((a, b) => b.count - a.count),
    total = rows.reduce((s, g) => s + g.total, 0),
    paid = rows.reduce((s, g) => s + g.paid, 0);
  return { rows, total, paid };
}

export function createCSV(all) {
  const cell = (v) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const rows = [
    ['Номер', 'Дата', 'Группа', 'Заказчик', 'Заказ', 'Статус', 'Сумма ₽', 'Оплата', 'Источник'],
    ...all.map((o) => [
      o.id,
      stamp(o.created),
      o.customer.group,
      o.customer.name,
      o.title,
      labels[o.status],
      o.total,
      o.payment === 'paid' ? 'Отмечена' : 'Не отмечена',
      o._store === fixtureKey ? 'Демопример' : 'Локальный заказ',
    ]),
  ];
  return '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function resumeConfirmed(current) {
  if (current.status === 'attention') changeStatus(current, 'work');
}

export function advanceConfirmed(current, expectedStatus, status) {
  if (current.status !== expectedStatus) return;
  changeStatus(current, status);
  current.checkedBy = 'staff_01';
  current.checkedAt = now();
}

export function appendStaffMessage(current, text, pause) {
  (current.messages ??= []).push({
    id: uid(),
    author: 'staff',
    text,
    time: now(),
  });
  current.unread = (current.unread || 0) + 1;
  if (pause && ['new', 'work', 'review'].includes(current.status)) {
    current.resumeStatus = current.status;
    changeStatus(current, 'attention');
  }
}

export function issuePaid(current) {
  if (current.status !== 'ready') return;
  current.payment = 'paid';
  current.paidAt = now();
  changeStatus(current, 'issued');
}

export function cancelWithReason(current, reason) {
  if (!['new', 'work', 'review'].includes(current.status)) return;
  current.cancelReason = reason;
  changeStatus(current, 'cancelled');
}

export function canAdvance(order, next, checked) {
  return (
    { new: 'work', review: 'work', work: 'ready' }[order.status] === next &&
    (!['new', 'review'].includes(order.status) || checked)
  );
}
