window.initializeStaff = function (helpers) {
  'use strict';
  const { escapeHTML: E, formatMoney: rub, formatDate: stamp, createId: uid } = helpers;
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)],
    I = (n) => window.OkeiUI.icon(n),
    now = () => new Date().toISOString();
  const fixtureKey = 'okei-staff-demo-v1',
    labels = {
      new: 'Новый',
      work: 'В работе',
      ready: 'К выдаче',
      attention: 'Ждём ответ',
      review: 'Есть ответ',
      issued: 'Выдан',
      cancelled: 'Отменён',
    },
    icons = {
      new: 'file',
      work: 'clock',
      ready: 'check',
      attention: 'message',
      review: 'message',
      issued: 'check',
      cancelled: 'close',
    };
  const entryTitle = document.title;
  let user = null,
    page = 'queue',
    filter = 'active',
    kind = 'all',
    query = '',
    chosen = '',
    all = [],
    detailTab = 'info',
    mobileOpen = false,
    confirm = '',
    checked = new Set(),
    originFocus = null,
    stale = false;
  const writing = new Map();
  const read = (k, f) => {
      try {
        return JSON.parse(localStorage.getItem(k)) ?? f;
      } catch {
        return f;
      }
    },
    active = (o) => !['issued', 'cancelled'].includes(o.status),
    badge = (o) =>
      `<span class="w-status w-${o.status}">${I(icons[o.status])}${labels[o.status] || E(o.status)}</span>`;
  function seed() {
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
  function load() {
    stale = false;
    all = [];
    if (!localStorage.getItem(fixtureKey))
      localStorage.setItem(fixtureKey, JSON.stringify({ orders: seed() }));
    const keys = [fixtureKey];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('okei-customer-v1:')) keys.push(k);
    }
    for (const k of keys) {
      const data = read(k, {});
      for (const o of data.orders || []) {
        all.push({
          ...o,
          _store: k,
          _ref: k + '::' + o.id,
          customer: o.customer || data.profile || { name: 'Заказчик', group: 'Без группы' },
        });
      }
    }
    all.sort((a, b) => new Date(b.created) - new Date(a.created) || Number(b.id) - Number(a.id));
  }
  const selected = () => all.find((o) => o._ref === chosen);
  function fingerprint(o) {
    return JSON.stringify([o.status, o.params, o.total, o.messages, o.events]);
  }
  function update(ref, fn) {
    const item = all.find((o) => o._ref === ref);
    if (!item) return false;
    const data = read(item._store, null),
      order = data?.orders?.find((o) => o.id === item.id);
    if (!order) {
      notify('Заказ уже изменён. Обнови очередь.');
      return false;
    }
    if (fingerprint(order) !== fingerprint(item)) {
      checked.delete(ref);
      confirm = '';
      load();
      draw();
      notify('Заказ изменился. Проверь актуальные параметры и статус.');
      return false;
    }
    fn(order);
    try {
      localStorage.setItem(item._store, JSON.stringify(data));
      load();
      return true;
    } catch {
      notify('Не удалось сохранить. Проверь свободное место в браузере.');
      return false;
    }
  }
  function changeStatus(o, status) {
    o.status = status;
    (o.events ??= []).push({ status, time: now() });
  }
  function notify(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => el.classList.remove('show'), 3800);
  }
  function init(u) {
    if (user) return;
    user = u;
    load();
    chosen = visible()[0]?._ref || '';
  }
  function nav() {
    return `<nav class="w-nav" aria-label="Кабинет сотрудника">${[
      ['queue', 'Очередь', 'printer'],
      ['archive', 'История', 'orders'],
      ['groups', 'По группам', 'user'],
    ]
      .map(
        ([id, label, icon]) =>
          `<button data-w-page="${id}" class="${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${I(icon)}<span>${label}</span>${id === 'queue' ? `<small>${all.filter(active).length}</small>` : ''}</button>`,
      )
      .join(
        '',
      )}<div class="w-sidebar-art" aria-hidden="true"><small>ТИПОГРАФИЯ ОКЭИ</small><div class="w-sculpture">${$('#pdf').innerHTML}</div></div><div class="w-identity"><span>${I('user')} Сотрудник типографии</span><button data-action="logout">Выйти ${I('arrow')}</button></div></nav>`;
  }
  function counts() {
    return `<div class="w-stats" aria-label="Очередь по статусам">${[
      ['active', 'Все', 'orders'],
      ['new', 'Новые', 'file'],
      ['work', 'В работе', 'clock'],
      ['ready', 'К выдаче', 'check'],
      ['questions', 'Уточнения', 'message'],
    ]
      .map(([id, text, icon]) => {
        const n = all.filter((o) =>
          id === 'active'
            ? active(o)
            : id === 'questions'
              ? ['attention', 'review'].includes(o.status)
              : o.status === id,
        ).length;
        return `<button class="w-stat ${filter === id ? 'active' : ''} w-stat-${id}" data-w-filter="${id}" aria-pressed="${filter === id}"><span>${I(icon)}${text}</span><b>${n}</b></button>`;
      })
      .join('')}</div>`;
  }
  function visible() {
    return all
      .filter(
        (o) =>
          (page === 'archive'
            ? !active(o)
            : filter === 'all'
              ? true
              : filter === 'active'
                ? active(o)
                : filter === 'questions'
                  ? ['attention', 'review'].includes(o.status)
                  : o.status === filter) &&
          (kind === 'all' || o.kind === kind) &&
          (!query ||
            [o.id, o.title, o.customer.name, o.customer.group]
              .join(' ')
              .toLowerCase()
              .includes(query.toLowerCase())),
      )
      .sort((a, b) =>
        page === 'archive'
          ? new Date(b.events?.at(-1)?.time || b.created) -
            new Date(a.events?.at(-1)?.time || a.created)
          : ({ review: 0, new: 1, work: 2, ready: 3, attention: 4 }[a.status] ?? 5) -
              ({ review: 0, new: 1, work: 2, ready: 3, attention: 4 }[b.status] ?? 5) ||
            new Date(a.created) - new Date(b.created),
      );
  }
  function row(o) {
    return `<button class="w-order ${o._ref === chosen ? 'selected' : ''}" data-w-order="${E(o._ref)}" aria-label="Заказ №${E(o.id)}, ${E(o.title)}, ${labels[o.status]}" ${o._ref === chosen ? 'aria-current="true"' : ''}><span class="w-file ${o.kind === 'merch' ? 'w-shirt' : ''}">${o.kind === 'merch' ? '<img src="/assets/college-shirt.png" alt="">' : 'PDF'}</span><span class="w-order-title"><small>№${E(o.id)} · ${E(o.customer.group)}</small><b>${E(o.title)}</b><span>${o.kind === 'document' ? `${E(o.params.format)} · ${o.params.selectedPages || o.params.pages} стр. · ${o.params.copies} коп. · ${o.params.duplex ? '2 стороны' : '1 сторона'}` : `${E(o.params.size)} · ${o.params.copies} шт.`}</span></span><span class="w-order-end">${badge(o)}<b>${rub(o.total)}</b></span><span class="w-row-arrow">${I('arrow')}</span></button>`;
  }
  function controls() {
    return `<div class="w-list-controls"><label class="w-search"><span class="sr-only">Поиск по номеру, файлу, имени или группе</span><input id="w-search" type="search" placeholder="Номер, файл или группа" value="${E(query)}"></label><div class="w-segments" role="group" aria-label="Тип заказа">${[
      ['all', 'Все'],
      ['document', 'Печать'],
      ['merch', 'Мерч'],
    ]
      .map(
        ([id, label]) =>
          `<button data-w-kind="${id}" aria-pressed="${kind === id}" class="${kind === id ? 'active' : ''}">${label}</button>`,
      )
      .join('')}</div></div>`;
  }
  function queue() {
    const rows = visible(),
      pending = all.filter((o) => o.status === 'review').length;
    return `<header class="w-heading"><div><h1>${page === 'archive' ? 'История.' : 'Очередь заказов.'}</h1></div><button class="w-button w-outline" data-w-refresh aria-label="Обновить очередь">${I('clock')} <span>Обновить</span><i class="w-refresh-dot" ${stale ? '' : 'hidden'}></i></button></header>${page === 'queue' ? counts() : ''}${pending && page === 'queue' ? `<button class="w-reply-callout" data-w-filter="questions">${I('message')}<span>Ответ заказчика <b>${pending}</b></span><span>Посмотреть ${I('arrow')}</span></button>` : ''}<div class="w-workspace"><section class="w-queue-panel" aria-label="Список заказов"><div class="w-section-title"><h2>${page === 'archive' ? 'Завершённые' : filter === 'active' ? 'Текущие заказы' : filter === 'questions' ? 'Уточнения' : filter === 'all' ? 'Все заказы' : { new: 'Новые заказы', work: 'В работе', ready: 'К выдаче' }[filter] || 'Заказы'} <small id="w-result-count">${rows.length}</small></h2>${query || kind !== 'all' || !['active', 'all'].includes(filter) ? '<button class="w-text" data-w-clear>Сбросить фильтры</button>' : ''}</div>${controls()}<div id="w-results">${rows.length ? rows.map(row).join('') : '<div class="w-empty">' + I('check') + '<h3>Здесь пока спокойно.</h3><p>Выбери другой статус или измени поиск.</p></div>'}</div></section><aside class="w-inspector" aria-label="Выбранный заказ">${detail()}</aside></div>`;
  }
  function param(label, value) {
    return `<div><dt>${label}</dt><dd>${E(value)}</dd></div>`;
  }
  function params(o) {
    const p = o.params;
    return `<dl class="w-params">${o.kind === 'document' ? param('Формат', p.format) + param('Цвет', p.color === 'color' ? 'Цветная' : 'Чёрно-белая') + param('Страницы', p.useRange ? p.range : (p.selectedPages || p.pages) + ' · все') + param('Стороны', p.duplex ? 'С двух сторон' : 'С одной стороны') + param('Копии', p.copies) + param('Листов', Math.ceil((p.selectedPages || p.pages) / (p.duplex ? 2 : 1)) * p.copies) + param('Бумага', p.paper === 'photo' ? 'Фотобумага' : 'Обычная') + param('Переплёт', p.binding === 'spiral' ? 'Пружина' : p.binding === 'diploma' ? 'Дипломный' : 'Без переплёта') : param('Размер', p.size) + param('Количество', p.copies) + param('Цвет', p.shirtColorName || p.color || 'Молочный') + param('Макет', p.design === 'studio' ? 'Из конструктора' : p.design === 'classic' ? 'Логотип ОКЭИ' : 'Своя надпись')}</dl>`;
  }
  function actions(o) {
    if (confirm === 'issue')
      return `<form id="w-issue-form" class="w-confirm"><h3>Выдать заказ №${E(o.id)}?</h3><label class="w-check"><input type="checkbox" name="paid" required>Оплата получена</label><div><button class="w-button w-primary" type="submit">Подтвердить выдачу</button><button class="w-text" type="button" data-w-dismiss>Назад</button></div><small>Отметка учёта без списания денег.</small></form>`;
    if (confirm === 'cancel')
      return `<form id="w-cancel-form" class="w-confirm"><h3>Отменить заказ?</h3><label class="w-label">Причина<input name="reason" required maxlength="300" placeholder="Например, отмена заказчиком"></label><div><button class="w-button w-primary" type="submit">Подтвердить отмену</button><button class="w-text" type="button" data-w-dismiss>Назад</button></div></form>`;
    if (o.status === 'issued')
      return `<div class="w-final-note">${I('check')}<span>Заказ выдан<small>${o.payment === 'paid' ? 'Оплата отмечена' : 'Оплата не отмечена в старом демозаказе'}</small></span></div>`;
    if (o.status === 'cancelled')
      return `<div class="w-final-note">${I('close')}<span>Заказ отменён<small>${E(o.cancelReason || 'Отменён заказчиком')}</small></span></div>`;
    if (o.status === 'attention')
      return `<div class="w-action-block"><button class="w-button w-outline" data-w-tab="chat">Открыть переписку ${I('message')}</button><label class="w-check"><input type="checkbox" data-w-checked ${checked.has(o._ref) ? 'checked' : ''}>Уточнение согласовано</label><button class="w-button w-primary" data-w-resume ${checked.has(o._ref) ? '' : 'disabled'}>Вернуть в работу ${I('printer')}</button></div>`;
    const next = {
      new: ['work', 'Принять в работу'],
      review: ['work', 'Вернуть в работу'],
      work: ['ready', 'Отметить готовым'],
      ready: ['issued', 'Выдать заказ'],
    }[o.status];
    return `<div class="w-action-block">${['new', 'review'].includes(o.status) ? `<label class="w-check"><input type="checkbox" data-w-checked ${checked.has(o._ref) ? 'checked' : ''}>Файл и параметры проверены</label>` : ''}<button class="w-button w-primary" data-w-next="${next[0]}" ${['new', 'review'].includes(o.status) && !checked.has(o._ref) ? 'disabled' : ''}>${next[1]} ${I(next[0] === 'work' ? 'printer' : 'check')}</button>${['new', 'work', 'review'].includes(o.status) ? `<div class="w-secondary-actions"><button class="w-text" data-w-tab="chat">Уточнить ${I('message')}</button><details class="w-more"><summary>Ещё</summary><button class="w-text" data-w-cancel>Отменить заказ</button></details></div>` : ''}</div>`;
  }
  function chat(o) {
    return `<div class="w-chat"><p class="w-chat-note">${o._store === fixtureKey ? 'Демо-переписка · без реального адресата.' : 'Переписка локальная, в этом браузере.'}</p><div class="w-messages">${(o.messages || []).length ? o.messages.map((m) => `<div class="w-message ${m.author === 'staff' ? 'from-staff' : 'from-user'}"><small>${m.author === 'staff' ? 'Сотрудник' : E(o.customer.name)} · ${stamp(m.time)}</small><p>${E(m.text)}</p></div>`).join('') : '<div class="w-empty w-small-empty">' + I('message') + '<p>Уточни детали перед печатью.</p></div>'}</div>${active(o) ? `<form id="w-chat-form"><label class="w-label" for="w-message">Сообщение заказчику</label><textarea id="w-message" name="message" required maxlength="2000" rows="3" placeholder="Что нужно уточнить?">${E(writing.get(o._ref)?.text || '')}</textarea>${['new', 'work', 'review'].includes(o.status) ? `<label class="w-check"><input type="checkbox" name="pause" ${writing.get(o._ref)?.pause === false ? '' : 'checked'}>Приостановить до ответа</label>` : ''}<button class="w-button w-primary" type="submit">Сохранить сообщение ${I('arrow')}</button></form>` : ''}</div>`;
  }
  function fileActions(o) {
    return `<div class="w-file-actions">${o.kind === 'document' ? `<button class="w-button w-outline" data-w-file ${o.fileKey || o.sampleFile ? '' : 'disabled'}>${I('file')} ${o.fileKey || o.sampleFile ? 'Открыть PDF' : 'Нет исходного файла'}</button>` : o.previewKey || o.designKey ? `${o.previewKey ? '<button class="w-button w-outline" data-w-preview>Превью PNG</button>' : ''}${o.designKey ? '<button class="w-text" data-w-design>Исходный макет JSON</button>' : ''}` : ''}</div>`;
  }
  function detail() {
    const o = selected();
    if (!o) return `<div class="w-empty">${I('file')}<h3>Нет выбранного заказа.</h3></div>`;
    return `<div class="w-detail-header"><div class="w-detail-top"><span class="w-kicker">${o._store === fixtureKey ? 'ДЕМОЗАКАЗ' : 'ЗАКАЗ'}</span><button class="w-close" data-w-close aria-label="Закрыть заказ">${I('close')}</button></div><div class="w-detail-heading"><h2>№${E(o.id)}</h2>${badge(o)}</div><h3 class="w-detail-name">${E(o.title)}</h3><p class="w-customer">${E(o.customer.name)} <b>${E(o.customer.group)}</b><span>${stamp(o.created)}</span></p><div class="w-detail-tabs" role="tablist" aria-label="Детали заказа"><button role="tab" data-w-tab="info" aria-selected="${detailTab === 'info'}">Параметры</button><button role="tab" data-w-tab="chat" aria-selected="${detailTab === 'chat'}">Переписка ${(o.messages || []).length ? `<small>${o.messages.length}</small>` : ''}</button></div></div><div class="w-detail-body">${detailTab === 'chat' ? chat(o) : `${fileActions(o)}${o.kind === 'merch' ? `<div class="w-merch-preview"><img src="/assets/college-shirt.png" alt="Пример модели футболки">${o.params.design === 'classic' ? '<img class="w-merch-logo" src="/assets/college-red.svg" alt="Логотип ОКЭИ">' : '<span>Макет заказчика</span>'}</div>` : ''}${params(o)}${o.comment || o.params.comment ? `<div class="w-comment"><small>Комментарий</small><p>${E(o.comment || o.params.comment)}</p></div>` : ''}<details class="w-events"><summary>История и условия</summary><p class="w-tariff">Демотариф. Цена сохранена при оформлении.</p>${(o.events || []).map((e) => `<div><span>${labels[e.status] || E(e.status)}</span><time>${stamp(e.time)}</time></div>`).join('')}</details>`}</div>${detailTab === 'info' ? `<div class="w-detail-footer"><div class="w-total"><span>${o.payment === 'paid' ? 'Оплата отмечена' : 'К оплате'}</span><b>${rub(o.total)}</b></div>${actions(o)}</div>` : ''}`;
  }
  function groups() {
    const map = new Map();
    all
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
    return `<header class="w-heading"><div><span class="w-kicker">УЧЁТ / ОКЭИ</span><h1>Заказы по группам.</h1><p>Состав заказов, суммы и отмеченная оплата.</p></div><button class="w-button w-outline" data-w-export>Скачать CSV ${I('arrow')}</button></header><div class="w-report-totals"><div><small>Все заказы без отмен</small><b>${rub(total)}</b></div><div><small>Оплата отмечена</small><b>${rub(paid)}</b></div><div><small>Ожидается оплата</small><b>${rub(total - paid)}</b></div></div><section class="w-report"><div class="w-section-title"><h2>Учебные группы <small>${rows.length}</small></h2></div><div class="w-table-scroll"><table><thead><tr><th>Группа</th><th>Заказы</th><th>Активные</th><th>Выдано</th><th>Сумма</th><th>Оплачено</th></tr></thead><tbody>${rows.map((g) => `<tr><th scope="row"><button class="w-text" data-w-group="${E(g.name)}">${E(g.name)} ${I('arrow')}</button></th><td>${g.count}</td><td>${g.active}</td><td>${g.issued}</td><td>${rub(g.total)}</td><td>${rub(g.paid)}</td></tr>`).join('')}</tbody></table></div><p class="w-report-note">Группа сохраняется на момент оформления. Отменённые заказы исключены. Показаны локальные данные и примеры.</p></section>`;
  }
  function render(u) {
    init(u);
    queueMicrotask(() => {
      if (document.body.classList.contains('is-staff')) syncMobile();
    });
    document.title = 'ОКЭИ Печать — кабинет сотрудника';
    return `<div class="w-app">${nav()}<div class="w-content">${page === 'groups' ? groups() : queue()}</div><p class="w-demo-note">Демо-режим · заказы и сообщения доступны только в этом браузере.</p></div>`;
  }
  function pickVisible() {
    if (page === 'groups') return;
    const list = visible();
    if (!list.some((o) => o._ref === chosen)) {
      chosen = list[0]?._ref || '';
      detailTab = 'info';
      confirm = '';
    }
  }
  function draw() {
    if (!user || !document.body.classList.contains('is-staff')) return;
    $('#main').innerHTML = render(user);
    syncMobile();
  }
  function syncMobile() {
    const panel = $('.w-inspector');
    if (!panel) return;
    if (!matchMedia('(max-width:800px)').matches)
      panel.style.setProperty(
        '--w-room',
        Math.max(400, innerHeight - Math.max(16, panel.getBoundingClientRect().top) - 16) + 'px',
      );
    const open = mobileOpen && matchMedia('(max-width:800px)').matches;
    panel.classList.toggle('is-open', open);
    if (open) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      document.body.classList.add('w-panel-open');
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      document.body.classList.remove('w-panel-open');
    }
  }
  function open(ref, chatTab = false) {
    originFocus = document.activeElement;
    chosen = ref;
    detailTab = chatTab ? 'chat' : 'info';
    confirm = '';
    mobileOpen = true;
    draw();
    if (matchMedia('(max-width:800px)').matches) $('.w-close')?.focus();
    else window.OkeiUI.enter($('.w-detail-body'));
  }
  function close() {
    mobileOpen = false;
    confirm = '';
    draw();
    const b = $$('[data-w-order]').find((b) => b.dataset.wOrder === chosen);
    b?.focus();
  }
  function refreshResults() {
    const list = visible();
    if (!list.some((o) => o._ref === chosen)) {
      chosen = list[0]?._ref || '';
      detailTab = 'info';
      confirm = '';
      $('.w-inspector').innerHTML = detail();
    }
    $('#w-results').innerHTML = list.length
      ? list.map(row).join('')
      : '<div class="w-empty"><h3>Ничего не найдено.</h3><p>Попробуй другой номер или группу.</p></div>';
    $('#w-result-count').textContent = list.length;
  }
  async function getFile(key) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('okei-customer-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result,
          r = db.transaction('files').objectStore('files').get(key);
        r.onsuccess = () => {
          resolve(r.result);
          db.close();
        };
        r.onerror = () => {
          reject(r.error);
          db.close();
        };
      };
    });
  }
  function download(blob, name) {
    const a = document.createElement('a'),
      url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function openFile(o) {
    if (!o.fileKey && !o.sampleFile) {
      notify('У старого примера нет исходного PDF. Для проверки выбери новый демозаказ.');
      return;
    }
    const tab = window.open('about:blank', '_blank');
    try {
      const file = o.sampleFile
        ? await fetch('/assets/sample.pdf').then((r) => {
            if (!r.ok) throw Error();
            return r.blob();
          })
        : await getFile(o.fileKey);
      if (!file) throw Error();
      const url = URL.createObjectURL(file);
      if (tab) {
        tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        URL.revokeObjectURL(url);
        notify('Разреши открытие PDF в новой вкладке.');
      }
    } catch {
      tab?.close();
      notify('Исходный PDF не найден в этом браузере.');
    }
  }
  function exportCSV() {
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
    download(
      new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
      'okei-orders.csv',
    );
    notify('CSV содержит локальные заказы и демопримеры.');
  }
  document.addEventListener('click', async (e) => {
    if (!user || !document.body.classList.contains('is-staff')) return;
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.wPage) {
      page = d.wPage;
      query = '';
      kind = 'all';
      mobileOpen = false;
      confirm = '';
      window.OkeiUI.transition(() => {
        load();
        pickVisible();
        draw();
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      return;
    }
    if (d.wFilter) {
      page = 'queue';
      filter = d.wFilter;
      confirm = '';
      mobileOpen = false;
      window.OkeiUI.transition(() => {
        pickVisible();
        draw();
      });
      return;
    }
    if (d.wOrder) {
      open(d.wOrder);
      return;
    }
    if (d.wKind) {
      kind = d.wKind;
      pickVisible();
      draw();
      $('#w-search')?.focus();
      return;
    }
    if (d.wGroup) {
      page = 'queue';
      filter = 'all';
      query = d.wGroup;
      kind = 'all';
      pickVisible();
      draw();
      return;
    }
    if (b.hasAttribute('data-w-clear')) {
      query = '';
      kind = 'all';
      filter = 'active';
      pickVisible();
      draw();
      return;
    }
    if (b.hasAttribute('data-w-refresh')) {
      confirm = '';
      checked.clear();
      load();
      pickVisible();
      draw();
      notify('Очередь обновлена из этого браузера.');
      return;
    }
    if (b.hasAttribute('data-w-export')) {
      exportCSV();
      return;
    }
    if (b.hasAttribute('data-w-close')) {
      close();
      return;
    }
    const o = selected();
    if (!o) return;
    if (d.wTab) {
      detailTab = d.wTab;
      confirm = '';
      draw();
      window.OkeiUI.enter($('.w-detail-body'));
      return;
    }
    if (b.hasAttribute('data-w-file')) {
      await openFile(o);
      return;
    }
    if (b.hasAttribute('data-w-preview') || b.hasAttribute('data-w-design')) {
      try {
        const preview = b.hasAttribute('data-w-preview'),
          blob = await getFile(preview ? o.previewKey : o.designKey);
        if (!blob) throw Error();
        download(blob, 'okei-' + o.id + (preview ? '-preview.png' : '-design.json'));
        if (preview) notify('Превью для просмотра. Для производства используй исходный макет.');
      } catch {
        notify('Файл недоступен в этом браузере.');
      }
      return;
    }
    if (b.hasAttribute('data-w-dismiss')) {
      confirm = '';
      draw();
      return;
    }
    if (b.hasAttribute('data-w-cancel')) {
      confirm = 'cancel';
      draw();
      $('.w-confirm input')?.focus();
      return;
    }
    if (b.hasAttribute('data-w-resume')) {
      if (
        o.status === 'attention' &&
        checked.has(o._ref) &&
        update(o._ref, (current) => {
          if (current.status === 'attention') changeStatus(current, 'work');
        })
      ) {
        draw();
        notify('Уточнение согласовано. Заказ возвращён в работу.');
      }
      return;
    }
    if (d.wNext) {
      if (o.status === 'ready' && d.wNext === 'issued') {
        confirm = 'issue';
        draw();
        $('.w-confirm input')?.focus();
        return;
      }
      const allowed = { new: 'work', review: 'work', work: 'ready' };
      if (
        allowed[o.status] !== d.wNext ||
        (['new', 'review'].includes(o.status) && !checked.has(o._ref))
      )
        return;
      if (
        update(o._ref, (current) => {
          if (current.status !== o.status) return;
          changeStatus(current, d.wNext);
          current.checkedBy = 'staff_01';
          current.checkedAt = now();
        })
      ) {
        confirm = '';
        draw();
        notify(d.wNext === 'ready' ? 'Заказ готов к выдаче.' : 'Заказ принят в работу.');
      }
      return;
    }
  });
  document.addEventListener('change', (e) => {
    if (!user || !document.body.classList.contains('is-staff')) return;
    if (e.target.name === 'pause') {
      writing.set(chosen, { text: $('#w-message')?.value || '', pause: e.target.checked });
    }
    if (e.target.hasAttribute('data-w-checked')) {
      if (e.target.checked) checked.add(chosen);
      else checked.delete(chosen);
      const b = $('[data-w-next],[data-w-resume]');
      if (b) b.disabled = !e.target.checked;
    }
  });
  document.addEventListener('input', (e) => {
    if (user && document.body.classList.contains('is-staff') && e.target.id === 'w-message') {
      writing.set(chosen, {
        text: e.target.value,
        pause: $('#w-chat-form input[name=pause]')?.checked ?? true,
      });
    }
    if (user && document.body.classList.contains('is-staff') && e.target.id === 'w-search') {
      query = e.target.value;
      refreshResults();
    }
  });
  document.addEventListener('submit', (e) => {
    if (!user || !document.body.classList.contains('is-staff') || !e.target.id.startsWith('w-'))
      return;
    e.preventDefault();
    const o = selected();
    if (!o) return;
    const data = new FormData(e.target);
    if (e.target.id === 'w-chat-form') {
      const text = String(data.get('message') || '').trim();
      if (!text) return;
      if (
        update(o._ref, (current) => {
          (current.messages ??= []).push({
            id: uid(),
            author: 'staff',
            text,
            time: now(),
          });
          current.unread = (current.unread || 0) + 1;
          if (data.has('pause') && ['new', 'work', 'review'].includes(current.status)) {
            current.resumeStatus = current.status;
            changeStatus(current, 'attention');
          }
        })
      ) {
        writing.delete(o._ref);
        checked.delete(o._ref);
        draw();
        $('#w-message')?.focus();
        notify(
          o._store === fixtureKey
            ? 'Сообщение сохранено в демозаказе.'
            : 'Сообщение сохранено. Заказчик увидит его при входе в этом браузере.',
        );
      }
    } else if (e.target.id === 'w-issue-form' && data.has('paid') && o.status === 'ready') {
      if (
        update(o._ref, (current) => {
          if (current.status !== 'ready') return;
          current.payment = 'paid';
          current.paidAt = now();
          changeStatus(current, 'issued');
        })
      ) {
        confirm = '';
        draw();
        notify('Выдача и оплата отмечены.');
      }
    } else if (e.target.id === 'w-cancel-form' && ['new', 'work', 'review'].includes(o.status)) {
      const reason = String(data.get('reason') || '').trim();
      if (!reason) return;
      if (
        update(o._ref, (current) => {
          if (!['new', 'work', 'review'].includes(current.status)) return;
          current.cancelReason = reason;
          changeStatus(current, 'cancelled');
        })
      ) {
        confirm = '';
        draw();
        notify('Заказ отменён. Причина сохранена.');
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (
      user &&
      document.body.classList.contains('is-staff') &&
      e.target.closest('.w-detail-tabs') &&
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
    ) {
      e.preventDefault();
      detailTab =
        e.key === 'Home'
          ? 'info'
          : e.key === 'End'
            ? 'chat'
            : detailTab === 'info'
              ? 'chat'
              : 'info';
      confirm = '';
      draw();
      $('.w-detail-tabs [aria-selected=true]')?.focus();
      return;
    }
    if (
      !user ||
      !mobileOpen ||
      !document.body.classList.contains('is-staff') ||
      !matchMedia('(max-width:800px)').matches
    )
      return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    if (e.key === 'Tab') {
      const items = $$('button,input,textarea,summary,a[href]', $('.w-inspector')).filter(
        (el) => !el.disabled && el.getClientRects().length,
      );
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0]?.focus();
      }
    }
  });
  let framePending = false;
  window.addEventListener(
    'scroll',
    () => {
      if (
        !user ||
        !document.body.classList.contains('is-staff') ||
        framePending ||
        matchMedia('(max-width:800px)').matches
      )
        return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        syncMobile();
      });
    },
    { passive: true },
  );
  window.addEventListener('resize', () => {
    if (user && document.body.classList.contains('is-staff')) syncMobile();
  });
  window.addEventListener('storage', (e) => {
    if (user && (e.key === fixtureKey || e.key?.startsWith('okei-customer-v1:'))) {
      stale = true;
      const dot = $('.w-refresh-dot');
      if (dot) dot.hidden = false;
      notify('Есть изменения в заказах. Обнови очередь.');
    }
  });
  window.Staff = {
    render,
    reset() {
      document.title = entryTitle;
      user = null;
      mobileOpen = false;
      chosen = '';
      page = 'queue';
      filter = 'active';
      query = '';
      kind = 'all';
      confirm = '';
      checked.clear();
      writing.clear();
      stale = false;
      document.body.classList.remove('w-panel-open');
    },
  };
};
