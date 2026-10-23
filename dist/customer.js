(function () {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)],
    money = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽',
    esc = (s) =>
      String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      ),
    uid = () =>
      globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2),
    fmt = (s) =>
      new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Yekaterinburg',
      }).format(new Date(s));
  const M = globalThis.OrderMath,
    states = {
      new: ['Принят', 'Сотрудник проверит файл и параметры.'],
      work: ['В работе', 'Сотрудник готовит заказ. Пока можно заняться своими делами.'],
      ready: ['Можно забрать', 'Заказ готов. Чкалова, 11 · оплата безналичная.'],
      issued: ['Выдан', 'Заказ завершён. Спасибо!'],
      attention: ['Нужно уточнение', 'Сотрудник оставил вопрос. Ответь в переписке заказа.'],
      review: [
        'Ответ сохранён',
        'Твой ответ сохранён в прототипе. Следующий шаг — проверка сотрудником.',
      ],
      cancelled: ['Отменён', 'Заказ отменён до начала работы.'],
    };
  let user = null,
    key = '',
    page = 'overview',
    orders = [],
    draft = null,
    profile = null,
    filter = 'active',
    search = '',
    detail = null,
    detailTab = 'info',
    loading = false,
    uploadError = '',
    drawerFocus = null,
    demoState = { design: 'classic', size: 'M', count: 1, text: 'СВОЯ КОМАНДА', color: '#771633' },
    pendingMerch = null,
    merchMode = 'collection';
  const blank = () => ({
    fileKey: '',
    fileName: '',
    pages: 0,
    fileSize: 0,
    step: 1,
    format: 'A4',
    color: 'mono',
    duplex: false,
    paper: 'normal',
    copies: 1,
    binding: 'none',
    range: '',
    useRange: false,
    comment: '',
  });
  function read(k, f) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  }
  let savedOrders = new Map();
  let sessionId = 0;
  function captureSession() {
    if (!user) throw Error('Сессия завершена. Войди снова и повтори действие.');
    return { owner: key, id: sessionId };
  }
  function sessionCurrent(operation) {
    return user !== null && key === operation.owner && sessionId === operation.id;
  }
  function checkSession(operation) {
    if (!sessionCurrent(operation)) throw Error('Сессия изменилась. Операция отменена.');
  }
  function rememberOrders() {
    savedOrders = new Map(orders.map((order) => [order.id, JSON.stringify(order)]));
  }
  function persist(scope = 'draft', { clearDraft = false } = {}) {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(key) || 'null') || {};
      const data = {
        ...stored,
        orders: stored.orders || orders,
        draft: stored.draft || draft,
        profile: stored.profile || profile,
      };
      if (scope === 'draft' || clearDraft) data.draft = clearDraft ? blank() : draft;
      if (scope === 'profile') data.profile = profile;
      if (scope === 'orders') {
        const changed = orders.filter(
          (order) => JSON.stringify(order) !== savedOrders.get(order.id),
        );
        for (const order of changed) {
          const current = data.orders.find((item) => item.id === order.id);
          if (JSON.stringify(current) !== savedOrders.get(order.id)) {
            throw Error(
              'Заказ изменился в другой вкладке. Проверь актуальные данные и повтори действие.',
            );
          }
        }
        const updates = new Map(changed.map((order) => [order.id, order]));
        data.orders = [
          ...changed.filter((order) => !savedOrders.has(order.id)),
          ...data.orders.map((order) => updates.get(order.id) || order),
        ];
      }
      // Read/merge/write reduces stale overwrites; localStorage is not transactional.
      localStorage.setItem(key, JSON.stringify(data));
      ({ orders, draft, profile } = data);
      rememberOrders();
      return true;
    } catch (error) {
      if (scope === 'orders' && stored?.orders) {
        orders = stored.orders;
        rememberOrders();
      }
      notice(
        error.message?.startsWith('Заказ изменился')
          ? error.message
          : 'Не удалось сохранить данные в браузере. Проверь свободное место и повтори действие.',
      );
      return false;
    }
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('okei-customer-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function putFile(k, b) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(b, k);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function getFile(k) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction('files').objectStore('files').get(k);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }
  function sampleOrders() {
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
  function init(u) {
    const newKey = 'okei-customer-v1:' + u.id;
    if (key === newKey) return;
    sessionId++;
    user = u;
    key = newKey;
    const saved = read(key, null);
    profile = saved?.profile || { name: u.name, group: u.group || 'ИСП-23' };
    orders = saved?.orders || (u.id === 'student_23' ? sampleOrders() : []);
    rememberOrders();
    draft = saved?.draft || blank();
    page = 'overview';
    loading = false;
    uploadError = '';
    pendingMerch = null;
    persist();
  }
  const active = () =>
    orders
      .filter((o) => !['issued', 'cancelled'].includes(o.status))
      .sort(
        (a, b) =>
          ['attention', 'ready', 'review', 'work', 'new'].indexOf(a.status) -
          ['attention', 'ready', 'review', 'work', 'new'].indexOf(b.status),
      );
  function statusIcon(status) {
    return window.OkeiUI.icon(
      {
        new: 'file',
        work: 'clock',
        ready: 'check',
        issued: 'check',
        attention: 'message',
        review: 'message',
        cancelled: 'close',
      }[status],
      'status-symbol',
    );
  }
  function badge(o) {
    return `<span class="c-badge status-${o.status}">${statusIcon(o.status)}${states[o.status][0]}</span>`;
  }
  function steps(o) {
    const n = ['attention', 'review'].includes(o.status)
      ? 0
      : ['new', 'work', 'ready', 'issued'].indexOf(o.status);
    return `<ol class="c-progress ${o.status === 'cancelled' ? 'is-cancelled' : ''}" aria-label="Этапы заказа">${['Принят', 'В работе', 'Готов', 'Выдан'].map((l, i) => `<li class="${i <= n ? 'done' : ''} ${i === n ? 'current' : ''}"><span>${i < n ? '✓' : i + 1}</span><b>${l}</b></li>`).join('')}</ol>`;
  }
  function nav() {
    return `<nav class="c-nav" aria-label="Кабинет заказчика">${[
      ['overview', 'Главная', 'Главная', 'home'],
      ['print', 'Печать документов', 'Печать', 'printer'],
      ['merch', 'Мерч ОКЭИ', 'Мерч', 'shirt'],
      ['orders', 'Мои заказы', 'Заказы', 'orders'],
      ['profile', 'Мой профиль', 'Профиль', 'user'],
    ]
      .map(
        ([id, label, short, icon]) =>
          `<button aria-label="${label}" data-c-page="${id}" class="${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${window.OkeiUI.icon(icon, 'nav-icon')}<span class="nav-full">${label}</span><span class="nav-short" aria-hidden="true">${short}</span>${id === 'orders' && active().length ? `<small>${active().length}</small>` : ''}</button>`,
      )
      .join(
        '',
      )}<span class="e-sidebar-note"><small>СНАЧАЛА —</small><b>ИДЕЯ.</b><span>Потом — твой принт <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></span><span class="c-identity">${esc(profile.name)} · ${esc(profile.group)}</span></nav><div class="c-top">${
      active().length || draft.fileKey
        ? `<div class="c-live" aria-label="Текущие заказы"><strong>Текущие заказы</strong><div class="c-live-scroll">${draft.fileKey ? `<button class="live-draft" data-c-page="print"><i></i>Черновик <span>Продолжить <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button>` : ''}${active()
            .map(
              (o) =>
                `<button class="live-${o.status}" data-c-order="${o.id}" data-c-tab="${o.status === 'attention' ? 'chat' : 'info'}">${statusIcon(o.status)}<span>№${o.id}</span><b>${states[o.status][0]}</b>${o.unread ? `<em aria-label="${o.unread} непрочитанное сообщение">${o.unread}</em>` : ''}</button>`,
            )
            .join('')}</div></div>`
        : ''
    }</div>`;
  }
  function render(u) {
    init(u);
    return `<div class="customer-space">${nav()}<div class="c-content">${page === 'overview' ? overview() : page === 'print' ? printPage() : page === 'orders' ? orderPage() : page === 'merch' ? merchPage() : profilePage()}</div><p class="c-prototype-note">Демо: заказы и сообщения сохраняются только в этом браузере.</p></div>`;
  }
  function draw(scroll = false) {
    if (!user || document.body.dataset.screen !== 'account') return;
    $('#main').innerHTML = render(user);
    $('#main').className = 'c-page-enter';
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
    bindUpload();
    if (scroll) window.OkeiUI.enter($('.c-content'));
  }
  function goto(p) {
    window.OkeiUI.transition(() => {
      if (p === 'merch') merchMode = 'collection';
      page = p;
      uploadError = '';
      draw(true);
    });
  }
  function sheetArt() {
    return `<div class="v-paper-scene" aria-hidden="true"><div class="v-paper-back"></div><div class="v-paper"><small>ОКЭИ / 2026</small><b>КУРСОВАЯ<br>РАБОТА</b><i></i><i></i><i></i><span>Всё по твоим настройкам.</span></div><div class="v-stamp">К ПЕЧАТИ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></div><div class="v-clip"></div></div>`;
  }
  function activity(a) {
    if (!a.length)
      return `<div class="v-empty-order"><span>Здесь появится твой первый заказ.</span><b>Статус всегда под рукой — в верхней панели.</b></div>`;
    const featured = a.find((o) => o.status === 'ready'),
      question = a.find((o) => o.status === 'attention');
    return `<section class="e-activity"><div class="c-section-heading"><h2>Твои заказы <small>${a.length}</small></h2><button class="c-text-btn" data-c-page="orders">Вся история <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div><div class="e-activity-grid"><div class="e-order-ledger">${
      a
        .filter((o) => o !== featured)
        .map(
          (o) =>
            `<button class="e-ledger-row" data-c-order="${o.id}" data-c-tab="${o.status === 'attention' ? 'chat' : 'info'}"><span class="e-ledger-number">${o.id}<small>${o.kind === 'merch' ? 'Мерч' : 'PDF'}</small></span><span class="e-ledger-title"><b>${esc(o.title)}</b><small>${o.status === 'attention' ? 'Есть вопрос по параметрам' : o.kind === 'document' ? o.params.format + ' · ' + (o.params.selectedPages || o.params.pages) + ' стр. · ' + o.params.copies + ' коп.' : o.params.size + ' · ' + o.params.copies + ' шт.'}</small></span><span class="e-ledger-state">${badge(o)}<small>${money(o.total)}</small></span><span class="e-row-arrow"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button>`,
        )
        .join('') || '<p class="c-hint">Остальные заказы уже завершены.</p>'
    }${question ? `<div class="e-question-note"><span>Уточнение №${question.id}</span><p>${esc(question.messages.filter((m) => m.author === 'staff').at(-1)?.text || 'Сотрудник оставил вопрос по заказу.')}</p><button class="c-text-btn" data-c-order="${question.id}" data-c-tab="chat">Ответить сотруднику <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div>` : ''}</div>${featured ? `<article class="e-ready-order"><div class="e-ready-copy"><span class="c-kicker">Уже можно забрать / №${featured.id}</span><h3>${featured.kind === 'merch' ? 'Твоя команда.<br>Уже в сборе.' : 'Готово.<br>Можно забирать.'}</h3><p>${esc(featured.title)}</p><small>Чкалова, 11 · по графику типографии</small><button class="btn secondary" data-c-order="${featured.id}">Открыть заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div>${featured.kind === 'merch' ? '<div class="e-ready-photo"><img src="/assets/college-shirt.png" alt="Футболка из заказа"><img class="e-ready-logo" src="/assets/college-red.svg" alt=""></div>' : sheetArt()}</article>` : `<aside class="e-order-tip"><span class="c-kicker">Всё под рукой</span><b>Принят → В работе<br>→ Готов → Выдан</b><p>Параметры и переписка — внутри заказа.</p><button class="c-text-btn" data-c-page="print">Новая печать <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></aside>`}</div></section>`;
  }
  function overview() {
    const a = active();
    return `<div class="e-overview"><header class="v-greeting"><span>ТВОЁ ПРОСТРАНСТВО / ОКЭИ</span><p>Привет, ${esc(profile.name)} <small>${esc(profile.group)}</small></p></header><section class="v-hero"><div class="v-hero-copy"><span class="c-kicker">От файла до готовой вещи</span><h1>Твои идеи.<br>В реальном<br><em>формате.</em></h1><p>Документы к паре и мерч с твоим дизайном.</p><div class="v-hero-actions"><button class="btn primary" data-c-page="print">${draft.fileKey ? 'Продолжить печать' : 'Загрузить PDF'} <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><button class="c-text-btn" data-c-studio>Создать свой мерч <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div><div class="v-hero-foot"><span>01 / Загрузи</span><span>02 / Настрой</span><span>03 / Забери</span></div></div><div class="v-hero-art" data-v-tilt><span class="v-art-caption">ЦИФРОВОЕ → ОЩУТИМОЕ</span><div class="v-sculpture-wrap">${$('#pdf').innerHTML}</div><div class="v-glass-label"><span class="v-tiny-page">A4</span><div><b>PDF готов к печати</b><small>Стоимость — до заказа</small></div><span><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></div><span class="v-art-sticker">СОЗДАНО<br>ТОБОЙ</span></div></section><div class="v-service-grid"><button class="v-service v-doc-service" data-c-page="print"><div><span class="c-kicker">01 / Документы</span><h2>Последний штрих<br>перед сдачей.</h2><p>Параметры и цена — на одном экране.</p><b>от 4 ₽ <small>/ односторонний лист A4</small></b></div>${sheetArt()}<span class="v-service-arrow"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button><button class="v-service v-merch-service" data-c-page="merch"><img class="v-service-shirt" src="/assets/college-shirt.png" alt="Футболка из коллекции ОКЭИ"><div class="v-service-print"><img src="/assets/college-red.svg" alt=""><b>СВОЯ КОМАНДА</b></div><div><span class="c-kicker">02 / Коллекция ОКЭИ</span><h2>Свои.<br>Узнают.</h2><p>Логотип колледжа.<br>И место для твоего дизайна.</p><b>Открыть коллекцию <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></b></div><span class="v-merch-tag">ОКЭИ<br>СВОЯ КОМАНДА <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button></div>${activity(a)}<section class="v-studio-invite"><div><span class="c-kicker">Не только готовое</span><h2>А если по-своему?</h2><p>Загрузи картинку. Добавь слова. Выбери цвет.</p><button class="btn primary" data-c-studio>Открыть конструктор <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div><div class="v-type-play" aria-hidden="true"><span>ТВОЙ</span><b>ПРИНТ.</b><i>100% ты</i></div></section>${
      orders.some((o) => o.status === 'issued')
        ? `<section class="c-history-preview"><div class="c-section-heading"><h2>Недавно завершённые</h2><button class="c-text-btn" data-c-filter-link="completed">История <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div>${orders
            .filter((o) => o.status === 'issued')
            .slice(0, 2)
            .map(orderRow)
            .join('')}</section>`
        : ''
    }</div>`;
  }
  function orderRow(o) {
    return `<button class="c-order-row" data-c-order="${o.id}"><span class="c-file-mark">${o.kind === 'merch' ? 'ОКЭИ' : 'PDF'}</span><span class="c-row-title"><strong>${esc(o.title)}</strong><small>№${o.id} · ${fmt(o.created)}</small></span>${badge(o)}<b>${money(o.total)}</b><span aria-hidden="true"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button>`;
  }
  function filteredOrders() {
    return orders.filter(
      (o) =>
        (filter === 'all' ||
          (filter === 'active' && !['issued', 'cancelled'].includes(o.status)) ||
          (filter === 'completed' && o.status === 'issued') ||
          (filter === 'cancelled' && o.status === 'cancelled')) &&
        (!search || (o.id + ' ' + o.title).toLowerCase().includes(search.toLowerCase())),
    );
  }
  function orderPage() {
    const list = filteredOrders();
    return `<header class="c-page-heading"><div><span class="c-kicker">История и статусы</span><h1>Мои заказы.</h1><p>Статусы, файлы и переписка.</p></div><button class="btn primary" data-c-page="print">Новый заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></header><section class="c-order-list"><div class="c-list-controls"><div class="c-tabs" role="group" aria-label="Фильтр заказов">${[
      ['active', 'Активные'],
      ['completed', 'Выданы'],
      ['all', 'Все'],
      ['cancelled', 'Отменены'],
    ]
      .map(
        ([v, l]) =>
          `<button data-c-filter="${v}" class="${filter === v ? 'active' : ''}" aria-pressed="${filter === v}">${l}</button>`,
      )
      .join(
        '',
      )}</div><label class="c-search"><span class="sr-only">Найти заказ</span><input id="c-search" type="search" placeholder="Номер или название файла" value="${esc(search)}"></label></div><div id="c-filter-results">${list.length ? list.map(orderRow).join('') : '<div class="c-empty"><h2>Здесь пока пусто.</h2><p>Попробуй другой фильтр или создай новый заказ.</p><button class="btn secondary" data-c-page="print">Новая печать <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div>'}</div></section>`;
  }
  function currentQuote() {
    try {
      if (draft.useRange && !draft.range.trim())
        return { error: 'Укажи страницы, например: 1–3, 5.' };
      const selected = M.selection(draft.pages, draft.useRange ? draft.range : '');
      return { q: M.quote({ ...draft, selectedPages: selected.length }), selected };
    } catch (e) {
      return { error: e.message };
    }
  }
  function printPage() {
    const result = draft.fileKey ? currentQuote() : {},
      q = result.q;
    return `<header class="c-page-heading"><div><span class="c-kicker">Печать документов</span><h1>${draft.step === 1 ? 'Начнём с файла.' : draft.step === 2 ? 'Настроим печать.' : 'Всё верно? Проверим.'}</h1><p>${draft.step === 1 ? 'PDF до 25 МБ. Word и фото сохрани в PDF.' : draft.step === 2 ? 'Настройки меняют цену сразу.' : 'Последняя проверка перед заказом.'}</p></div><span class="c-save-label">${loading ? (draft.step === 3 ? 'Сохраняем заказ…' : 'Читаем PDF…') : 'Черновик сохраняется'}</span></header><div class="c-print-grid"><section class="c-form-card"><nav class="c-wizard-steps" aria-label="Этапы заказа">${['Файл', 'Параметры', 'Подтверждение'].map((l, i) => `<button data-c-step="${i + 1}" ${i > 0 && !draft.fileKey ? 'disabled' : ''} class="${draft.step === i + 1 ? 'active' : draft.step > i + 1 ? 'complete' : ''}"><span>${draft.step > i + 1 ? '✓' : i + 1}</span>${l}</button>`).join('')}</nav>${draft.step === 1 ? uploadStep() : draft.step === 2 ? settingsStep(q, result.error) : confirmStep(q, result.error)}${uploadError ? `<p class="c-error" role="alert">${esc(uploadError)}</p>` : ''}<div class="c-form-actions">${draft.step > 1 ? '<button class="btn secondary" data-c-back>← Назад</button>' : '<span></span>'}<button class="btn primary" ${loading || !draft.fileKey || result.error ? 'disabled' : ''} data-c-next>${loading ? (draft.step === 3 ? 'Оформляем…' : 'Подождём файл…') : draft.step < 3 ? 'Продолжить <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg>' : 'Оформить заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg>'}</button></div></section><aside class="c-cost-card" aria-label="Расчёт стоимости"><span class="c-kicker">Без сюрпризов</span><h2>Стоимость заказа</h2><div id="c-quote">${q ? quoteHTML(q) : '<p class="c-cost-empty">' + esc(result.error || 'Загрузи PDF — мы посчитаем страницы и стоимость.') + '</p>'}</div><div class="c-paper-visual" aria-hidden="true"><div class="c-paper ${draft.duplex ? 'two-sided' : ''}"><span>01</span><i></i><i></i><i></i><b>${draft.format}</b><em>02</em></div><small>${q ? q.sheets + ' ' + plural(q.sheets, 'лист', 'листа', 'листов') + ' · ' + q.impressions + ' ' + plural(q.impressions, 'страница', 'страницы', 'страниц') : 'Твой документ'}</small></div>${draft.fileKey ? `<button class="c-text-btn" data-c-preview-draft>Открыть исходный PDF <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>` : ''}<details class="c-tariff-note"><summary>Демотарифы и расчёт</summary><p>A4: ч/б 6 ₽, цвет 40 ₽ за двусторонний лист. A3: 16 ₽ и 80 ₽. Итог подтвердит типография.</p></details></aside></div>`;
  }
  function plural(n, a, b, c) {
    const v = n % 100;
    return v >= 11 && v <= 14 ? c : n % 10 === 1 ? a : n % 10 >= 2 && n % 10 <= 4 ? b : c;
  }
  function quoteHTML(q) {
    return `<div class="c-cost-file">${esc(draft.fileName)}<small>${q.pages} ${plural(q.pages, 'страница', 'страницы', 'страниц')} × ${q.copies} ${plural(q.copies, 'копия', 'копии', 'копий')}</small></div><dl class="c-cost-lines">${q.singles ? `<div><dt>${q.singles} одностор. × ${q.rateOne} ₽</dt><dd>${money(q.singles * q.rateOne)}</dd></div>` : ''}${q.pairs ? `<div><dt>${q.pairs} двустор. × ${q.rateTwo} ₽ <small>демотариф</small></dt><dd>${money(q.pairs * q.rateTwo)}</dd></div>` : ''}${q.binding ? `<div><dt>Переплёт × ${q.copies}</dt><dd>${money(q.binding)}</dd></div>` : ''}<div class="c-total"><dt>Итого, примерно</dt><dd class="c-amount" key="${q.total}">${money(q.total)}</dd></div></dl>${q.savings > 0 ? `<p class="c-savings">На ${money(q.savings)} меньше, чем с одной стороны.</p>` : ''}<p class="c-cost-help">${q.sheets} ${plural(q.sheets, 'физический лист', 'физических листа', 'физических листов')}. ${draft.duplex ? 'Нечётная последняя страница считается как односторонний лист.' : ''}</p><p class="c-pickup-note">Безналичная оплата при получении.<br>Окончательную стоимость подтвердит сотрудник.</p>`;
  }
  function refreshQuote() {
    const { q, error } = currentQuote();
    const target = $('#c-quote');
    if (target) target.innerHTML = q ? quoteHTML(q) : '<p class="c-error">' + esc(error) + '</p>';
    $$('.c-mobile-cost').forEach(
      (el) => (el.innerHTML = q ? quoteHTML(q) : '<p class="c-error">' + esc(error) + '</p>'),
    );
    const hint = $('#c-range-hint');
    if (hint)
      hint.textContent =
        error || 'Повторы не печатаются дважды. Диапазон считается для каждой копии.';
    const next = $('[data-c-next]');
    if (next) next.disabled = !!error;
    const sheets = $('.c-paper-visual>small');
    if (sheets && q)
      sheets.textContent =
        q.sheets +
        ' ' +
        plural(q.sheets, 'лист', 'листа', 'листов') +
        ' · ' +
        q.impressions +
        ' стр.';
    if (q) {
      const one = $('[data-c-choice="duplex"][data-c-value="false"] small'),
        two = $('[data-c-choice="duplex"][data-c-value="true"] small');
      if (one)
        one.textContent =
          q.pages +
          ' стр. → ' +
          q.pages +
          ' ' +
          plural(q.pages, 'лист', 'листа', 'листов') +
          ' на копию';
      if (two)
        two.textContent =
          q.pages +
          ' стр. → ' +
          Math.ceil(q.pages / 2) +
          ' ' +
          plural(Math.ceil(q.pages / 2), 'лист', 'листа', 'листов') +
          ' на копию';
    }
  }
  function uploadStep() {
    return `<div class="c-dropzone ${loading ? 'is-loading' : ''}" id="c-drop"><div class="c-upload-sheet"><span>PDF</span><i></i><i></i></div><h2>${loading ? 'Проверяем документ…' : draft.fileKey ? 'Файл уже в черновике' : 'Перетащи PDF сюда'}</h2><p>${draft.fileKey ? esc(draft.fileName) + ' · ' + draft.pages + ' стр.' : 'или выбери документ на устройстве'}</p><button class="btn ${draft.fileKey ? 'secondary' : 'primary'}" data-c-upload ${loading ? 'disabled' : ''}>${draft.fileKey ? 'Заменить файл' : 'Выбрать PDF'} <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><input type="file" id="c-file-input" accept="application/pdf,.pdf" hidden><small>До 25 МБ · PDF без пароля</small></div><div class="c-demo-file"><span>Пока нет файла под рукой?</span><button class="c-text-btn" data-c-sample ${loading ? 'disabled' : ''}>Попробовать на 3 страницах <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div>${draft.fileKey ? '<button class="c-subtle-btn" data-c-clear-draft>Убрать файл и очистить черновик</button>' : ''}`;
  }
  function choice(name, value, title, desc, selected, disabled = false) {
    return `<button class="c-choice ${selected ? 'selected' : ''}" data-c-choice="${name}" data-c-value="${value}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}><b>${title}</b><small>${desc}</small><span aria-hidden="true">${selected ? '✓' : ''}</span></button>`;
  }
  function settingsStep(q, error) {
    return `<div class="c-file-inline"><span class="c-file-mark">PDF</span><span><b>${esc(draft.fileName)}</b><small>${draft.pages} ${plural(draft.pages, 'страница', 'страницы', 'страниц')} в исходном файле</small></span><button class="c-text-btn" data-c-step="1">Заменить <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div><div class="c-field-group"><h2>Какие страницы?</h2><div class="c-segment">${choice('useRange', 'false', 'Все страницы', draft.pages + ' стр.', !draft.useRange)}${choice('useRange', 'true', 'Указать диапазон', 'Например: 1–3, 5', draft.useRange)}</div>${draft.useRange ? `<label class="c-field"><span>Страницы для печати</span><input id="c-range" value="${esc(draft.range)}" placeholder="1–3, 5" inputmode="text"><small id="c-range-hint">${error || 'Повторы не печатаются дважды. Диапазон считается для каждой копии.'}</small></label>` : ''}</div><div class="c-settings-row"><label class="c-field"><span>Формат</span><select data-c-select="format"><option ${draft.format === 'A4' ? 'selected' : ''}>A4</option><option ${draft.format === 'A3' ? 'selected' : ''}>A3</option></select></label><label class="c-field"><span>Бумага</span><select data-c-select="paper"><option value="normal" ${draft.paper === 'normal' ? 'selected' : ''}>Обычная</option><option value="photo" ${draft.paper === 'photo' ? 'selected' : ''}>Фотобумага</option></select></label></div><div class="c-field-group"><h2>Цвет печати</h2><div class="c-segment">${choice('color', 'mono', 'Чёрно-белая', 'Текст и схемы', draft.color === 'mono', draft.paper === 'photo')}${choice('color', 'color', 'Цветная', 'Фото и презентации', draft.color === 'color')}</div></div><div class="c-field-group"><h2>Стороны печати</h2><div class="c-segment c-sides">${choice('duplex', 'false', 'С одной стороны', (q?.pages || draft.pages) + ' стр. → ' + (q?.pages || draft.pages) + ' ' + plural(q?.pages || draft.pages, 'лист', 'листа', 'листов') + ' на копию', !draft.duplex)}${choice('duplex', 'true', 'С двух сторон', (q?.pages || draft.pages) + ' стр. → ' + Math.ceil((q?.pages || draft.pages) / 2) + ' ' + plural(Math.ceil((q?.pages || draft.pages) / 2), 'лист', 'листа', 'листов') + ' на копию', draft.duplex, draft.paper === 'photo')}</div><p class="c-hint">${draft.paper === 'photo' ? 'Фотобумага: цветная печать с одной стороны.' : draft.duplex ? 'Две страницы — один лист. Непарная страница — отдельно.' : 'Одна страница — один лист.'}</p></div><div class="c-settings-row"><label class="c-field"><span>Количество копий</span><div class="c-counter"><button data-c-copy="-1" aria-label="Меньше копий">−</button><input id="c-copies" aria-label="Количество копий" type="number" min="1" max="99" step="1" value="${draft.copies}"><button data-c-copy="1" aria-label="Больше копий">+</button></div></label><label class="c-field"><span>Переплёт</span><select data-c-select="binding"><option value="none" ${draft.binding === 'none' ? 'selected' : ''}>Без переплёта</option><option value="spiral" ${draft.binding === 'spiral' ? 'selected' : ''}>Брошюровка · от 100 ₽</option><option value="diploma" ${draft.binding === 'diploma' ? 'selected' : ''}>Диплом · 525 ₽</option></select></label></div>${draft.binding === 'spiral' && q ? `<p class="c-hint">${q.sheetsPerCopy} ${plural(q.sheetsPerCopy, 'лист', 'листа', 'листов')} в каждой копии → ${q.bindingPerCopy} ₽ за брошюровку. До 50 листов — 100 ₽, больше — 150 ₽.</p>` : ''}<p class="c-hint">Двусторонняя печать — демотариф.</p><div class="c-mobile-cost">${q ? quoteHTML(q) : esc(error || '')}</div>`;
  }
  function confirmStep(q, error) {
    return `<div class="c-review"><span class="c-file-mark">PDF</span><div><h2>${esc(draft.fileName)}</h2><p>${q ? q.pages : '—'} стр. · ${draft.format} · ${draft.color === 'mono' ? 'ч/б' : 'цвет'} · ${draft.duplex ? 'с двух сторон' : 'с одной стороны'} · ${draft.copies} коп.</p></div></div><div class="c-review-grid"><div><span>Заказчик</span><strong>${esc(profile.name)}</strong></div><div><span>Учебная группа</span><strong>${esc(profile.group)}</strong></div><div><span>Бумага</span><strong>${draft.paper === 'photo' ? 'Фотобумага' : 'Обычная'}</strong></div><div><span>Переплёт</span><strong>${draft.binding === 'none' ? 'Без переплёта' : draft.binding === 'spiral' ? 'Брошюровка' : 'Диплом'}</strong></div></div><button class="c-text-btn" data-c-page="profile">Изменить имя или группу <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><label class="c-field c-comment"><span>Комментарий сотруднику <em>необязательно</em></span><textarea id="c-comment" placeholder="Например: не скреплять листы" maxlength="1000">${esc(draft.comment)}</textarea></label><div class="c-pickup-block"><b>Забрать в типографии ОКЭИ</b><p>Чкалова, 11. Приходи после статуса «Готов».<br>Безналичная оплата при получении.</p></div><div class="c-mobile-cost">${q ? quoteHTML(q) : esc(error || '')}</div><p class="c-hint">Заказ появится в локальном кабинете. Реальная отправка в колледж в этом прототипе пока не подключена.</p>`;
  }
  async function upload(file) {
    if (!file || loading) return;
    const operation = captureSession();
    if (file.size > 25 * 1024 * 1024) {
      uploadError = 'Выбери PDF до 25 МБ.';
      draw();
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      uploadError = 'Нужен PDF. Сохрани документ в PDF и попробуй снова.';
      draw();
      return;
    }
    loading = true;
    uploadError = '';
    draw();
    let pdf;
    try {
      const pdfjs = await import('/assets/pdf.mjs');
      checkSession(operation);
      pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.mjs';
      const data = await file.arrayBuffer();
      checkSession(operation);
      pdf = await pdfjs.getDocument({ data }).promise;
      checkSession(operation);
      const pages = pdf.numPages;
      await pdf.destroy();
      pdf = null;
      checkSession(operation);
      if (pages > 2000) throw Error('Для прототипа выбери документ до 2000 страниц.');
      const k = 'pdf-' + uid();
      await putFile(k, file);
      checkSession(operation);
      draft = {
        ...draft,
        fileKey: k,
        fileName: file.name,
        pages,
        fileSize: file.size,
        range: '',
        useRange: false,
        step: 2,
      };
      if (persist()) notice('PDF проверен · ' + pages + ' стр.');
    } catch (e) {
      if (sessionCurrent(operation)) {
        uploadError = e.message?.startsWith('Для прототипа')
          ? e.message
          : 'Не удалось прочитать PDF. Проверь файл и сними пароль, если он установлен.';
      }
    } finally {
      if (pdf) await pdf.destroy().catch(() => {});
      if (sessionCurrent(operation)) {
        loading = false;
        draw();
      }
    }
  }
  function bindUpload() {
    if (page === 'merch' && merchMode === 'studio') window.Studio.mount(user.id);
    const input = $('#c-file-input');
    if (input) input.addEventListener('change', (e) => upload(e.target.files[0]));
    const drop = $('#c-drop');
    if (drop) {
      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('drag');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        upload(e.dataTransfer.files[0]);
      });
    }
  }

  async function sample() {
    const operation = captureSession();
    try {
      const res = await fetch('/assets/sample.pdf');
      checkSession(operation);
      if (!res.ok) throw Error();
      const blob = await res.blob();
      checkSession(operation);
      await upload(new File([blob], 'Пример печати · 3 страницы.pdf', { type: 'application/pdf' }));
    } catch {
      if (sessionCurrent(operation)) notice('Пример не загрузился. Выбери свой PDF.');
    }
  }
  async function submit() {
    if (loading) return;
    const operation = captureSession();
    const submittedDraft = { ...draft };
    const { q, selected, error } = currentQuote();
    if (error) {
      uploadError = error;
      draw();
      return;
    }
    if (!profile.name.trim() || !profile.group.trim()) {
      notice('Укажи имя и группу в профиле.');
      goto('profile');
      return;
    }
    loading = true;
    draw();
    try {
      const file = await getFile(submittedDraft.fileKey);
      checkSession(operation);
      if (!file) throw Error('Файл не найден. Загрузи его снова.');
      if (JSON.stringify(draft) !== JSON.stringify(submittedDraft)) {
        throw Error('Черновик изменился. Проверь параметры и повтори оформление.');
      }
      const o = {
        id: String(Math.max(1045, ...orders.map((o) => Number(o.id))) + 1),
        kind: 'document',
        title: draft.fileName,
        fileKey: draft.fileKey,
        total: q.total,
        created: new Date().toISOString(),
        status: 'new',
        params: { ...draft, selectedPages: selected.length, pageList: selected },
        quote: q,
        comment: draft.comment,
        customer: { ...profile },
        events: [{ status: 'new', time: new Date().toISOString() }],
        messages: [],
        unread: 0,
      };
      orders.unshift(o);
      if (!persist('orders', { clearDraft: true })) {
        loading = false;
        draw();
        return;
      }
      loading = false;
      page = 'overview';
      draw(true);
      openSuccess(o);
    } catch (e) {
      if (sessionCurrent(operation)) {
        loading = false;
        uploadError = e.message;
        draw();
      }
    }
  }
  function modal(html) {
    const m = $('#modal');
    drawerFocus = document.activeElement;
    $('#modalContent').innerHTML = html;
    const title = $('h2', m);
    if (title) title.id = 'modalTitle';
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.modal').focus();
  }
  function openSuccess(o) {
    modal(
      `<div class="success-seal">✓</div><span class="c-kicker">Заказ оформлен в прототипе</span><h2>Заказ №${o.id} принят.</h2><p>Он уже виден в верхней панели и на главной кабинета. Сотрудник сначала проверит файл и параметры.</p><div class="modal-row"><span>${esc(o.title)}</span><strong>${money(o.total)}</strong></div><button class="btn primary" data-c-success-order="${o.id}">Открыть заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><p class="c-hint" style="margin-top:15px">Это локальный пример: данные в реальную типографию не отправлены.</p>`,
    );
  }
  function closeMainModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
  }
  function openOrder(id, tab = 'info') {
    const o = orders.find((o) => o.id === id);
    if (!o) return;
    detail = id;
    detailTab = tab;
    if (tab === 'chat') {
      o.unread = 0;
      persist('orders');
      draw();
    }
    let layer = $('#c-order-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'c-order-layer';
      document.body.append(layer);
    }
    drawerFocus = document.activeElement;
    renderDrawer();
    document.body.style.overflow = 'hidden';
    $('#c-close-order').focus();
  }
  function renderDrawer() {
    const o = orders.find((o) => o.id === detail);
    if (!o) return;
    const p = o.params;
    $('#c-order-layer').innerHTML =
      `<div class="c-drawer-backdrop"><section class="c-drawer" role="dialog" aria-modal="true" aria-labelledby="c-drawer-title"><header class="c-drawer-header"><div><span class="c-kicker">${o.kind === 'merch' ? 'Мерч' : 'Документы'}</span><h2 id="c-drawer-title">Заказ №${o.id}</h2></div><button id="c-close-order" aria-label="Закрыть заказ" data-c-close>×</button></header><div class="c-drawer-status">${badge(o)}<p>${states[o.status][1]}</p></div><div class="c-tabs c-drawer-tabs"><button data-c-drawer-tab="info" class="${detailTab === 'info' ? 'active' : ''}">Детали заказа</button><button data-c-drawer-tab="chat" class="${detailTab === 'chat' ? 'active' : ''}">Переписка ${o.unread ? '<small>' + o.unread + '</small>' : ''}</button></div>${detailTab === 'info' ? `<div class="c-drawer-body"><h3>${esc(o.title)}</h3>${steps(o)}<dl class="c-detail-params">${o.kind === 'document' ? `<div><dt>Страницы / копии</dt><dd>${p.selectedPages || p.pages} стр. × ${p.copies} коп.</dd></div><div><dt>Печать</dt><dd>${p.format} · ${p.color === 'mono' ? 'ч/б' : 'цвет'} · ${p.duplex ? 'с двух сторон' : 'с одной стороны'}</dd></div><div><dt>Листов</dt><dd>${o.quote?.sheets || M.quote(p).sheets}</dd></div>${p.useRange ? `<div><dt>Выбраны страницы</dt><dd>${esc((p.pageList || []).join(', '))}</dd></div>` : ''}<div><dt>Бумага</dt><dd>${p.paper === 'photo' ? 'Фотобумага' : 'Обычная'}</dd></div><div><dt>Переплёт</dt><dd>${p.binding === 'none' ? 'Нет' : p.binding === 'spiral' ? 'Брошюровка' : 'Диплом'}</dd></div>` : `<div><dt>Размер / количество</dt><dd>${p.size} / ${p.copies} шт.</dd></div><div><dt>Принт</dt><dd>${p.design === 'studio' ? 'Свой макет · ' + esc(p.shirtColorName || 'цвет по макету') : p.design === 'custom' ? esc(p.text) : 'Логотип ОКЭИ'}</dd></div>`}<div><dt>Заказчик</dt><dd>${esc(o.customer?.name || profile.name)} · ${esc(o.customer?.group || profile.group)}</dd></div><div><dt>Стоимость</dt><dd><strong>${money(o.total)}</strong></dd></div></dl><p class="c-hint">${o.status === 'issued' ? 'Заказ выдан.' : 'Оплата безналичная при получении. Итог подтвердит сотрудник.'}</p>${o.comment ? `<div class="c-comment-saved"><b>Твой комментарий</b><p>${esc(o.comment)}</p></div>` : ''}${o.fileKey ? `<button class="btn secondary" data-c-open-file="${o.id}">Открыть PDF <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>` : o.sample ? '<p class="c-hint">Демонстрационный заказ без вложенного PDF.</p>' : ''}${o.designKey ? `<button class="btn secondary" data-c-design-preview="${o.id}">Посмотреть макет <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>` : ''}<div class="c-order-events"><h3>История статусов</h3>${o.events.map((e) => `<div><i></i><span>${states[e.status][0]}<small>${fmt(e.time)}</small></span></div>`).join('')}</div><div class="c-drawer-actions"><button class="btn secondary" data-c-drawer-tab="chat">Написать сотруднику <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>${o.status === 'new' ? `<button class="c-danger-btn" data-c-cancel="${o.id}">Отменить заказ</button>` : ''}${['issued', 'cancelled'].includes(o.status) ? `<button class="c-text-btn" data-c-repeat="${o.id}">Повторить заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>` : ''}</div><details class="c-demo-tools"><summary>Пример смены статуса · демо</summary><p>Для проверки внешнего вида. Реального сотрудника не уведомляет.</p><button class="btn secondary" data-c-demo-status="${o.id}">Следующий статус <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></details></div>` : chatHTML(o)}</section></div>`;
    if (detailTab === 'chat') {
      const log = $('#c-chat-log');
      if (log) log.scrollTop = log.scrollHeight;
    }
  }
  function chatHTML(o) {
    return `<div class="c-chat"><div class="c-chat-notice"><strong>Переписка по заказу №${o.id}</strong><span>Демонстрация. Сообщения хранятся локально и не доставляются сотруднику.</span></div><div id="c-chat-log" class="c-chat-log" role="log" aria-live="polite">${o.messages.length ? o.messages.map((m) => `<div class="c-message ${m.author}"><span>${m.author === 'staff' ? 'Сотрудник · пример' : 'Ты'}</span><p>${esc(m.text)}</p><small>${fmt(m.time)}${m.author === 'user' ? ' · сохранено локально' : ''}</small></div>`).join('') : '<div class="c-chat-empty"><h3>Уточни прямо здесь.</h3><p>Сотрудник увидит, к какому заказу относится вопрос. Здесь можно обсудить параметры или готовность.</p></div>'}</div><form id="c-chat-form" class="c-chat-composer"><label for="c-message" class="sr-only">Сообщение сотруднику</label><textarea id="c-message" maxlength="2000" placeholder="Напиши вопрос по заказу…" rows="2" required></textarea><button type="submit" class="btn primary" aria-label="Сохранить сообщение в демопереписке">Отправить <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></form><small class="c-chat-keyhint">Enter — новая строка · Ctrl+Enter — отправить</small></div>`;
  }
  function closeDrawer() {
    $('#c-order-layer')?.remove();
    detail = null;
    document.body.style.overflow = '';
    drawerFocus?.focus?.();
  }
  async function openPDF(key) {
    const operation = captureSession();
    const win = window.open('about:blank', '_blank');
    try {
      const file = await getFile(key);
      checkSession(operation);
      if (!file) throw Error();
      const url = URL.createObjectURL(file);
      if (win) {
        win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        URL.revokeObjectURL(url);
        notice('Разреши открытие PDF в новой вкладке.');
      }
    } catch {
      win?.close();
      if (sessionCurrent(operation))
        notice('PDF недоступен в этом браузере. Загрузите его ещё раз.');
    }
  }
  function merchPage() {
    if (merchMode === 'studio') return window.Studio.view();
    return `<header class="c-page-heading"><div><span class="c-kicker">Свои — своё</span><h1>Коллекция ОКЭИ<span class="v-red-dot">.</span></h1><p>С логотипом колледжа. Или с твоим собственным характером.</p></div><button class="btn primary" data-c-studio>Создать свой дизайн +</button></header><div class="v-collection-banner"><div><small>Не просто логотип.</small><b>ТВОЯ КОМАНДА.</b></div><p>Начни с готового варианта.<br>Любой принт можно изменить.</p><span>↙</span></div><div class="v-product-grid">${['classic', 'ahead'].map((id, i) => `<article class="v-product"><button class="v-product-image" data-c-preset="${id}" aria-label="Изменить дизайн ${i ? 'На шаг впереди' : 'ОКЭИ Классика'}"><img src="/assets/college-shirt.png" alt="Белая футболка с принтом ОКЭИ"><div class="v-product-print ${i ? 'ahead' : ''}"><img src="/assets/college-red.svg" alt="Логотип ОКЭИ"><b>${i ? 'НА ШАГ ВПЕРЕДИ<br>ОКЭИ / СВОЯ КОМАНДА' : 'ОРЕНБУРГСКИЙ КОЛЛЕДЖ<br>ЭКОНОМИКИ И ИНФОРМАТИКИ'}</b></div><span class="v-image-hint">Посмотреть в конструкторе <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button><div class="v-product-info"><small>${i ? 'Характер в деталях' : 'Базовая коллекция'} <span>0${i + 1} / 02</span></small><h2>${i ? 'На шаг впереди' : 'ОКЭИ / Классика'}<span>950 ₽</span></h2><p>${i ? 'Логотип и твои слова. Измени под себя.' : 'Знак колледжа. Чистая форма. Твоя история.'}</p><div><button class="btn primary" data-c-preset="${id}">Выбрать размер <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><button class="c-text-btn" data-c-preset="${id}">Изменить принт</button></div></div></article>`).join('')}</div><p class="v-collection-note">950 ₽ / шт. — стоимость примера. Цвет ткани, наличие и окончательную цену подтверждает сотрудник. Оплата при получении.</p>`;
  }
  function profilePage() {
    return `<header class="c-page-heading"><div><span class="c-kicker">Личные данные</span><h1>Твой профиль.</h1><p>Эти данные будут в новых заказах.</p></div></header><div class="c-profile-grid"><form id="c-profile-form" class="c-form-card"><label class="c-field"><span>Имя и фамилия</span><input id="c-profile-name" value="${esc(profile.name)}" maxlength="80" required></label><label class="c-field"><span>Учебная группа</span><input id="c-profile-group" value="${esc(profile.group)}" maxlength="30" required></label><button class="btn primary" type="submit">Сохранить изменения ✓</button><p class="c-hint">Данные уже оформленных заказов сохраняются такими, какими были на момент оформления.</p></form><aside class="c-form-card"><h2>Настройки</h2><p class="c-hint">Светлая или тёмная тема переключается в правом верхнем углу и запоминается.</p><div class="c-profile-info"><span>Логин</span><b>${esc(user.id)}</b></div><div class="c-profile-info"><span>Роль</span><b>Заказчик</b></div><button class="btn secondary" data-action="logout">Выйти из аккаунта <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></aside></div>`;
  }
  function notice(s) {
    if (window.entryToast) window.entryToast(s);
    else {
      const el = $('#toast');
      el.textContent = s;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 4500);
    }
  }
  function updateChoice(name, value) {
    if (page === 'merch' && name === 'design') {
      demoState.design = value;
      draw();
      return;
    }
    if (['duplex', 'useRange'].includes(name)) value = value === 'true';
    draft[name] = value;
    persist();
    draw();
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-c-studio') || b.dataset.cPreset) {
      page = 'merch';
      merchMode = 'studio';
      draw(true);
      if (b.dataset.cPreset) window.Studio.preset(b.dataset.cPreset);
      return;
    }
    if (b.dataset.cPage) {
      goto(b.dataset.cPage);
      return;
    }
    if (b.dataset.cOrder) {
      openOrder(b.dataset.cOrder, b.dataset.cTab);
      return;
    }
    if (b.dataset.cFilter) {
      filter = b.dataset.cFilter;
      draw();
      return;
    }
    if (b.dataset.cFilterLink) {
      filter = b.dataset.cFilterLink;
      page = 'orders';
      draw(true);
      return;
    }
    if (b.dataset.cStep) {
      const target = Number(b.dataset.cStep);
      if (target === 3) {
        const result = currentQuote();
        if (result.error) {
          notice(result.error);
          return;
        }
      }
      draft.step = target;
      uploadError = '';
      persist();
      draw();
      return;
    }
    if (b.hasAttribute('data-c-back')) {
      draft.step--;
      persist();
      draw();
      return;
    }
    if (b.hasAttribute('data-c-next')) {
      if (draft.step < 3) {
        const result = currentQuote();
        if (result.error) {
          uploadError = result.error;
          draw();
          return;
        }
        draft.step++;
        persist();
        draw(true);
      } else await submit();
      return;
    }
    if (b.hasAttribute('data-c-upload')) {
      $('#c-file-input').click();
      return;
    }
    if (b.hasAttribute('data-c-sample')) {
      await sample();
      return;
    }
    if (b.hasAttribute('data-c-clear-draft')) {
      draft = blank();
      persist();
      draw();
      return;
    }
    if (b.dataset.cChoice) {
      updateChoice(b.dataset.cChoice, b.dataset.cValue);
      return;
    }
    if (b.dataset.cCopy) {
      draft.copies = Math.max(1, Math.min(99, Number(draft.copies) + Number(b.dataset.cCopy)));
      persist();
      draw();
      return;
    }
    if (b.hasAttribute('data-c-preview-draft')) {
      await openPDF(draft.fileKey);
      return;
    }
    if (b.dataset.cSuccessOrder) {
      closeMainModal();
      openOrder(b.dataset.cSuccessOrder);
      return;
    }
    if (b.hasAttribute('data-c-close')) {
      closeDrawer();
      return;
    }
    if (b.dataset.cDrawerTab) {
      detailTab = b.dataset.cDrawerTab;
      const o = orders.find((o) => o.id === detail);
      if (detailTab === 'chat') {
        o.unread = 0;
        persist('orders');
        draw();
      }
      renderDrawer();
      return;
    }
    if (b.dataset.cDesignPreview) {
      await openPDF(orders.find((o) => o.id === b.dataset.cDesignPreview).previewKey);
      return;
    }
    if (b.dataset.cOpenFile) {
      await openPDF(orders.find((o) => o.id === b.dataset.cOpenFile).fileKey);
      return;
    }
    if (b.dataset.cCancel) {
      const id = b.dataset.cCancel;
      closeDrawer();
      modal(
        `<span class="c-kicker">Заказ №${id}</span><h2>Отменить заказ?</h2><p>Он ещё не принят в работу. После отмены его можно будет оформить заново.</p><button class="btn primary" data-c-confirm-cancel="${id}">Да, отменить заказ</button><button class="btn secondary" data-c-keep="${id}" style="width:100%;margin-top:10px">Оставить заказ</button>`,
      );
      return;
    }
    if (b.dataset.cConfirmCancel) {
      const o = orders.find((o) => o.id === b.dataset.cConfirmCancel);
      if (o?.status === 'new') {
        o.status = 'cancelled';
        o.events.push({ status: 'cancelled', time: new Date().toISOString() });
        if (!persist('orders')) {
          closeMainModal();
          draw();
          return;
        }
      }
      closeMainModal();
      draw();
      notice('Заказ отменён в прототипе.');
      return;
    }
    if (b.dataset.cKeep) {
      closeMainModal();
      openOrder(b.dataset.cKeep);
      return;
    }
    if (b.dataset.cRepeat) {
      const o = orders.find((o) => o.id === b.dataset.cRepeat);
      if (o.params.design === 'studio') {
        const operation = captureSession();
        try {
          const file = await getFile(o.designKey);
          checkSession(operation);
          if (!file) throw Error();
          const design = JSON.parse(await file.text());
          checkSession(operation);
          closeDrawer();
          page = 'merch';
          merchMode = 'studio';
          draw(true);
          await window.Studio.loadDesign(design);
          checkSession(operation);
          notice('Макет скопирован в конструктор.');
        } catch {
          if (sessionCurrent(operation)) notice('Макет недоступен в этом браузере.');
        }
        return;
      }
      if (o.kind === 'document') {
        draft = {
          ...blank(),
          ...o.params,
          step: o.fileKey ? 2 : 1,
          fileKey: o.fileKey || '',
          fileName: o.fileKey ? o.title : '',
          pages: o.fileKey ? o.params.pages : 0,
        };
        persist();
        closeDrawer();
        goto('print');
        if (!o.fileKey) notice('Загрузи PDF заново: у примера заказа нет файла.');
      } else {
        demoState = { ...demoState, ...o.params, count: o.params.copies };
        closeDrawer();
        goto('merch');
      }
      return;
    }
    if (b.dataset.cDemoStatus) {
      const o = orders.find((o) => o.id === detail);
      const next = {
        new: 'work',
        work: 'ready',
        ready: 'issued',
        attention: 'work',
        review: 'work',
      }[o.status];
      if (next) {
        o.status = next;
        o.events.push({ status: next, time: new Date().toISOString() });
        if (!persist('orders')) {
          draw();
          renderDrawer();
          return;
        }
        draw();
        renderDrawer();
        notice('Статус изменён только для демонстрации.');
      } else notice('Этот заказ уже завершён.');
      return;
    }
    if (b.dataset.cSize) {
      demoState.size = b.dataset.cSize;
      draw();
      return;
    }
    if (b.dataset.cMerchCopy) {
      demoState.count = Math.max(1, Math.min(30, demoState.count + Number(b.dataset.cMerchCopy)));
      draw();
      return;
    }
    if (b.hasAttribute('data-c-merch-order')) {
      if (demoState.design === 'custom' && !demoState.text.trim()) {
        notice('Добавь надпись для принта.');
        $('#c-merch-text').focus();
        return;
      }
      pendingMerch = { ...demoState };
      modal(
        `<span class="c-kicker">Проверим мерч</span><h2>${pendingMerch.design === 'custom' ? 'Твоя футболка.' : 'ОКЭИ / Классика'}</h2><div class="modal-row"><span>Размер / количество</span><strong>${pendingMerch.size} / ${pendingMerch.count} шт.</strong></div><div class="modal-row"><span>Стоимость примера</span><strong>${money(pendingMerch.count * 950)}</strong></div><p style="margin-top:18px">Наличие и итоговую цену подтвердит сотрудник. Это демонстрационный заказ.</p><button class="btn primary" data-c-confirm-merch>Подтвердить заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>`,
      );
      return;
    }
    if (b.hasAttribute('data-c-confirm-merch')) {
      if (!pendingMerch) return;
      const d = pendingMerch;
      const o = {
        id: String(Math.max(1045, ...orders.map((o) => Number(o.id))) + 1),
        kind: 'merch',
        title: d.design === 'custom' ? 'Футболка «' + d.text + '»' : 'Футболка «ОКЭИ / Классика»',
        total: d.count * 950,
        created: new Date().toISOString(),
        status: 'new',
        params: { ...d, copies: d.count },
        customer: { ...profile },
        events: [{ status: 'new', time: new Date().toISOString() }],
        messages: [],
        unread: 0,
      };
      orders.unshift(o);
      if (!persist('orders')) return;
      pendingMerch = null;
      closeMainModal();
      page = 'overview';
      draw(true);
      openSuccess(o);
      return;
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.cSelect) {
      draft[el.dataset.cSelect] = el.value;
      if (draft.paper === 'photo') {
        draft.duplex = false;
        draft.color = 'color';
      }
      persist();
      draw();
    }
    if (el.id === 'c-copies') {
      draft.copies = Math.max(1, Math.min(99, Math.round(Number(el.value) || 1)));
      el.value = draft.copies;
      persist();
      refreshQuote();
    }
    if (el.id === 'c-merch-count') {
      demoState.count = Math.max(1, Math.min(30, Math.round(Number(el.value) || 1)));
      draw();
    }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'c-range') {
      draft.range = el.value;
      persist();
      refreshQuote();
    }
    if (el.id === 'c-copies') {
      draft.copies = Number(el.value);
      persist();
      refreshQuote();
    }
    if (el.id === 'c-comment') {
      draft.comment = el.value;
      persist();
    }
    if (el.id === 'c-search') {
      search = el.value;
      const list = filteredOrders();
      $('#c-filter-results').innerHTML = list.length
        ? list.map(orderRow).join('')
        : '<div class="c-empty"><h2>Ничего не найдено.</h2><p>Попробуй другой номер или название файла.</p></div>';
    }
    if (el.id === 'c-merch-text') {
      demoState.text = el.value;
      $('.c-shirt-print').innerHTML = '<strong>' + esc(el.value || 'ТВОЯ НАДПИСЬ') + '</strong>';
    }
    if (el.id === 'c-merch-color') {
      demoState.color = el.value;
      $('.c-shirt-print').style.color = el.value;
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'c-chat-form') {
      e.preventDefault();
      const input = $('#c-message'),
        text = input.value.trim();
      if (!text) return;
      const o = orders.find((o) => o.id === detail);
      o.messages.push({ id: uid(), author: 'user', text, time: new Date().toISOString() });
      if (o.status === 'attention') {
        o.status = 'review';
        o.events.push({ status: 'review', time: new Date().toISOString() });
      }
      if (!persist('orders')) return;
      draw();
      renderDrawer();
      $('#c-message').focus();
      notice('Сообщение сохранено локально. Реальная доставка не подключена.');
    }
    if (e.target.id === 'c-profile-form') {
      e.preventDefault();
      const name = $('#c-profile-name').value.trim(),
        group = $('#c-profile-group').value.trim();
      if (!name || !group) {
        notice('Укажи имя и группу.');
        return;
      }
      profile = { name, group };
      if (!persist('profile')) return;
      draw();
      notice('Профиль сохранён.');
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('c-drawer-backdrop')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detail) closeDrawer();
    if (e.ctrlKey && e.key === 'Enter' && e.target.id === 'c-message') {
      e.preventDefault();
      $('#c-chat-form').requestSubmit();
    }
    if (e.key === 'Tab' && detail) {
      const items = $$('button,input,textarea,summary,[tabindex="0"]', $('#c-order-layer')).filter(
          (x) => !x.disabled && x.getClientRects().length,
        ),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  window.Customer = {
    async createStudioOrder(design, preview) {
      const operation = captureSession();
      const orderKey = 'design-' + uid(),
        previewKey = 'preview-' + uid();
      await putFile(orderKey, new Blob([JSON.stringify(design)], { type: 'application/json' }));
      checkSession(operation);
      await putFile(previewKey, preview);
      checkSession(operation);
      const o = {
        id: String(Math.max(1045, ...orders.map((o) => Number(o.id))) + 1),
        kind: 'merch',
        title: 'Футболка «' + (design.title || 'Мой дизайн') + '»',
        total: design.count * 950,
        created: new Date().toISOString(),
        status: 'new',
        params: {
          design: 'studio',
          size: design.size,
          copies: design.count,
          shirtColorName: design.shirtColorName,
        },
        designKey: orderKey,
        previewKey,
        customer: { ...profile },
        events: [{ status: 'new', time: new Date().toISOString() }],
        messages: [],
        unread: 0,
      };
      orders.unshift(o);
      if (!persist('orders'))
        throw Error('Заказ не сохранён. Проверь свободное место и повтори попытку.');
      page = 'overview';
      draw(true);
      openSuccess(o);
      return o.id;
    },
    render,
    home() {
      page = 'overview';
    },
    reset() {
      sessionId++;
      user = null;
      key = '';
      loading = false;
      pendingMerch = null;
      closeDrawer();
    },
    activeCount() {
      return active().length;
    },
  };
})();
