import { createId as uid } from '../shared.mjs';
import { blank, captureSession, checkSession } from './state.mjs';

export const MERCH_PRICE = 950;
function newOrder(state, details) {
  return {
    id: String(Math.max(1045, ...state.orders.map((order) => Number(order.id))) + 1),
    ...details,
    created: new Date().toISOString(),
    status: 'new',
    customer: { ...state.profile },
    events: [{ status: 'new', time: new Date().toISOString() }],
    messages: [],
    unread: 0,
  };
}

export function sampleOrders() {
  const now = new Date().toISOString();
  return [
    {
      id: '1042',
      kind: 'document',
      title: 'Курсовая работа.pdf',
      status: 'work',
      created: now,
      total: 96,
      params: {
        pages: 24,
        selectedPages: 24,
        copies: 1,
        format: 'A4',
        color: 'mono',
        paper: 'normal',
        duplex: false,
        binding: 'none',
      },
      events: [
        { status: 'new', time: now },
        { status: 'work', time: now },
      ],
      messages: [],
      unread: 0,
      sample: true,
    },
    {
      id: '1041',
      kind: 'merch',
      title: 'Футболка «ОКЭИ / Классика»',
      status: 'ready',
      created: now,
      total: 950,
      params: { size: 'M', copies: 1, design: 'classic' },
      events: [
        { status: 'new', time: now },
        { status: 'work', time: now },
        { status: 'ready', time: now },
      ],
      messages: [],
      unread: 0,
      sample: true,
    },
    {
      id: '1040',
      kind: 'document',
      title: 'Материалы к проекту.pdf',
      status: 'attention',
      created: now,
      total: 300,
      params: {
        pages: 12,
        selectedPages: 12,
        copies: 1,
        format: 'A4',
        color: 'color',
        paper: 'normal',
        duplex: false,
        binding: 'none',
      },
      events: [
        { status: 'new', time: now },
        { status: 'attention', time: now },
      ],
      messages: [
        {
          id: 'm1',
          author: 'staff',
          text: 'На третьей странице есть цветная схема. Печатать весь документ в цвете или заменить файл на чёрно-белый?',
          time: now,
        },
      ],
      unread: 1,
      sample: true,
    },
    {
      id: '1038',
      kind: 'document',
      title: 'Практическая работа.pdf',
      status: 'issued',
      created: now,
      total: 48,
      params: {
        pages: 12,
        selectedPages: 12,
        copies: 1,
        format: 'A4',
        color: 'mono',
        paper: 'normal',
        duplex: false,
        binding: 'none',
      },
      events: [
        { status: 'new', time: now },
        { status: 'work', time: now },
        { status: 'ready', time: now },
        { status: 'issued', time: now },
      ],
      messages: [],
      unread: 0,
      sample: true,
    },
  ];
}
export const activeOrders = (orders) =>
  orders
    .filter((o) => !['issued', 'cancelled'].includes(o.status))
    .sort(
      (a, b) =>
        ['attention', 'ready', 'review', 'work', 'new'].indexOf(a.status) -
        ['attention', 'ready', 'review', 'work', 'new'].indexOf(b.status),
    );
export function filteredOrders(orders, filter, search) {
  return orders.filter(
    (o) =>
      (filter === 'all' ||
        (filter === 'active' && !['issued', 'cancelled'].includes(o.status)) ||
        (filter === 'completed' && o.status === 'issued') ||
        (filter === 'cancelled' && o.status === 'cancelled')) &&
      (!search || (o.id + ' ' + o.title).toLowerCase().includes(search.toLowerCase())),
  );
}
export function calculateQuote(draft, math) {
  try {
    if (draft.useRange && !draft.range.trim())
      return { error: 'Укажи страницы, например: 1–3, 5.' };
    const selected = math.selection(draft.pages, draft.useRange ? draft.range : '');
    return { q: math.quote({ ...draft, selectedPages: selected.length }), selected };
  } catch (e) {
    return { error: e.message };
  }
}

function documentOrder(state, q, selected) {
  return newOrder(state, {
    kind: 'document',
    title: state.draft.fileName,
    fileKey: state.draft.fileKey,
    total: q.total,
    params: { ...state.draft, selectedPages: selected.length, pageList: selected },
    quote: q,
    comment: state.draft.comment,
  });
}

export async function placeDocumentOrder(
  state,
  repository,
  operation,
  submittedDraft,
  q,
  selected,
) {
  const file = await repository.getFile(submittedDraft.fileKey);
  checkSession(state, operation);
  if (!file) throw Error('Файл не найден. Загрузи его снова.');
  if (JSON.stringify(state.draft) !== JSON.stringify(submittedDraft))
    throw Error('Черновик изменился. Проверь параметры и повтори оформление.');
  const order = documentOrder(state, q, selected);
  state.orders.unshift(order);
  return repository.persist('orders', { clearDraft: true }) ? order : null;
}

export async function placeStudioOrder(state, repository, design, preview) {
  const { putFile, persist } = repository;
  const operation = captureSession(state);
  const orderKey = 'design-' + uid(),
    previewKey = 'preview-' + uid();
  await putFile(orderKey, new Blob([JSON.stringify(design)], { type: 'application/json' }));
  checkSession(state, operation);
  await putFile(previewKey, preview);
  checkSession(state, operation);
  const o = newOrder(state, {
    kind: 'merch',
    title: 'Футболка «' + (design.title || 'Мой дизайн') + '»',
    total: design.count * MERCH_PRICE,
    params: {
      design: 'studio',
      size: design.size,
      copies: design.count,
      shirtColorName: design.shirtColorName,
    },
    designKey: orderKey,
    previewKey,
  });
  state.orders.unshift(o);
  if (!persist('orders'))
    throw Error('Заказ не сохранён. Проверь свободное место и повтори попытку.');

  return o;
}

export function cancelOrder(order) {
  if (order?.status !== 'new') return false;
  order.status = 'cancelled';
  order.events.push({ status: 'cancelled', time: new Date().toISOString() });
  return true;
}
export function advanceDemoStatus(order) {
  const next = { new: 'work', work: 'ready', ready: 'issued', attention: 'work', review: 'work' }[
    order.status
  ];
  if (!next) return false;
  order.status = next;
  order.events.push({ status: next, time: new Date().toISOString() });
  return true;
}
export function addCustomerMessage(order, text) {
  order.messages.push({ id: uid(), author: 'user', text, time: new Date().toISOString() });
  if (order.status === 'attention') {
    order.status = 'review';
    order.events.push({ status: 'review', time: new Date().toISOString() });
  }
}
export function repeatDocument(order) {
  return {
    ...blank(),
    ...order.params,
    step: order.fileKey ? 2 : 1,
    fileKey: order.fileKey || '',
    fileName: order.fileKey ? order.title : '',
    pages: order.fileKey ? order.params.pages : 0,
  };
}

export function placeCollectionOrder(state, repository, d) {
  const o = newOrder(state, {
    kind: 'merch',
    title: d.design === 'custom' ? 'Футболка «' + d.text + '»' : 'Футболка «ОКЭИ / Классика»',
    total: d.count * MERCH_PRICE,
    params: { ...d, copies: d.count },
  });
  state.orders.unshift(o);
  if (!repository.persist('orders')) return null;

  return o;
}
