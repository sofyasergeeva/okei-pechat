import { priceFields, priceText } from '../pricing.mjs';
import { escapeHTML as E, formatMoney as rub, formatDate as stamp } from '../shared.mjs';
import {
  fixtureKey,
  labels,
  icons,
  active,
  visible as selectVisible,
  summarizeGroups,
} from './orders.mjs';
export function createStaffViews(state, { ui, pdfArtwork, server = false }) {
  const I = (name) => ui.icon(name);
  const visible = () => selectVisible(state);
  const selected = () => state.all.find((o) => o._ref === state.chosen);
  const badge = (o) =>
    `<span class="w-status w-${o.status}">${I(icons[o.status])}${labels[o.status] || E(o.status)}</span>`;
  function nav() {
    return (
      `<nav class="w-nav" aria-label="Кабинет сотрудника">${[
        ['queue', 'Очередь', 'printer'],
        ['archive', 'История', 'orders'],
        ['groups', 'По группам', 'user'],
        ...(server && state.user?.role === 'admin'
          ? [
              ['personnel', 'Сотрудники', 'user'],
              ['prices', 'Прайс', 'orders'],
            ]
          : []),
      ]
        .map(
          ([id, label, icon]) =>
            `<button data-w-page="${id}" class="${state.page === id ? 'active' : ''}" ${state.page === id ? 'aria-current="page"' : ''}>${I(icon)}<span>${label}</span>${id === 'queue' ? `<small>${state.all.filter(active).length}</small>` : ''}</button>`,
        )
        .join('')}<div class="w-sidebar-art" aria-hidden="true">` +
      `<small>ТИПОГРАФИЯ ОКЭИ</small>` +
      `<div class="w-sculpture">${pdfArtwork()}</div>` +
      `</div>` +
      `<div class="w-identity">` +
      `<span>${I('user')} ${server ? E(state.user?.login || state.user?.id || '') : 'Сотрудник типографии'}</span>` +
      `<button data-action="logout">Выйти ${I('arrow')}</button>` +
      `</div>` +
      `</nav>`
    );
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
        const n = state.all.filter((o) =>
          id === 'active'
            ? active(o)
            : id === 'questions'
              ? ['attention', 'review'].includes(o.status)
              : o.status === id,
        ).length;
        return (
          `<button class="w-stat ${state.filter === id ? 'active' : ''} w-stat-${id}" data-w-filter="${id}" aria-pressed="${state.filter === id}">` +
          `<span>${I(icon)}${text}</span>` +
          `<b>${n}</b>` +
          `</button>`
        );
      })
      .join('')}</div>`;
  }
  function row(o) {
    return (
      `<button class="w-order ${o._ref === state.chosen ? 'selected' : ''}" data-w-order="${E(o._ref)}" aria-label="Заказ №${E(o.id)}, ${E(o.title)}, ${labels[o.status]}" ${o._ref === state.chosen ? 'aria-current="true"' : ''}>` +
      `<span class="w-file ${o.kind === 'merch' ? 'w-shirt' : ''}">${o.kind === 'merch' ? '<img src="/assets/college-shirt.png" alt="">' : 'PDF'}</span>` +
      `<span class="w-order-title">` +
      `<small>№${E(o.id)} · ${E(o.customer.group)}</small>` +
      `<b>${E(o.title)}</b>` +
      `<span>${o.kind === 'document' ? `${E(o.params.format)} · ${o.params.selectedPages || o.params.pages} стр. · ${o.params.copies} коп. · ${o.params.duplex ? '2 стороны' : '1 сторона'}` : `${E(o.params.size)} · ${o.params.copies} шт.`}</span>` +
      (server
        ? `<span class="w-order-owner">${o.assignedTo ? (o.assignedTo === state.user.id ? 'Ответственный: ты' : 'Ведёт: ' + E(o.assignee?.name || 'сотрудник')) : active(o) ? 'Свободен' : 'Без ответственного'}</span>`
        : '') +
      `</span>` +
      `<span class="w-order-end">${badge(o)}<b>${rub(o.total)}</b>` +
      `</span>` +
      `<span class="w-row-arrow">${I('arrow')}</span>` +
      `</button>`
    );
  }
  function controls() {
    return (
      `<div class="w-list-controls">` +
      `<label class="w-search">` +
      `<span class="sr-only">Поиск по номеру, файлу, имени или группе</span>` +
      `<input id="w-search" type="search" placeholder="Номер, файл или группа" value="${E(state.query)}">` +
      `</label>` +
      `<div class="w-segments" role="group" aria-label="Тип заказа">${[
        ['all', 'Все'],
        ['document', 'Печать'],
        ['merch', 'Мерч'],
      ]
        .map(
          ([id, label]) =>
            `<button data-w-kind="${id}" aria-pressed="${state.kind === id}" class="${state.kind === id ? 'active' : ''}">${label}</button>`,
        )
        .join('')}</div>` +
      `</div>`
    );
  }
  function queue() {
    const rows = visible(),
      pending = state.all.filter((o) => o.status === 'review').length;
    return (
      `<header class="w-heading">` +
      `<div>` +
      `<h1>${state.page === 'archive' ? 'История.' : 'Очередь заказов.'}</h1>` +
      `</div>` +
      `<button class="w-button w-outline" data-w-refresh aria-label="Обновить очередь">${I('clock')} <span>Обновить</span>` +
      `<i class="w-refresh-dot" ${state.stale ? '' : 'hidden'}>` +
      `</i>` +
      `</button>` +
      `</header>${state.page === 'queue' ? counts() : ''}${
        pending && state.page === 'queue'
          ? `<button class="w-reply-callout" data-w-filter="questions">${I('message')}<span>Ответ заказчика <b>${pending}</b>` +
            `</span>` +
            `<span>Посмотреть ${I('arrow')}</span>` +
            `</button>`
          : ''
      }<div class="w-workspace">` +
      `<section class="w-queue-panel" aria-label="Список заказов">` +
      `<div class="w-section-title">` +
      `<h2>${state.page === 'archive' ? 'Завершённые' : state.filter === 'active' ? 'Текущие заказы' : state.filter === 'questions' ? 'Уточнения' : state.filter === 'all' ? 'Все заказы' : { new: 'Новые заказы', work: 'В работе', ready: 'К выдаче' }[state.filter] || 'Заказы'} <small id="w-result-count">${rows.length}</small>` +
      `</h2>${state.query || state.kind !== 'all' || !['active', 'all'].includes(state.filter) ? '<button class="w-text" data-w-clear>Сбросить фильтры</button>' : ''}</div>${controls()}<div id="w-results">${rows.length ? rows.map(row).join('') : '<div class="w-empty">' + I('check') + '<h3>Здесь пока спокойно.</h3><p>Выбери другой статус или измени поиск.</p></div>'}</div>` +
      `</section>` +
      `<aside class="w-inspector" aria-label="Выбранный заказ">${detail()}</aside>` +
      `</div>`
    );
  }
  function param(label, value) {
    return `<div>` + `<dt>${label}</dt>` + `<dd>${E(value)}</dd>` + `</div>`;
  }
  function params(o) {
    const p = o.params;
    return `<dl class="w-params">${o.kind === 'document' ? param('Формат', p.format) + param('Цвет', p.color === 'color' ? 'Цветная' : 'Чёрно-белая') + param('Страницы', p.useRange ? p.range : (p.selectedPages || p.pages) + ' · все') + param('Стороны', p.duplex ? 'С двух сторон' : 'С одной стороны') + param('Копии', p.copies) + param('Листов', server && o.quote ? o.quote.sheets : Math.ceil((p.selectedPages || p.pages) / (p.duplex ? 2 : 1)) * p.copies) + param('Бумага', p.paper === 'photo' ? 'Фотобумага' : 'Обычная') + param('Переплёт', p.binding === 'spiral' ? 'Пружина' : p.binding === 'diploma' ? 'Дипломный' : 'Без переплёта') : param('Размер', p.size) + param('Количество', p.copies) + param('Цвет', p.shirtColorName || p.color || 'Молочный') + param('Макет', p.design === 'studio' ? 'Из конструктора' : p.design === 'classic' ? 'Логотип ОКЭИ' : 'Своя надпись')}</dl>`;
  }
  function actions(o) {
    if (server && active(o) && o.assignedTo && o.assignedTo !== state.user.id)
      return (
        '<p class="w-assignment-note">Заказ ведёт ' +
        E(o.assignee?.name || 'сотрудник') +
        '.</p><button class="w-button w-outline" data-w-tab="chat">Переписка</button>'
      );
    if (server && active(o) && !o.assignedTo && ['work', 'ready'].includes(o.status))
      return '<button class="w-button w-primary" data-w-claim>Взять в работу</button>';

    if (server && o.status === 'work' && !o.printingStartedAt)
      return (
        '<div class="w-action-block"><button class="w-button w-primary" data-w-start-printing>' +
        (o.kind === 'merch' ? 'Начать изготовление ' : 'Начать печать ') +
        I('printer') +
        '</button><button class="w-text" data-w-tab="chat">Уточнить ' +
        I('message') +
        '</button><details class="w-more"><summary>Ещё</summary><button class="w-text" data-w-cancel>Отменить заказ</button></details></div>'
      );
    if (state.confirm === 'issue')
      return (
        `<form id="w-issue-form" class="w-confirm">` +
        `<h3>Выдать заказ №${E(o.id)}?</h3>` +
        `<label class="w-check">` +
        `<input type="checkbox" name="paid" required>Оплата получена</label>` +
        `<div>` +
        `<button class="w-button w-primary" type="submit">Подтвердить выдачу</button>` +
        `<button class="w-text" type="button" data-w-dismiss>Назад</button>` +
        `</div>` +
        `<small>Отметка учёта без списания денег.</small>` +
        `</form>`
      );
    if (state.confirm === 'cancel')
      return (
        `<form id="w-cancel-form" class="w-confirm">` +
        `<h3>Отменить заказ?</h3>` +
        `<label class="w-label">Причина<input name="reason" required maxlength="300" placeholder="Например, отмена заказчиком">` +
        `</label>` +
        `<div>` +
        `<button class="w-button w-primary" type="submit">Подтвердить отмену</button>` +
        `<button class="w-text" type="button" data-w-dismiss>Назад</button>` +
        `</div>` +
        `</form>`
      );
    if (o.status === 'issued')
      return (
        `<div class="w-final-note">${I('check')}<span>Заказ выдан<small>${o.payment === 'paid' ? 'Оплата отмечена' : 'Оплата не отмечена в старом демозаказе'}</small>` +
        `</span>` +
        `</div>`
      );
    if (o.status === 'cancelled')
      return (
        `<div class="w-final-note">${I('close')}<span>Заказ отменён<small>${E(o.cancelReason || 'Отменён заказчиком')}</small>` +
        `</span>` +
        `</div>`
      );
    if (o.status === 'attention')
      return (
        `<div class="w-action-block">` +
        `<button class="w-button w-outline" data-w-tab="chat">Открыть переписку ${I('message')}</button>` +
        `<label class="w-check">` +
        `<input type="checkbox" data-w-checked ${state.checked.has(o._ref) ? 'checked' : ''}>Уточнение согласовано</label>` +
        `<button class="w-button w-primary" data-w-resume ${state.checked.has(o._ref) ? '' : 'disabled'}>Вернуть в работу ${I('printer')}</button>` +
        `</div>`
      );
    const next = {
      new: ['work', 'Принять в работу'],
      review: ['work', 'Вернуть в работу'],
      work: ['ready', 'Отметить готовым'],
      ready: ['issued', 'Выдать заказ'],
    }[o.status];
    return `<div class="w-action-block">${
      ['new', 'review'].includes(o.status)
        ? `<label class="w-check">` +
          `<input type="checkbox" data-w-checked ${state.checked.has(o._ref) ? 'checked' : ''}>Файл и параметры проверены</label>`
        : ''
    }<button class="w-button w-primary" data-w-next="${next[0]}" ${['new', 'review'].includes(o.status) && !state.checked.has(o._ref) ? 'disabled' : ''}>${server && next[0] === 'work' && !o.assignedTo ? 'Взять в работу' : next[1]} ${I(next[0] === 'work' ? 'printer' : 'check')}</button>${
      ['new', 'work', 'review'].includes(o.status)
        ? `<div class="w-secondary-actions">` +
          `<button class="w-text" data-w-tab="chat">Уточнить ${I('message')}</button>` +
          (!server || o.canCancel
            ? '<details class="w-more"><summary>Ещё</summary><button class="w-text" data-w-cancel>Отменить заказ</button></details>'
            : '') +
          `</div>`
        : ''
    }</div>`;
  }
  function chat(o) {
    return (
      `<div class="w-chat">` +
      `<p class="w-chat-note">${o._store === fixtureKey ? 'Демо-переписка · без реального адресата.' : 'Переписка локальная, в этом браузере.'}</p>` +
      `<div class="w-messages">${
        (o.messages || []).length
          ? o.messages
              .map(
                (m) =>
                  `<div class="w-message ${m.author === 'staff' ? 'from-staff' : 'from-user'}">` +
                  `<small>${m.author === 'staff' ? 'Сотрудник' : E(o.customer.name)} · ${stamp(m.time)}</small>` +
                  `<p>${E(m.text)}</p>` +
                  `</div>`,
              )
              .join('')
          : '<div class="w-empty w-small-empty">' +
            I('message') +
            '<p>Уточни детали перед печатью.</p></div>'
      }</div>${
        active(o)
          ? `<form id="w-chat-form">` +
            `<label class="w-label" for="w-message">Сообщение заказчику</label>` +
            `<textarea id="w-message" name="message" required maxlength="2000" rows="3" placeholder="Что нужно уточнить?">${E(state.writing.get(o._ref)?.text || '')}</textarea>${
              ['new', 'work', 'review'].includes(o.status) &&
              (!server || !o.assignedTo || o.assignedTo === state.user.id)
                ? `<label class="w-check">` +
                  `<input type="checkbox" name="pause" ${state.writing.get(o._ref)?.pause === false ? '' : 'checked'}>Приостановить до ответа</label>`
                : ''
            }<button class="w-button w-primary" type="submit">Сохранить сообщение ${I('arrow')}</button>` +
            `</form>`
          : ''
      }</div>`
    );
  }
  function fileActions(o) {
    if (server && o.kind === 'document' && o.files?.length > 1)
      return o.files
        .map(
          (file) =>
            '<div class="w-file-actions"><span><b>' +
            E(file.name) +
            '</b><small> · ' +
            file.pages +
            ' стр. · ' +
            Math.ceil(file.size / 1024) +
            ' КБ · ' +
            rub(file.quote.total) +
            '</small></span><button class="w-button w-outline" data-w-file-id="' +
            E(file.id) +
            '">Открыть PDF</button><a class="w-text" href="/api/orders/' +
            o.id +
            '/files/' +
            E(file.id) +
            '" download>Скачать</a></div>',
        )
        .join('');
    if (server && o.kind === 'merch')
      return (
        '<div class="w-file-actions"><button class="w-button w-outline" data-w-preview>Превью PNG</button><button class="w-text" data-w-design>Исходный макет JSON</button>' +
        o.files
          .filter((file) => file.kind !== 'design')
          .map(
            (file) =>
              '<a class="w-text" href="/api/orders/' +
              o.id +
              '/files/' +
              E(file.id) +
              '" download>' +
              { preview: 'Скачать превью', front: 'Принт спереди PNG', back: 'Принт сзади PNG' }[
                file.kind
              ] +
              '</a>',
          )
          .join('') +
        '</div>'
      );
    return `<div class="w-file-actions">${server && o.files?.length === 1 ? '<a class="w-text" href="/api/orders/' + o.id + '/file" download>Скачать PDF</a>' : ''}${o.kind === 'document' ? `<button class="w-button w-outline" data-w-file ${o.fileKey || o.sampleFile ? '' : 'disabled'}>${I('file')} ${o.fileKey || o.sampleFile ? 'Открыть PDF' : 'Нет исходного файла'}</button>` : o.previewKey || o.designKey ? `${o.previewKey ? '<button class="w-button w-outline" data-w-preview>Превью PNG</button>' : ''}${o.designKey ? '<button class="w-text" data-w-design>Исходный макет JSON</button>' : ''}` : ''}</div>`;
  }
  function assignment(o) {
    const owns = o.assignedTo === state.user.id;
    return (
      '<div class="w-assignment"><p>' +
      (o.assignedTo
        ? (owns ? 'Ответственный (ты) · ' : 'Ответственный · ') + E(o.assignee?.name || 'Сотрудник')
        : active(o)
          ? 'Свободный заказ'
          : 'Ответственный не назначен') +
      '</p>' +
      (active(o) && owns && !o.printingStartedAt
        ? '<button class="w-text" data-w-release>Освободить заказ</button>'
        : '') +
      (active(o) && state.user.role === 'admin'
        ? '<form id="w-assignment-form"><label class="sr-only" for="w-assignee">Ответственный</label><select id="w-assignee" name="assigneeId" aria-label="Ответственный" required><option value="">Выбери сотрудника</option>' +
          (state.personnel || [])
            .filter((u) => u.active)
            .map(
              (u) =>
                '<option value="' +
                E(u.id) +
                '" ' +
                (o.assignedTo === u.id ? 'selected' : '') +
                '>' +
                E(u.name) +
                ' · ' +
                E(u.login) +
                '</option>',
            )
            .join('') +
          '</select><button class="w-button w-outline" type="submit">Назначить</button></form>'
        : '') +
      '</div>'
    );
  }
  function detail() {
    const o = selected();
    if (!o) return `<div class="w-empty">${I('file')}<h3>Нет выбранного заказа.</h3>` + `</div>`;
    return (
      `<div class="w-detail-header">` +
      `<div class="w-detail-top">` +
      `<span class="w-kicker">${o._store === fixtureKey ? 'ДЕМОЗАКАЗ' : 'ЗАКАЗ'}</span>` +
      `<button class="w-close" data-w-close aria-label="Закрыть заказ">${I('close')}</button>` +
      `</div>` +
      `<div class="w-detail-heading">` +
      `<h2>№${E(o.id)}</h2>${badge(o)}</div>` +
      `<h3 class="w-detail-name">${E(o.title)}</h3>` +
      `<p class="w-customer">${E(o.customer.name)} <b>${E(o.customer.group)}</b>` +
      `<span>${stamp(o.created)}</span>` +
      `</p>` +
      (server ? assignment(o) : '') +
      `<div class="w-detail-tabs" role="tablist" aria-label="Детали заказа">` +
      `<button role="tab" data-w-tab="info" aria-selected="${state.detailTab === 'info'}">Параметры</button>` +
      `<button role="tab" data-w-tab="chat" aria-selected="${state.detailTab === 'chat'}">Переписка ${(o.messages || []).length ? `<small>${o.messages.length}</small>` : ''}</button>` +
      `</div>` +
      `</div>` +
      `<div class="w-detail-body">${
        state.detailTab === 'chat'
          ? chat(o)
          : `${fileActions(o)}${
              o.kind === 'merch'
                ? server && o.previewKey
                  ? '<div class="w-merch-preview"><img src="/api/files/' +
                    E(o.previewKey) +
                    '" alt="Макет заказа"></div>'
                  : `<div class="w-merch-preview">` +
                    `<img src="/assets/college-shirt.png" alt="Пример модели футболки">${o.params.design === 'classic' ? '<img class="w-merch-logo" src="/assets/college-red.svg" alt="Логотип ОКЭИ">' : '<span>Макет заказчика</span>'}</div>`
                : ''
            }${server && o.printingStartedAt ? '<p class="w-tariff">' + (o.kind === 'merch' ? 'Изготовление начато: ' : 'Печать начата: ') + stamp(o.printingStartedAt) + '</p>' : ''}${server && o.cancelledAt ? '<p class="w-tariff">Отменён: ' + stamp(o.cancelledAt) + '</p>' : ''}${params(o)}${
              o.comment || o.params.comment
                ? `<div class="w-comment">` +
                  `<small>Комментарий</small>` +
                  `<p>${E(o.comment || o.params.comment)}</p>` +
                  `</div>`
                : ''
            }<details class="w-events">` +
            `<summary>История и условия</summary>` +
            `<p class="w-tariff">Демотариф. Цена сохранена при оформлении.</p>${(o.events || [])
              .map(
                (e) =>
                  `<div>` +
                  `<span>${labels[e.status] || E(e.status)}</span>` +
                  `<time>${stamp(e.time)}</time>` +
                  `</div>`,
              )
              .join('')}</details>`
      }</div>${
        state.detailTab === 'info'
          ? `<div class="w-detail-footer">` +
            `<div class="w-total">` +
            `<span>${o.payment === 'paid' ? 'Оплата отмечена' : 'К оплате'}</span>` +
            `<b>${rub(o.total)}</b>` +
            `</div>${actions(o)}</div>`
          : ''
      }`
    );
  }
  function groups() {
    const { rows, total, paid } = summarizeGroups(state.all);
    return (
      `<header class="w-heading">` +
      `<div>` +
      `<span class="w-kicker">УЧЁТ / ОКЭИ</span>` +
      `<h1>Заказы по группам.</h1>` +
      `<p>Состав заказов, суммы и отмеченная оплата.</p>` +
      `</div>` +
      `<button class="w-button w-outline" data-w-export>Скачать CSV ${I('arrow')}</button>` +
      `</header>` +
      `<div class="w-report-totals">` +
      `<div>` +
      `<small>Все заказы без отмен</small>` +
      `<b>${rub(total)}</b>` +
      `</div>` +
      `<div>` +
      `<small>Оплата отмечена</small>` +
      `<b>${rub(paid)}</b>` +
      `</div>` +
      `<div>` +
      `<small>Ожидается оплата</small>` +
      `<b>${rub(total - paid)}</b>` +
      `</div>` +
      `</div>` +
      `<section class="w-report">` +
      `<div class="w-section-title">` +
      `<h2>Учебные группы <small>${rows.length}</small>` +
      `</h2>` +
      `</div>` +
      `<div class="w-table-scroll">` +
      `<table>` +
      `<thead>` +
      `<tr>` +
      `<th>Группа</th>` +
      `<th>Заказы</th>` +
      `<th>Активные</th>` +
      `<th>Выдано</th>` +
      `<th>Сумма</th>` +
      `<th>Оплачено</th>` +
      `</tr>` +
      `</thead>` +
      `<tbody>${rows
        .map(
          (g) =>
            `<tr>` +
            `<th scope="row">` +
            `<button class="w-text" data-w-group="${E(g.name)}">${E(g.name)} ${I('arrow')}</button>` +
            `</th>` +
            `<td>${g.count}</td>` +
            `<td>${g.active}</td>` +
            `<td>${g.issued}</td>` +
            `<td>${rub(g.total)}</td>` +
            `<td>${rub(g.paid)}</td>` +
            `</tr>`,
        )
        .join('')}</tbody>` +
      `</table>` +
      `</div>` +
      `<p class="w-report-note">Группа сохраняется на момент оформления. Отменённые заказы исключены. Показаны локальные данные и примеры.</p>` +
      `</section>`
    );
  }
  function prices() {
    const groups = [...new Set(priceFields.map((f) => f[1]))];
    return (
      '<section class="w-prices"><header class="w-heading"><div><span class="w-kicker">ТИПОГРАФИЯ / ОКЭИ</span><h1>Прайс.</h1><p>Цены для новых заказов. Оформленные заказы сохраняют свою стоимость.</p></div></header>' +
      '<form id="w-prices-form" class="w-personnel-form">' +
      groups
        .map(
          (group) =>
            '<fieldset><legend>' +
            E(group) +
            '</legend><div class="w-personnel-fields">' +
            priceFields
              .filter((f) => f[1] === group)
              .map(
                ([key, , label, unit]) =>
                  '<label><span>' +
                  E(label) +
                  ' <small>' +
                  E(unit) +
                  '</small></span><input name="' +
                  key +
                  '" inputmode="decimal" type="text" required value="' +
                  E(state.priceDraft?.[key] ?? priceText(state.prices.values[key])) +
                  '" aria-label="' +
                  E(group + ' · ' + label) +
                  '"></label>',
              )
              .join('') +
            '</div></fieldset>',
        )
        .join('') +
      '<div class="w-personnel-actions"><button class="w-button w-primary" type="submit">Сохранить</button><button class="w-button w-outline" type="button" data-w-price-cancel>Отменить</button></div></form></section>'
    );
  }
  function personnel() {
    const users = state.personnel || [],
      editor = state.personnelEditor;
    const target = editor?.id ? users.find((u) => u.id === editor.id) : null;
    const lastAdmin =
      target?.active &&
      target.role === 'admin' &&
      users.filter((u) => u.active && u.role === 'admin').length === 1;
    const field = (name, label, type, required = true) =>
      `<label><span>${label}</span><input id="w-personnel-${name}" name="${name}" type="${type}" value="${E(editor[name])}" ${required ? 'required' : ''} ${name === 'password' ? 'minlength="8" maxlength="256" autocomplete="new-password"' : name === 'login' ? 'pattern="[a-zA-Z0-9_.-]{3,30}" minlength="3" maxlength="30" autocomplete="off"' : 'maxlength="80" autocomplete="off"'}></label>`;
    return `<section class="w-personnel" aria-label="Управление сотрудниками">
      <header class="w-heading"><div><span class="w-kicker">ТИПОГРАФИЯ / ОКЭИ</span><h1>Сотрудники.</h1><p>Учётные записи и доступ к работе.</p></div>
        <button id="w-personnel-open" class="w-button w-primary" data-w-personnel-add aria-expanded="${Boolean(editor && !editor.id)}">Добавить сотрудника</button>
      </header>
      ${
        editor
          ? `<form id="${target ? 'w-personnel-' + E(target.id) : 'w-personnel-add'}" class="w-personnel-form" ${target ? 'data-personnel-id="' + E(target.id) + '"' : ''} aria-labelledby="w-personnel-title">
        <h2 id="w-personnel-title">${target ? 'Изменить сотрудника' : 'Новый сотрудник'}</h2>
        ${target ? '<p class="w-personnel-help">' + E(target.login) + ' · ' + (target.role === 'admin' ? 'Администратор' : 'Сотрудник') + '</p>' : ''}
        <div class="w-personnel-fields">${target ? '' : field('login', 'Логин', 'text')}${field('name', 'Имя', 'text')}${field('password', target ? 'Новый пароль' : 'Пароль', 'password', !target)}</div>
        ${target ? '<p class="w-personnel-help">Оставь пароль пустым, чтобы сохранить текущий. После сброса потребуется повторный вход.</p>' : ''}
        ${lastAdmin ? '<p class="w-personnel-help">Единственный активный администратор — отключение недоступно.</p>' : ''}
        <div class="w-personnel-actions"><button class="w-button w-primary" type="submit">${target ? 'Сохранить' : 'Добавить сотрудника'}</button>
          <button class="w-button w-outline" type="button" data-w-personnel-close>Отмена</button>
          ${target ? `<button class="w-button w-outline" type="button" data-w-personnel-toggle="${E(target.id)}" ${lastAdmin ? 'disabled' : ''}>${target.active ? 'Отключить доступ' : 'Включить доступ'}</button>` : ''}
        </div>
      </form>`
          : ''
      }
      <ul class="w-personnel-list" aria-label="Список сотрудников">${users
        .map(
          (u) => `<li class="w-personnel-row">
        <div class="w-personnel-identity"><b>${E(u.name)}</b><span>${E(u.login)}</span></div>
        <span class="w-personnel-role">${u.role === 'admin' ? 'Администратор' : 'Сотрудник'}</span>
        <span class="w-personnel-status">${u.active ? 'Активен' : 'Отключён'}</span>
        <button id="w-personnel-edit-${E(u.id)}" class="w-button w-outline" data-w-personnel-edit="${E(u.id)}" aria-label="Изменить: ${E(u.name)}" aria-expanded="${editor?.id === u.id}">Изменить</button>
      </li>`,
        )
        .join('')}</ul>
    </section>`;
  }
  function render() {
    return (
      `<div class="w-app">${nav()}<div class="w-content">${state.page === 'prices' && server && state.user?.role === 'admin' ? prices() : state.page === 'personnel' && server && state.user?.role === 'admin' ? personnel() : state.page === 'groups' ? groups() : queue()}</div>` +
      `<p class="w-demo-note">Демо-режим · заказы и сообщения доступны только в этом браузере.</p>` +
      `</div>`
    );
  }

  return { render, row, detail };
}
