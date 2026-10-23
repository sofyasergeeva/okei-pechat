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
