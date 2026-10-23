import { formatMoney as money, formatDate as fmt, escapeHTML as esc, plural } from '../shared.mjs';
import { states } from './state.mjs';
import {
  MERCH_PRICE,
  activeOrders,
  filteredOrders as selectOrders,
  calculateQuote,
  calculateDocumentsQuote,
} from './orders.mjs';
// Keep the original SVG markup; OkeiUI's arrow uses a different stroke width.
function arrowIcon() {
  return `<svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg>`;
}
export function createCustomerViews(state, { orderMath, ui, studio, pdfArtwork, server = false }) {
  const M = orderMath;
  const active = () => activeOrders(state.orders);
  const filteredOrders = () => selectOrders(state.orders, state.filter, state.search);
  const currentQuote = () =>
    (server ? calculateDocumentsQuote : calculateQuote)(state.draft, orderMath);
  function statusIcon(status) {
    return ui.icon(
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
    return `<ol class="c-progress ${o.status === 'cancelled' ? 'is-cancelled' : ''}" aria-label="Этапы заказа">${[
      'Принят',
      'В работе',
      'Готов',
      'Выдан',
    ]
      .map(
        (l, i) =>
          `<li class="${i <= n ? 'done' : ''} ${i === n ? 'current' : ''}">` +
          `<span>${i < n ? '✓' : i + 1}</span>` +
          `<b>${l}</b>` +
          `</li>`,
      )
      .join('')}</ol>`;
  }
  function nav() {
    return (
      `<nav class="c-nav" aria-label="Кабинет заказчика">${[
        ['overview', 'Главная', 'Главная', 'home'],
        ['print', 'Печать документов', 'Печать', 'printer'],
        ['merch', 'Мерч ОКЭИ', 'Мерч', 'shirt'],
        ['orders', 'Мои заказы', 'Заказы', 'orders'],
        ['profile', 'Мой профиль', 'Профиль', 'user'],
      ]
        .map(
          ([id, label, short, icon]) =>
            `<button aria-label="${label}" data-c-page="${id}" class="${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}>${ui.icon(icon, 'nav-icon')}<span class="nav-full">${label}</span>` +
            `<span class="nav-short" aria-hidden="true">${short}</span>${id === 'orders' && active().length ? `<small>${active().length}</small>` : ''}</button>`,
        )
        .join('')}<span class="e-sidebar-note">` +
      `<small>СНАЧАЛА —</small>` +
      `<b>ИДЕЯ.</b>` +
      `<span>Потом — твой принт ${arrowIcon()}` +
      `</span>` +
      `</span>` +
      `<span class="c-identity">${esc(state.profile.name)} · ${esc(state.profile.group)}</span>` +
      `</nav>` +
      `<div class="c-top">${
        active().length || state.draft.fileKey
          ? `<div class="c-live" aria-label="Текущие заказы">` +
            `<strong>Текущие заказы</strong>` +
            `<div class="c-live-scroll">${
              state.draft.fileKey
                ? `<button class="live-draft" data-c-page="print">` +
                  `<i>` +
                  `</i>Черновик <span>Продолжить ${arrowIcon()}` +
                  `</span>` +
                  `</button>`
                : ''
            }${active()
              .map(
                (o) =>
                  `<button class="live-${o.status}" data-c-order="${o.id}" data-c-tab="${o.status === 'attention' ? 'chat' : 'info'}">${statusIcon(o.status)}<span>№${o.id}</span>` +
                  `<b>${states[o.status][0]}</b>${o.unread ? `<em aria-label="${o.unread} непрочитанное сообщение">${o.unread}</em>` : ''}</button>`,
              )
              .join('')}</div>` +
            `</div>`
          : ''
      }</div>`
    );
  }
  function sheetArt() {
    return (
      `<div class="v-paper-scene" aria-hidden="true">` +
      `<div class="v-paper-back">` +
      `</div>` +
      `<div class="v-paper">` +
      `<small>ОКЭИ / 2026</small>` +
      `<b>КУРСОВАЯ<br>РАБОТА</b>` +
      `<i>` +
      `</i>` +
      `<i>` +
      `</i>` +
      `<i>` +
      `</i>` +
      `<span>Всё по твоим настройкам.</span>` +
      `</div>` +
      `<div class="v-stamp">К ПЕЧАТИ ${arrowIcon()}` +
      `</div>` +
      `<div class="v-clip">` +
      `</div>` +
      `</div>`
    );
  }
  function activity(a) {
    if (!a.length)
      return (
        `<div class="v-empty-order">` +
        `<span>Здесь появится твой первый заказ.</span>` +
        `<b>Статус всегда под рукой — в верхней панели.</b>` +
        `</div>`
      );
    const featured = a.find((o) => o.status === 'ready'),
      question = a.find((o) => o.status === 'attention');
    return (
      `<section class="e-activity">` +
      `<div class="c-section-heading">` +
      `<h2>Твои заказы <small>${a.length}</small>` +
      `</h2>` +
      `<button class="c-text-btn" data-c-page="orders">Вся история ${arrowIcon()}` +
      `</button>` +
      `</div>` +
      `<div class="e-activity-grid">` +
      `<div class="e-order-ledger">${
        a
          .filter((o) => o !== featured)
          .map(
            (o) =>
              `<button class="e-ledger-row" data-c-order="${o.id}" data-c-tab="${o.status === 'attention' ? 'chat' : 'info'}">` +
              `<span class="e-ledger-number">${o.id}<small>${o.kind === 'merch' ? 'Мерч' : 'PDF'}</small>` +
              `</span>` +
              `<span class="e-ledger-title">` +
              `<b>${esc(o.title)}</b>` +
              `<small>${o.status === 'attention' ? 'Есть вопрос по параметрам' : o.kind === 'document' ? o.params.format + ' · ' + (o.params.selectedPages || o.params.pages) + ' стр. · ' + o.params.copies + ' коп.' : o.params.size + ' · ' + o.params.copies + ' шт.'}</small>` +
              `</span>` +
              `<span class="e-ledger-state">${badge(o)}<small>${money(o.total)}</small>` +
              `</span>` +
              `<span class="e-row-arrow">` +
              `${arrowIcon()}` +
              `</span>` +
              `</button>`,
          )
          .join('') || '<p class="c-hint">Остальные заказы уже завершены.</p>'
      }${
        question
          ? `<div class="e-question-note">` +
            `<span>Уточнение №${question.id}</span>` +
            `<p>${esc(question.messages.filter((m) => m.author === 'staff').at(-1)?.text || 'Сотрудник оставил вопрос по заказу.')}</p>` +
            `<button class="c-text-btn" data-c-order="${question.id}" data-c-tab="chat">Ответить сотруднику ${arrowIcon()}` +
            `</button>` +
            `</div>`
          : ''
      }</div>${
        featured
          ? `<article class="e-ready-order">` +
            `<div class="e-ready-copy">` +
            `<span class="c-kicker">Уже можно забрать / №${featured.id}</span>` +
            `<h3>${featured.kind === 'merch' ? 'Твоя команда.<br>Уже в сборе.' : 'Готово.<br>Можно забирать.'}</h3>` +
            `<p>${esc(featured.title)}</p>` +
            `<small>Чкалова, 11 · по графику типографии</small>` +
            `<button class="btn secondary" data-c-order="${featured.id}">Открыть заказ ${arrowIcon()}` +
            `</button>` +
            `</div>${featured.kind === 'merch' ? '<div class="e-ready-photo"><img src="/assets/college-shirt.png" alt="Футболка из заказа"><img class="e-ready-logo" src="/assets/college-red.svg" alt=""></div>' : sheetArt()}</article>`
          : `<aside class="e-order-tip">` +
            `<span class="c-kicker">Всё под рукой</span>` +
            `<b>Принят → В работе<br>→ Готов → Выдан</b>` +
            `<p>Параметры и переписка — внутри заказа.</p>` +
            `<button class="c-text-btn" data-c-page="print">Новая печать ${arrowIcon()}` +
            `</button>` +
            `</aside>`
      }</div>` +
      `</section>`
    );
  }
  function overview() {
    const a = active();
    return `<div class="e-overview">${greeting()}${hero()}${services()}${activity(a)}${studioInvitation()}${
      state.orders.some((o) => o.status === 'issued')
        ? `<section class="c-history-preview">` +
          `<div class="c-section-heading">` +
          `<h2>Недавно завершённые</h2>` +
          `<button class="c-text-btn" data-c-filter-link="completed">История ${arrowIcon()}` +
          `</button>` +
          `</div>${state.orders
            .filter((o) => o.status === 'issued')
            .slice(0, 2)
            .map(orderRow)
            .join('')}</section>`
        : ''
    }</div>`;
  }
  function orderRow(o) {
    return (
      `<button class="c-order-row" data-c-order="${o.id}">` +
      `<span class="c-file-mark">${o.kind === 'merch' ? 'ОКЭИ' : 'PDF'}</span>` +
      `<span class="c-row-title">` +
      `<strong>${esc(o.title)}</strong>` +
      `<small>№${o.id} · ${fmt(o.created)}</small>` +
      `</span>${badge(o)}<b>${money(o.total)}</b>` +
      `<span aria-hidden="true">` +
      `${arrowIcon()}` +
      `</span>` +
      `</button>`
    );
  }
  function orderPage() {
    const list = filteredOrders();
    return (
      `<header class="c-page-heading">` +
      `<div>` +
      `<span class="c-kicker">История и статусы</span>` +
      `<h1>Мои заказы.</h1>` +
      `<p>Статусы, файлы и переписка.</p>` +
      `</div>` +
      `<button class="btn primary" data-c-page="print">Новый заказ ${arrowIcon()}` +
      `</button>` +
      `</header>` +
      `<section class="c-order-list">` +
      `<div class="c-list-controls">` +
      `<div class="c-tabs" role="group" aria-label="Фильтр заказов">${[
        ['active', 'Активные'],
        ['completed', 'Выданы'],
        ['all', 'Все'],
        ['cancelled', 'Отменены'],
      ]
        .map(
          ([v, l]) =>
            `<button data-c-filter="${v}" class="${state.filter === v ? 'active' : ''}" aria-pressed="${state.filter === v}">${l}</button>`,
        )
        .join('')}</div>` +
      `<label class="c-search">` +
      `<span class="sr-only">Найти заказ</span>` +
      `<input id="c-search" type="search" placeholder="Номер или название файла" value="${esc(state.search)}">` +
      `</label>` +
      `</div>` +
      `<div id="c-filter-results">${list.length ? list.map(orderRow).join('') : '<div class="c-empty"><h2>Здесь пока пусто.</h2><p>Попробуй другой фильтр или создай новый заказ.</p><button class="btn secondary" data-c-page="print">Новая печать ' + arrowIcon() + '</button></div>'}</div>` +
      `</section>`
    );
  }
  function printPage() {
    const result = state.draft.fileKey ? currentQuote() : {},
      q = result.q;
    return (
      `<header class="c-page-heading">` +
      `<div>` +
      `<span class="c-kicker">Печать документов</span>` +
      `<h1>${state.draft.step === 1 ? 'Начнём с файла.' : state.draft.step === 2 ? 'Настроим печать.' : 'Всё верно? Проверим.'}</h1>` +
      `<p>${state.draft.step === 1 ? 'PDF до 25 МБ. Word и фото сохрани в PDF.' : state.draft.step === 2 ? 'Настройки меняют цену сразу.' : 'Последняя проверка перед заказом.'}</p>` +
      `</div>` +
      `<span class="c-save-label">${state.loading ? (state.draft.step === 3 ? 'Сохраняем заказ…' : 'Читаем PDF…') : 'Черновик сохраняется'}</span>` +
      `</header>` +
      `<div class="c-print-grid">` +
      `<section class="c-form-card">` +
      `<nav class="c-wizard-steps" aria-label="Этапы заказа">${[
        'Файл',
        'Параметры',
        'Подтверждение',
      ]
        .map(
          (l, i) =>
            `<button data-c-step="${i + 1}" ${i > 0 && !state.draft.fileKey ? 'disabled' : ''} class="${state.draft.step === i + 1 ? 'active' : state.draft.step > i + 1 ? 'complete' : ''}">` +
            `<span>${state.draft.step > i + 1 ? '✓' : i + 1}</span>${l}</button>`,
        )
        .join(
          '',
        )}</nav>${state.draft.step === 1 ? uploadStep() : state.draft.step === 2 ? settingsStep(q, result.error) : confirmStep(q, result.error)}${state.uploadError ? `<p class="c-error" role="alert">${esc(state.uploadError)}</p>` : ''}<div class="c-form-actions">${state.draft.step > 1 ? '<button class="btn secondary" data-c-back>← Назад</button>' : '<span></span>'}<button class="btn primary" ${state.loading || !state.draft.fileKey || result.error ? 'disabled' : ''} data-c-next>${state.loading ? (state.draft.step === 3 ? 'Оформляем…' : 'Подождём файл…') : state.draft.step < 3 ? 'Продолжить ' + arrowIcon() + '' : 'Оформить заказ ' + arrowIcon() + ''}</button>` +
      `</div>` +
      `</section>${costCard(q, result)}</div>`
    );
  }
  function draftFiles() {
    if (!server || !state.draft.files?.length) return '';
    if (state.draft.files.length === 1 && state.draft.step !== 1)
      return (
        '<input type="file" id="c-file-input" accept="application/pdf,.pdf" multiple hidden><div class="c-demo-file"><button class="c-text-btn" data-c-add-files>Добавить PDF</button><button class="c-subtle-btn" data-c-remove-file="' +
        esc(state.draft.files[0].id) +
        '">Убрать PDF</button></div>'
      );
    return (
      (state.draft.step !== 1
        ? '<input type="file" id="c-file-input" accept="application/pdf,.pdf" multiple hidden>'
        : '') +
      '<div class="c-field-group">' +
      state.draft.files
        .map(
          (file) =>
            '<div class="c-file-inline"><span class="c-file-mark">PDF</span><span><b>' +
            esc(file.name) +
            '</b><small>' +
            file.pages +
            ' стр. · ' +
            Math.ceil(file.size / 1024) +
            ' КБ</small></span><button class="c-text-btn" data-c-replace-file="' +
            esc(file.id) +
            '">Заменить</button><button class="c-subtle-btn" data-c-remove-file="' +
            esc(file.id) +
            '">Убрать</button></div>',
        )
        .join('') +
      (state.draft.files.length < 10
        ? '<button class="btn secondary" data-c-add-files>Добавить PDF</button>'
        : '') +
      '<p class="c-hint">До 10 PDF, каждый до 25 МБ, вместе до 50 МБ. Общие настройки применяются к каждому документу; переплёт — отдельно.</p></div>'
    );
  }
  function quoteHTML(q) {
    return (
      `<div class="c-cost-file">${esc(state.draft.fileName)}<small>${q.pages} ${plural(q.pages, 'страница', 'страницы', 'страниц')} × ${q.copies} ${plural(q.copies, 'копия', 'копии', 'копий')}</small>` +
      `</div>` +
      `<dl class="c-cost-lines">${
        q.singles
          ? `<div>` +
            `<dt>${q.singles} одностор. × ${q.rateOne} ₽</dt>` +
            `<dd>${money(q.singles * q.rateOne)}</dd>` +
            `</div>`
          : ''
      }${
        q.pairs
          ? `<div>` +
            `<dt>${q.pairs} двустор. × ${q.rateTwo} ₽ <small>демотариф</small>` +
            `</dt>` +
            `<dd>${money(q.pairs * q.rateTwo)}</dd>` +
            `</div>`
          : ''
      }${
        q.binding
          ? `<div>` + `<dt>Переплёт × ${q.copies}</dt>` + `<dd>${money(q.binding)}</dd>` + `</div>`
          : ''
      }<div class="c-total">` +
      `<dt>Итого, примерно</dt>` +
      `<dd class="c-amount" key="${q.total}">${money(q.total)}</dd>` +
      `</div>` +
      `</dl>${q.savings > 0 ? `<p class="c-savings">На ${money(q.savings)} меньше, чем с одной стороны.</p>` : ''}<p class="c-cost-help">${q.sheets} ${plural(q.sheets, 'физический лист', 'физических листа', 'физических листов')}. ${state.draft.duplex ? 'Нечётная последняя страница считается как односторонний лист.' : ''}</p>` +
      `<p class="c-pickup-note">Безналичная оплата при получении.<br>Окончательную стоимость подтвердит сотрудник.</p>`
    );
  }
  function uploadStep() {
    return (
      `<div class="c-dropzone ${state.loading ? 'is-loading' : ''}" id="c-drop">` +
      `<div class="c-upload-sheet">` +
      `<span>PDF</span>` +
      `<i>` +
      `</i>` +
      `<i>` +
      `</i>` +
      `</div>` +
      `<h2>${state.loading ? 'Проверяем документ…' : state.draft.fileKey ? 'Файл уже в черновике' : 'Перетащи PDF сюда'}</h2>` +
      `<p>${state.draft.fileKey ? esc(state.draft.fileName) + ' · ' + state.draft.pages + ' стр.' : 'или выбери документ на устройстве'}</p>` +
      `<button class="btn ${state.draft.fileKey ? 'secondary' : 'primary'}" data-c-upload ${state.loading ? 'disabled' : ''}>${state.draft.fileKey ? 'Заменить файл' : 'Выбрать PDF'} ${arrowIcon()}` +
      `</button>` +
      `<input type="file" id="c-file-input" accept="application/pdf,.pdf"${server ? ' multiple' : ''} hidden>` +
      `<small>До 25 МБ · PDF без пароля</small>` +
      `</div>` +
      `<div class="c-demo-file">` +
      `<span>Пока нет файла под рукой?</span>` +
      `<button class="c-text-btn" data-c-sample ${state.loading ? 'disabled' : ''}>Попробовать на 3 страницах ${arrowIcon()}` +
      `</button>` +
      `</div>${draftFiles()}${state.draft.fileKey ? '<button class="c-subtle-btn" data-c-clear-draft>Убрать файл и очистить черновик</button>' : ''}`
    );
  }
  function choice(name, value, title, desc, selected, disabled = false) {
    return (
      `<button class="c-choice ${selected ? 'selected' : ''}" data-c-choice="${name}" data-c-value="${value}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>` +
      `<b>${title}</b>` +
      `<small>${desc}</small>` +
      `<span aria-hidden="true">${selected ? '✓' : ''}</span>` +
      `</button>`
    );
  }
  function settingsStep(q, error) {
    return (
      `<div class="c-file-inline">` +
      `<span class="c-file-mark">PDF</span>` +
      `<span>` +
      `<b>${esc(state.draft.fileName)}</b>` +
      `<small>${state.draft.pages} ${plural(state.draft.pages, 'страница', 'страницы', 'страниц')} ${server && state.draft.files?.length > 1 ? 'в документах' : 'в исходном файле'}</small>` +
      `</span>` +
      `<button class="c-text-btn" data-c-step="1">Заменить ${arrowIcon()}` +
      `</button>` +
      `</div>${draftFiles()}${pageRange(error)}${paperOptions()}${colorOptions()}${sideOptions(q)}${copyAndBindingOptions(q)}<p class="c-hint">Двусторонняя печать — демотариф.</p>` +
      `<div class="c-mobile-cost">${q ? quoteHTML(q) : esc(error || '')}</div>`
    );
  }
  function confirmStep(q, error) {
    return (
      `<div class="c-review">` +
      `<span class="c-file-mark">PDF</span>` +
      `<div>` +
      `<h2>${esc(state.draft.fileName)}</h2>` +
      `<p>${q ? q.pages : '—'} стр. · ${state.draft.format} · ${state.draft.color === 'mono' ? 'ч/б' : 'цвет'} · ${state.draft.duplex ? 'с двух сторон' : 'с одной стороны'} · ${state.draft.copies} коп.</p>` +
      `</div>` +
      `</div>` +
      `${server && state.draft.files?.length > 1 ? draftFiles() : ''}<div class="c-review-grid">` +
      `<div>` +
      `<span>Заказчик</span>` +
      `<strong>${esc(state.profile.name)}</strong>` +
      `</div>` +
      `<div>` +
      `<span>Учебная группа</span>` +
      `<strong>${esc(state.profile.group)}</strong>` +
      `</div>` +
      `<div>` +
      `<span>Бумага</span>` +
      `<strong>${state.draft.paper === 'photo' ? 'Фотобумага' : 'Обычная'}</strong>` +
      `</div>` +
      `<div>` +
      `<span>Переплёт</span>` +
      `<strong>${state.draft.binding === 'none' ? 'Без переплёта' : state.draft.binding === 'spiral' ? 'Брошюровка' : 'Диплом'}</strong>` +
      `</div>` +
      `</div>` +
      `<button class="c-text-btn" data-c-page="profile">Изменить имя или группу ${arrowIcon()}` +
      `</button>` +
      `<label class="c-field c-comment">` +
      `<span>Комментарий сотруднику <em>необязательно</em>` +
      `</span>` +
      `<textarea id="c-comment" placeholder="Например: не скреплять листы" maxlength="1000">${esc(state.draft.comment)}</textarea>` +
      `</label>` +
      `<div class="c-pickup-block">` +
      `<b>Забрать в типографии ОКЭИ</b>` +
      `<p>Чкалова, 11. Приходи после статуса «Готов».<br>Безналичная оплата при получении.</p>` +
      `</div>` +
      `<div class="c-mobile-cost">${q ? quoteHTML(q) : esc(error || '')}</div>` +
      `<p class="c-hint">Заказ появится в локальном кабинете. Реальная отправка в колледж в этом прототипе пока не подключена.</p>`
    );
  }
  function chatHTML(o) {
    return (
      `<div class="c-chat">` +
      `<div class="c-chat-notice">` +
      `<strong>Переписка по заказу №${o.id}</strong>` +
      `<span>Демонстрация. Сообщения хранятся локально и не доставляются сотруднику.</span>` +
      `</div>` +
      `<div id="c-chat-log" class="c-chat-log" role="log" aria-live="polite">${
        o.messages.length
          ? o.messages
              .map(
                (m) =>
                  `<div class="c-message ${m.author}">` +
                  `<span>${m.author === 'staff' ? (server ? 'Сотрудник' : 'Сотрудник · пример') : 'Ты'}</span>` +
                  `<p>${esc(m.text)}</p>` +
                  `<small>${fmt(m.time)}${m.author === 'user' ? ' · сохранено локально' : ''}</small>` +
                  `</div>`,
              )
              .join('')
          : '<div class="c-chat-empty"><h3>Уточни прямо здесь.</h3><p>Сотрудник увидит, к какому заказу относится вопрос. Здесь можно обсудить параметры или готовность.</p></div>'
      }</div>` +
      `<form id="c-chat-form" class="c-chat-composer">` +
      `<label for="c-message" class="sr-only">Сообщение сотруднику</label>` +
      `<textarea id="c-message" maxlength="2000" placeholder="Напиши вопрос по заказу…" rows="2" required>` +
      `</textarea>` +
      `<button type="submit" class="btn primary" aria-label="Сохранить сообщение в демопереписке">Отправить ${arrowIcon()}` +
      `</button>` +
      `</form>` +
      `<small class="c-chat-keyhint">Enter — новая строка · Ctrl+Enter — отправить</small>` +
      `</div>`
    );
  }
  function merchPage() {
    if (state.merchMode === 'studio') return studio.view();
    return (
      `<header class="c-page-heading">` +
      `<div>` +
      `<span class="c-kicker">Свои — своё</span>` +
      `<h1>Коллекция ОКЭИ<span class="v-red-dot">.</span>` +
      `</h1>` +
      `<p>С логотипом колледжа. Или с твоим собственным характером.</p>` +
      `</div>` +
      `<button class="btn primary" data-c-studio>Создать свой дизайн +</button>` +
      `</header>` +
      `<div class="v-collection-banner">` +
      `<div>` +
      `<small>Не просто логотип.</small>` +
      `<b>ТВОЯ КОМАНДА.</b>` +
      `</div>` +
      `<p>Начни с готового варианта.<br>Любой принт можно изменить.</p>` +
      `<span>↙</span>` +
      `</div>` +
      `<div class="v-product-grid">${['classic', 'ahead']
        .map(
          (id, i) =>
            `<article class="v-product">` +
            `<button class="v-product-image" data-c-preset="${id}" aria-label="Изменить дизайн ${i ? 'На шаг впереди' : 'ОКЭИ Классика'}">` +
            `<img src="/assets/college-shirt.png" alt="Белая футболка с принтом ОКЭИ">` +
            `<div class="v-product-print ${i ? 'ahead' : ''}">` +
            `<img src="/assets/college-red.svg" alt="Логотип ОКЭИ">` +
            `<b>${i ? 'НА ШАГ ВПЕРЕДИ<br>ОКЭИ / СВОЯ КОМАНДА' : 'ОРЕНБУРГСКИЙ КОЛЛЕДЖ<br>ЭКОНОМИКИ И ИНФОРМАТИКИ'}</b>` +
            `</div>` +
            `<span class="v-image-hint">Посмотреть в конструкторе ${arrowIcon()}` +
            `</span>` +
            `</button>` +
            `<div class="v-product-info">` +
            `<small>${i ? 'Характер в деталях' : 'Базовая коллекция'} <span>0${i + 1} / 02</span>` +
            `</small>` +
            `<h2>${i ? 'На шаг впереди' : 'ОКЭИ / Классика'}<span>950 ₽</span>` +
            `</h2>` +
            `<p>${i ? 'Логотип и твои слова. Измени под себя.' : 'Знак колледжа. Чистая форма. Твоя история.'}</p>` +
            `<div>` +
            `<button class="btn primary" data-c-preset="${id}">Выбрать размер ${arrowIcon()}` +
            `</button>` +
            `<button class="c-text-btn" data-c-preset="${id}">Изменить принт</button>` +
            `</div>` +
            `</div>` +
            `</article>`,
        )
        .join('')}</div>` +
      `<p class="v-collection-note">950 ₽ / шт. — стоимость примера. Цвет ткани, наличие и окончательную цену подтверждает сотрудник. Оплата при получении.</p>`
    );
  }
  function profilePage() {
    return (
      `<header class="c-page-heading">` +
      `<div>` +
      `<span class="c-kicker">Личные данные</span>` +
      `<h1>Твой профиль.</h1>` +
      `<p>Эти данные будут в новых заказах.</p>` +
      `</div>` +
      `</header>` +
      `<div class="c-profile-grid">` +
      `<form id="c-profile-form" class="c-form-card">` +
      `<label class="c-field">` +
      `<span>Имя и фамилия</span>` +
      `<input id="c-profile-name" value="${esc(state.profile.name)}" maxlength="80" required>` +
      `</label>` +
      `<label class="c-field">` +
      `<span>Учебная группа</span>` +
      `<input id="c-profile-group" value="${esc(state.profile.group)}" maxlength="30" required>` +
      `</label>` +
      `<button class="btn primary" type="submit">Сохранить изменения ✓</button>` +
      `<p class="c-hint">Данные уже оформленных заказов сохраняются такими, какими были на момент оформления.</p>` +
      `</form>` +
      `<aside class="c-form-card">` +
      `<h2>Настройки</h2>` +
      `<p class="c-hint">Светлая или тёмная тема переключается в правом верхнем углу и запоминается.</p>` +
      `<div class="c-profile-info">` +
      `<span>Логин</span>` +
      `<b>${esc(state.user.id)}</b>` +
      `</div>` +
      `<div class="c-profile-info">` +
      `<span>Роль</span>` +
      `<b>Заказчик</b>` +
      `</div>` +
      `<button class="btn secondary" data-action="logout">Выйти из аккаунта ${arrowIcon()}` +
      `</button>` +
      `</aside>` +
      `</div>`
    );
  }
  function render() {
    return (
      `<div class="customer-space">${nav()}<div class="c-content">${state.page === 'overview' ? overview() : state.page === 'print' ? printPage() : state.page === 'orders' ? orderPage() : state.page === 'merch' ? merchPage() : profilePage()}</div>` +
      `<p class="c-prototype-note">Демо: заказы и сообщения сохраняются только в этом браузере.</p>` +
      `</div>`
    );
  }
  function orderDrawer(o) {
    const p = o.params;
    return (
      `<div class="c-drawer-backdrop">` +
      `<section class="c-drawer" role="dialog" aria-modal="true" aria-labelledby="c-drawer-title">` +
      `<header class="c-drawer-header">` +
      `<div>` +
      `<span class="c-kicker">${o.kind === 'merch' ? 'Мерч' : 'Документы'}</span>` +
      `<h2 id="c-drawer-title">Заказ №${o.id}</h2>` +
      `</div>` +
      `<button id="c-close-order" aria-label="Закрыть заказ" data-c-close>×</button>` +
      `</header>` +
      `<div class="c-drawer-status">${badge(o)}<p>${server && o.status === 'cancelled' ? 'Заказ отменён до начала печати.' : states[o.status][1]}</p>` +
      `</div>` +
      `<div class="c-tabs c-drawer-tabs">` +
      `<button data-c-drawer-tab="info" class="${state.detailTab === 'info' ? 'active' : ''}">Детали заказа</button>` +
      `<button data-c-drawer-tab="chat" class="${state.detailTab === 'chat' ? 'active' : ''}">Переписка ${o.unread ? '<small>' + o.unread + '</small>' : ''}</button>` +
      `</div>${
        state.detailTab === 'info'
          ? `<div class="c-drawer-body">` +
            `<h3>${esc(o.title)}</h3>${steps(o)}${orderDetails(o, p)}<p class="c-hint">${o.status === 'issued' ? 'Заказ выдан.' : 'Оплата безналичная при получении. Итог подтвердит сотрудник.'}</p>${
              o.comment
                ? `<div class="c-comment-saved">` +
                  `<b>Твой комментарий</b>` +
                  `<p>${esc(o.comment)}</p>` +
                  `</div>`
                : ''
            }${orderAttachments(o)}${orderEvents(o)}${orderActions(o)}<details class="c-demo-tools">` +
            `<summary>Пример смены статуса · демо</summary>` +
            `<p>Для проверки внешнего вида. Реального сотрудника не уведомляет.</p>` +
            `<button class="btn secondary" data-c-demo-status="${o.id}">Следующий статус ${arrowIcon()}` +
            `</button>` +
            `</details>` +
            `</div>`
          : chatHTML(o)
      }</section>` +
      `</div>`
    );
  }
  function successHTML(o) {
    return (
      `<div class="success-seal">✓</div>` +
      `<span class="c-kicker">Заказ оформлен в прототипе</span>` +
      `<h2>Заказ №${o.id} принят.</h2>` +
      `<p>Он уже виден в верхней панели и на главной кабинета. Сотрудник сначала проверит файл и параметры.</p>` +
      `<div class="modal-row">` +
      `<span>${esc(o.title)}</span>` +
      `<strong>${money(o.total)}</strong>` +
      `</div>` +
      `<button class="btn primary" data-c-success-order="${o.id}">Открыть заказ ${arrowIcon()}` +
      `</button>` +
      `<p class="c-hint" style="margin-top:15px">Это локальный пример: данные в реальную типографию не отправлены.</p>`
    );
  }
  function greeting() {
    return (
      `<header class="v-greeting">` +
      `<span>ТВОЁ ПРОСТРАНСТВО / ОКЭИ</span>` +
      `<p>Привет, ${esc(state.profile.name)} <small>${esc(state.profile.group)}</small>` +
      `</p>` +
      `</header>`
    );
  }
  function hero() {
    return (
      `<section class="v-hero">` +
      `<div class="v-hero-copy">` +
      `<span class="c-kicker">От файла до готовой вещи</span>` +
      `<h1>Твои идеи.<br>В реальном<br>` +
      `<em>формате.</em>` +
      `</h1>` +
      `<p>Документы к паре и мерч с твоим дизайном.</p>` +
      `<div class="v-hero-actions">` +
      `<button class="btn primary" data-c-page="print">${state.draft.fileKey ? 'Продолжить печать' : 'Загрузить PDF'} ${arrowIcon()}` +
      `</button>` +
      `<button class="c-text-btn" data-c-studio>Создать свой мерч ${arrowIcon()}` +
      `</button>` +
      `</div>` +
      `<div class="v-hero-foot">` +
      `<span>01 / Загрузи</span>` +
      `<span>02 / Настрой</span>` +
      `<span>03 / Забери</span>` +
      `</div>` +
      `</div>` +
      `<div class="v-hero-art" data-v-tilt>` +
      `<span class="v-art-caption">ЦИФРОВОЕ → ОЩУТИМОЕ</span>` +
      `<div class="v-sculpture-wrap">${pdfArtwork()}</div>` +
      `<div class="v-glass-label">` +
      `<span class="v-tiny-page">A4</span>` +
      `<div>` +
      `<b>PDF готов к печати</b>` +
      `<small>Стоимость — до заказа</small>` +
      `</div>` +
      `<span>` +
      `${arrowIcon()}` +
      `</span>` +
      `</div>` +
      `<span class="v-art-sticker">СОЗДАНО<br>ТОБОЙ</span>` +
      `</div>` +
      `</section>`
    );
  }
  function services() {
    return (
      `<div class="v-service-grid">` +
      `<button class="v-service v-doc-service" data-c-page="print">` +
      `<div>` +
      `<span class="c-kicker">01 / Документы</span>` +
      `<h2>Последний штрих<br>перед сдачей.</h2>` +
      `<p>Параметры и цена — на одном экране.</p>` +
      `<b>от 4 ₽ <small>/ односторонний лист A4</small>` +
      `</b>` +
      `</div>${sheetArt()}<span class="v-service-arrow">` +
      `${arrowIcon()}` +
      `</span>` +
      `</button>` +
      `<button class="v-service v-merch-service" data-c-page="merch">` +
      `<img class="v-service-shirt" src="/assets/college-shirt.png" alt="Футболка из коллекции ОКЭИ">` +
      `<div class="v-service-print">` +
      `<img src="/assets/college-red.svg" alt="">` +
      `<b>СВОЯ КОМАНДА</b>` +
      `</div>` +
      `<div>` +
      `<span class="c-kicker">02 / Коллекция ОКЭИ</span>` +
      `<h2>Свои.<br>Узнают.</h2>` +
      `<p>Логотип колледжа.<br>И место для твоего дизайна.</p>` +
      `<b>Открыть коллекцию ${arrowIcon()}` +
      `</b>` +
      `</div>` +
      `<span class="v-merch-tag">ОКЭИ<br>СВОЯ КОМАНДА ${arrowIcon()}` +
      `</span>` +
      `</button>` +
      `</div>`
    );
  }
  function studioInvitation() {
    return (
      `<section class="v-studio-invite">` +
      `<div>` +
      `<span class="c-kicker">Не только готовое</span>` +
      `<h2>А если по-своему?</h2>` +
      `<p>Загрузи картинку. Добавь слова. Выбери цвет.</p>` +
      `<button class="btn primary" data-c-studio>Открыть конструктор ${arrowIcon()}` +
      `</button>` +
      `</div>` +
      `<div class="v-type-play" aria-hidden="true">` +
      `<span>ТВОЙ</span>` +
      `<b>ПРИНТ.</b>` +
      `<i>100% ты</i>` +
      `</div>` +
      `</section>`
    );
  }
  function costCard(q, result) {
    return (
      `<aside class="c-cost-card" aria-label="Расчёт стоимости">` +
      `<span class="c-kicker">Без сюрпризов</span>` +
      `<h2>Стоимость заказа</h2>` +
      `<div id="c-quote">${q ? quoteHTML(q) : '<p class="c-cost-empty">' + esc(result.error || 'Загрузи PDF — мы посчитаем страницы и стоимость.') + '</p>'}</div>` +
      `<div class="c-paper-visual" aria-hidden="true">` +
      `<div class="c-paper ${state.draft.duplex ? 'two-sided' : ''}">` +
      `<span>01</span>` +
      `<i>` +
      `</i>` +
      `<i>` +
      `</i>` +
      `<i>` +
      `</i>` +
      `<b>${state.draft.format}</b>` +
      `<em>02</em>` +
      `</div>` +
      `<small>${q ? q.sheets + ' ' + plural(q.sheets, 'лист', 'листа', 'листов') + ' · ' + q.impressions + ' ' + plural(q.impressions, 'страница', 'страницы', 'страниц') : 'Твой документ'}</small>` +
      `</div>${
        state.draft.fileKey
          ? `<button class="c-text-btn" data-c-preview-draft>Открыть исходный PDF ${arrowIcon()}` +
            `</button>`
          : ''
      }<details class="c-tariff-note">` +
      `<summary>Демотарифы и расчёт</summary>` +
      `<p>A4: ч/б 6 ₽, цвет 40 ₽ за двусторонний лист. A3: 16 ₽ и 80 ₽. Итог подтвердит типография.</p>` +
      `</details>` +
      `</aside>`
    );
  }
  function pageRange(error) {
    return (
      `<div class="c-field-group">` +
      `<h2>Какие страницы?</h2>` +
      `<div class="c-segment">${choice('useRange', 'false', 'Все страницы', state.draft.pages + ' стр.', !state.draft.useRange)}${choice('useRange', 'true', 'Указать диапазон', 'Например: 1–3, 5', state.draft.useRange)}</div>${
        state.draft.useRange
          ? `<label class="c-field">` +
            `<span>Страницы для печати</span>` +
            `<input id="c-range" value="${esc(state.draft.range)}" placeholder="1–3, 5" inputmode="text">` +
            `<small id="c-range-hint">${error || 'Повторы не печатаются дважды. Диапазон считается для каждой копии.'}</small>` +
            `</label>`
          : ''
      }</div>`
    );
  }
  function paperOptions() {
    return (
      `<div class="c-settings-row">` +
      `<label class="c-field">` +
      `<span>Формат</span>` +
      `<select data-c-select="format">` +
      `<option ${state.draft.format === 'A4' ? 'selected' : ''}>A4</option>` +
      `<option ${state.draft.format === 'A3' ? 'selected' : ''}>A3</option>` +
      `</select>` +
      `</label>` +
      `<label class="c-field">` +
      `<span>Бумага</span>` +
      `<select data-c-select="paper">` +
      `<option value="normal" ${state.draft.paper === 'normal' ? 'selected' : ''}>Обычная</option>` +
      `<option value="photo" ${state.draft.paper === 'photo' ? 'selected' : ''}>Фотобумага</option>` +
      `</select>` +
      `</label>` +
      `</div>`
    );
  }
  function colorOptions() {
    return (
      `<div class="c-field-group">` +
      `<h2>Цвет печати</h2>` +
      `<div class="c-segment">${choice('color', 'mono', 'Чёрно-белая', 'Текст и схемы', state.draft.color === 'mono', state.draft.paper === 'photo')}${choice('color', 'color', 'Цветная', 'Фото и презентации', state.draft.color === 'color')}</div>` +
      `</div>`
    );
  }
  function sideOptions(q) {
    const twoSheets =
      server && state.draft.files?.length && q
        ? state.draft.files.reduce(
            (sum, file) =>
              sum +
              Math.ceil(
                M.selection(file.pages, state.draft.useRange ? state.draft.range : '').length / 2,
              ),
            0,
          )
        : Math.ceil((q?.pages || state.draft.pages) / 2);
    return (
      `<div class="c-field-group">` +
      `<h2>Стороны печати</h2>` +
      `<div class="c-segment c-sides">${choice('duplex', 'false', 'С одной стороны', (q?.pages || state.draft.pages) + ' стр. → ' + (q?.pages || state.draft.pages) + ' ' + plural(q?.pages || state.draft.pages, 'лист', 'листа', 'листов') + ' на копию', !state.draft.duplex)}${choice('duplex', 'true', 'С двух сторон', (q?.pages || state.draft.pages) + ' стр. → ' + twoSheets + ' ' + plural(twoSheets, 'лист', 'листа', 'листов') + ' на копию', state.draft.duplex, state.draft.paper === 'photo')}</div>` +
      `<p class="c-hint">${state.draft.paper === 'photo' ? 'Фотобумага: цветная печать с одной стороны.' : state.draft.duplex ? 'Две страницы — один лист. Непарная страница — отдельно.' : 'Одна страница — один лист.'}</p>` +
      `</div>`
    );
  }
  function copyAndBindingOptions(q) {
    return (
      `<div class="c-settings-row">` +
      `<label class="c-field">` +
      `<span>Количество копий</span>` +
      `<div class="c-counter">` +
      `<button data-c-copy="-1" aria-label="Меньше копий">−</button>` +
      `<input id="c-copies" aria-label="Количество копий" type="number" min="1" max="99" step="1" value="${state.draft.copies}">` +
      `<button data-c-copy="1" aria-label="Больше копий">+</button>` +
      `</div>` +
      `</label>` +
      `<label class="c-field">` +
      `<span>Переплёт</span>` +
      `<select data-c-select="binding">` +
      `<option value="none" ${state.draft.binding === 'none' ? 'selected' : ''}>Без переплёта</option>` +
      `<option value="spiral" ${state.draft.binding === 'spiral' ? 'selected' : ''}>Брошюровка · от 100 ₽</option>` +
      `<option value="diploma" ${state.draft.binding === 'diploma' ? 'selected' : ''}>Диплом · 525 ₽</option>` +
      `</select>` +
      `</label>` +
      `</div>${state.draft.binding === 'spiral' && q ? `<p class="c-hint">${q.sheetsPerCopy} ${plural(q.sheetsPerCopy, 'лист', 'листа', 'листов')} в каждой копии → ${q.bindingPerCopy} ₽ за брошюровку. До 50 листов — 100 ₽, больше — 150 ₽.</p>` : ''}`
    );
  }
  function orderEvents(o) {
    return (
      `<div class="c-order-events">` +
      `<h3>История статусов</h3>${o.events
        .map(
          (e) =>
            `<div>` +
            `<i>` +
            `</i>` +
            `<span>${states[e.status][0]}<small>${fmt(e.time)}</small>` +
            `</span>` +
            `</div>`,
        )
        .join('')}</div>`
    );
  }
  function orderActions(o) {
    return (
      `<div class="c-drawer-actions">` +
      `<button class="btn secondary" data-c-drawer-tab="chat">Написать сотруднику ${arrowIcon()}` +
      `</button>${(server ? o.canCancel : o.status === 'new') ? `<button class="c-danger-btn" data-c-cancel="${o.id}">Отменить заказ</button>` : ''}${
        ['issued', 'cancelled'].includes(o.status)
          ? `<button class="c-text-btn" data-c-repeat="${o.id}">Повторить заказ ${arrowIcon()}` +
            `</button>`
          : ''
      }</div>`
    );
  }
  function orderAttachments(o) {
    if (server && o.files?.length > 1)
      return o.files
        .map(
          (file) =>
            '<div class="c-file-inline"><span class="c-file-mark">PDF</span><span><b>' +
            esc(file.name) +
            '</b><small>' +
            file.pages +
            ' стр. · ' +
            Math.ceil(file.size / 1024) +
            ' КБ · ' +
            money(file.quote.total) +
            '</small></span><button class="c-text-btn" data-c-file-id="' +
            esc(file.id) +
            '">Открыть PDF</button><a class="c-text-btn" href="/api/orders/' +
            o.id +
            '/files/' +
            esc(file.id) +
            '" download>Скачать</a></div>',
        )
        .join('');
    return `${
      o.fileKey
        ? `<button class="btn secondary" data-c-open-file="${o.id}">Открыть PDF ${arrowIcon()}` +
          `</button>`
        : o.sample
          ? '<p class="c-hint">Демонстрационный заказ без вложенного PDF.</p>'
          : ''
    }${
      o.designKey
        ? `<button class="btn secondary" data-c-design-preview="${o.id}">Посмотреть макет ${arrowIcon()}` +
          `</button>`
        : ''
    }`;
  }
  function orderDetails(o, p) {
    return (
      `<dl class="c-detail-params">${
        o.kind === 'document'
          ? `<div>` +
            `<dt>Страницы / копии</dt>` +
            `<dd>${p.selectedPages || p.pages} стр. × ${p.copies} коп.</dd>` +
            `</div>` +
            `<div>` +
            `<dt>Печать</dt>` +
            `<dd>${p.format} · ${p.color === 'mono' ? 'ч/б' : 'цвет'} · ${p.duplex ? 'с двух сторон' : 'с одной стороны'}</dd>` +
            `</div>` +
            `<div>` +
            `<dt>Листов</dt>` +
            `<dd>${o.quote?.sheets || M.quote(p).sheets}</dd>` +
            `</div>${
              p.useRange
                ? `<div>` +
                  `<dt>Выбраны страницы</dt>` +
                  `<dd>${esc(server && o.files?.length > 1 ? p.range + ' (в каждом PDF)' : (p.pageList || []).join(', '))}</dd>` +
                  `</div>`
                : ''
            }<div>` +
            `<dt>Бумага</dt>` +
            `<dd>${p.paper === 'photo' ? 'Фотобумага' : 'Обычная'}</dd>` +
            `</div>` +
            `<div>` +
            `<dt>Переплёт</dt>` +
            `<dd>${p.binding === 'none' ? 'Нет' : p.binding === 'spiral' ? 'Брошюровка' : 'Диплом'}</dd>` +
            `</div>`
          : `<div>` +
            `<dt>Размер / количество</dt>` +
            `<dd>${p.size} / ${p.copies} шт.</dd>` +
            `</div>` +
            `<div>` +
            `<dt>Принт</dt>` +
            `<dd>${p.design === 'studio' ? 'Свой макет · ' + esc(p.shirtColorName || 'цвет по макету') : p.design === 'custom' ? esc(p.text) : 'Логотип ОКЭИ'}</dd>` +
            `</div>`
      }<div>` +
      `<dt>Заказчик</dt>` +
      `<dd>${esc(o.customer?.name || state.profile.name)} · ${esc(o.customer?.group || state.profile.group)}</dd>` +
      `</div>` +
      `<div>` +
      `<dt>Стоимость</dt>` +
      `<dd>` +
      `<strong>${money(o.total)}</strong>` +
      `</dd>` +
      `</div>` +
      `</dl>` +
      (server
        ? (o.printingStartedAt
            ? '<p class="c-hint">Печать начата: ' + fmt(o.printingStartedAt) + '</p>'
            : '') +
          (o.cancelledAt ? '<p class="c-hint">Отменён: ' + fmt(o.cancelledAt) + '</p>' : '')
        : '')
    );
  }
  function cancelConfirmation(id) {
    return (
      `<span class="c-kicker">Заказ №${id}</span>` +
      `<h2>Отменить заказ?</h2>` +
      `<p>${server ? 'Печать ещё не началась. После отмены заказ можно будет оформить заново.' : 'Он ещё не принят в работу. После отмены его можно будет оформить заново.'}</p>` +
      `<button class="btn primary" data-c-confirm-cancel="${id}">Да, отменить заказ</button>` +
      `<button class="btn secondary" data-c-keep="${id}" style="width:100%;margin-top:10px">Оставить заказ</button>`
    );
  }
  function merchConfirmation(pendingMerch) {
    return (
      `<span class="c-kicker">Проверим мерч</span>` +
      `<h2>${pendingMerch.design === 'custom' ? 'Твоя футболка.' : 'ОКЭИ / Классика'}</h2>` +
      `<div class="modal-row">` +
      `<span>Размер / количество</span>` +
      `<strong>${pendingMerch.size} / ${pendingMerch.count} шт.</strong>` +
      `</div>` +
      `<div class="modal-row">` +
      `<span>Стоимость примера</span>` +
      `<strong>${money(pendingMerch.count * MERCH_PRICE)}</strong>` +
      `</div>` +
      `<p style="margin-top:18px">Наличие и итоговую цену подтвердит сотрудник. Это демонстрационный заказ.</p>` +
      `<button class="btn primary" data-c-confirm-merch>Подтвердить заказ ${arrowIcon()}` +
      `</button>`
    );
  }
  return {
    render,
    orderRow,
    quoteHTML,
    orderDrawer,
    successHTML,
    cancelConfirmation,
    merchConfirmation,
  };
}
