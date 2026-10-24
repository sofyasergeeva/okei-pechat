import { formatMoney as money } from '../shared.mjs';
export function createAppViews(state, { pdfArtwork }) {
  const pdf = pdfArtwork;
  const arrow =
    '<span class="button-arrow" aria-hidden="true"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span>';
  const eye =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const lock =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.5" y="8" width="11" height="9" rx="2"/><path d="M7 8V5a3 3 0 0 1 6 0v3"/></svg>';
  function visual() {
    return (
      `<div class="hero-visual">` +
      `<div class="visual-label">` +
      `<i>` +
      `</i>Документы · PDF</div>` +
      `<div class="tilt-space">${pdf()}</div>` +
      `<div class="file-float glass-card">` +
      `<div class="file-icon">PDF</div>` +
      `<div>` +
      `<strong>Курсовая работа.pdf</strong>` +
      `<small>Файл проверен · 24 страницы</small>` +
      `</div>` +
      `<span class="check-bubble">✓</span>` +
      `</div>` +
      `<div class="price-float glass-card">` +
      `<strong>от ${state.prices ? money(state.prices.values.A4_mono_one / 100) : '4 ₽'}</strong>` +
      `<span>за односторонний<br>лист A4</span>` +
      `</div>` +
      `<div class="visual-index">` +
      `<span>A4 / A3</span>` +
      `<br>Цветная и чёрно-белая печать</div>` +
      `</div>`
    );
  }
  function home() {
    return (
      `<section class="hero">` +
      `<div class="hero-copy">` +
      `<span class="eyebrow">Типография ОКЭИ</span>` +
      `<h1>Печать.<br>` +
      `<em>Без лишних</em>` +
      `<br>шагов.</h1>` +
      `<p>Загрузи PDF. Забери готовое в колледже.</p>` +
      `<div class="hero-actions">` +
      `<button class="btn primary" data-action="upload">Загрузить PDF ${arrow}</button>` +
      `<button class="text-button" data-modal="merch">Создать принт ${arrow}</button>` +
      `</div>` +
      `<div class="useful-meta">` +
      `<span>` +
      `<strong>PDF</strong> · сохраним вёрстку</span>` +
      `<span>Статус заказа <strong>всегда рядом</strong>` +
      `</span>` +
      `</div>` +
      `</div>${visual()}</section>` +
      `<section class="home-bottom" aria-label="Возможности типографии">` +
      `<div class="feature-card how-card">` +
      `<h3>От файла до готовой работы</h3>` +
      `<div class="how-steps">` +
      `<span>` +
      `<b>01</b>Загрузи PDF</span>` +
      `<i>→</i>` +
      `<span>` +
      `<b>02</b>Выбери параметры</span>` +
      `<i>→</i>` +
      `<span>` +
      `<b>03</b>Забери заказ</span>` +
      `</div>` +
      `</div>` +
      `<div class="feature-card">` +
      `<span class="mini-icon">▤</span>` +
      `<h3>Стоимость до заказа</h3>` +
      `<p>Формат, цвет и переплёт — цена рассчитывается сразу.</p>` +
      `<button data-modal="prices" aria-label="Посмотреть прайс">` +
      `<svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M5 19 19 5M5 5h14v14"/>` +
      `</svg>` +
      `</button>` +
      `</div>` +
      `<div class="feature-card">` +
      `<span class="mini-icon">⌖</span>` +
      `<h3>Забрать в колледже</h3>` +
      `<p>Чкалова, 11. Приходи, когда статус изменится на «Готов».</p>` +
      `<button data-modal="hours" aria-label="График работы">` +
      `<svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M5 19 19 5M5 5h14v14"/>` +
      `</svg>` +
      `</button>` +
      `</div>` +
      `</section>`
    );
  }
  function field(id, label, placeholder, type = 'text', autocomplete = 'off', required = true) {
    return (
      `<label class="field" for="${id}">` +
      `<span>${label}</span>` +
      `<div class="input-wrap">` +
      `<input id="${id}" name="${id}" aria-label="${label}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" ${required ? 'required' : ''} ${id === 'login' ? 'spellcheck="false" autocapitalize="none"' : ''}>${type === 'password' ? `<button type="button" class="password-toggle" data-password="${id}" aria-label="Показать пароль" aria-pressed="false">${eye}</button>` : ''}</div>` +
      `</label>`
    );
  }
  function auth(mode) {
    const reg = mode === 'register';
    return (
      `<section class="auth-layout">` +
      `<div class="auth-art">` +
      `<h2>${reg ? 'Твои файлы.<br>Твоё пространство.' : 'Всё готово<br>к твоим идеям.'}<small>Печать и мерч — в твоём кабинете.</small>` +
      `</h2>` +
      `<div class="glass-ring">` +
      `</div>` +
      `<div class="tilt-space">${pdf()}</div>` +
      `<div class="scan-beam">` +
      `</div>` +
      `<div class="art-signal glass-card" aria-live="polite">Готов к работе</div>` +
      `<div class="art-bottom">` +
      `<div class="interactive-tip">` +
      `<span class="pulse-ring">` +
      `<svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M5 19 19 5M5 5h14v14"/>` +
      `</svg>` +
      `</span>` +
      `<span>Твой файл<br>в надёжных руках</span>` +
      `</div>` +
      `<span>ОКЭИ / ПЕЧАТЬ</span>` +
      `</div>` +
      `</div>` +
      `<div class="auth-panel ${reg ? 'register' : ''}">` +
      `<button class="auth-back" data-go="home">← На главную</button>` +
      `<div class="auth-tabs" role="tablist" aria-label="Вход или регистрация">` +
      `<button role="tab" aria-selected="${!reg}" class="${!reg ? 'active' : ''}" data-go="login">Вход</button>` +
      `<button role="tab" aria-selected="${reg}" class="${reg ? 'active' : ''}" data-go="register">Регистрация</button>` +
      `</div>` +
      `<h1>${reg ? 'Привет, это ОКЭИ.' : 'С возвращением.'}</h1>` +
      `<p class="auth-lead">${reg ? 'Печать, мерч и статусы заказов.' : 'Твои заказы и готовые макеты.'}</p>` +
      `<form id="authForm" novalidate>${reg ? `<div class="form-row">${field('name', 'Имя', 'Софья', 'text', 'given-name')}${field('group', 'Учебная группа', 'ИСП-23', 'text', 'off')}</div>` : ''}${field('login', 'Логин', reg ? 'Придумай логин' : 'Введи логин', 'text', 'off')}${field('password', 'Пароль', reg ? 'Не менее 8 символов' : 'Введи пароль', 'password', 'off')}${
        reg
          ? '<div class="password-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="meter-label" id="meterLabel">Используй буквы и цифры</p><div style="height:15px"></div>' +
            field('passwordConfirm', 'Подтверди пароль', 'Повтори пароль', 'password', 'off') +
            '<p class="match-hint" id="matchHint" aria-live="polite"></p>'
          : `<div class="form-options">` +
            `<label>` +
            `<input type="checkbox" id="remember">Запомнить логин</label>` +
            `<button type="button" data-modal="forgot">Забыли пароль?</button>` +
            `</div>`
      }<p class="error" id="formError" role="alert">` +
      `</p>` +
      `<button class="btn primary auth-submit" type="submit">${reg ? 'Создать аккаунт' : 'Войти'} ${arrow}</button>` +
      `<p class="role-note">${lock}<span>${reg ? 'Для заказчиков. Сотруднику доступ выдаёт колледж.' : 'Вход для заказчиков и сотрудников.'}</span>` +
      `</p>${reg ? '<p class="terms">Демоаккаунт действует в этой вкладке. Не вводи реальные данные.</p>' : ''}</form>` +
      `<details class="demo-box">` +
      `<summary>Демо-доступ</summary>` +
      `<div class="demo-data">` +
      `<span>Заказчик: <code>student_23</code>` +
      `</span>` +
      `<span>Сотрудник: <code>staff_01</code>` +
      `</span>` +
      `<span>Пароль: <code>okei2026</code>` +
      `</span>` +
      `</div>` +
      `<div class="demo-caption">Это дизайн-превью. Используй только тестовые данные.</div>` +
      `</details>` +
      `</div>` +
      `</section>`
    );
  }
  function modalHTML(kind) {
    let html = '';
    if (kind === 'prices')
      html =
        `<span class="eyebrow">Прайс типографии</span>` +
        `<h2>Понятно, сколько стоит.</h2>` +
        `<p>Тарифы из предоставленного прайса. Итоговую стоимость подтверждает сотрудник.</p>${[
          [
            'A4 · чёрно-белая печать',
            state.prices ? money(state.prices.values.A4_mono_one / 100) : '4 ₽',
          ],
          [
            'A4 · цветная печать',
            state.prices ? money(state.prices.values.A4_color_one / 100) : '25 ₽',
          ],
          [
            'A3 · чёрно-белая печать',
            state.prices ? money(state.prices.values.A3_mono_one / 100) : '10 ₽',
          ],
          [
            'A3 · цветная печать',
            state.prices ? money(state.prices.values.A3_color_one / 100) : '50 ₽',
          ],
          [
            'Брошюровка до 50 листов',
            state.prices ? money(state.prices.values.spiralSmall / 100) : '100 ₽',
          ],
          ['Переплёт диплома', state.prices ? money(state.prices.values.diploma / 100) : '525 ₽'],
        ]
          .map(
            ([l, r]) =>
              `<div class="modal-row">` + `<span>${l}</span>` + `<strong>${r}</strong>` + `</div>`,
          )
          .join(
            '',
          )}<p style="font-size:10px;margin-top:15px">Показаны основные позиции. В полном сайте есть фотопечать, копирование, сканирование и другие виды переплёта.</p>` +
        `<button class="btn primary" data-action="upload">Начать заказ ${arrow}</button>`;
    if (kind === 'hours')
      html =
        '<span class="eyebrow">ОКЭИ · Чкалова, 11</span><h2>Когда можно забрать?</h2><div class="modal-row"><span>Понедельник — четверг</span><strong>09:00 — 17:00</strong></div><div class="modal-row"><span>Пятница</span><strong>09:00 — 16:40</strong></div><div class="modal-row"><span>Обед</span><strong>13:00 — 13:45</strong></div><p style="margin-top:20px">Дождись статуса «Готов», прежде чем идти в типографию. Оплата безналичная.</p>';
    if (kind === 'services')
      html =
        '<span class="eyebrow">Услуги</span><h2>Что будем печатать?</h2><div class="modal-row"><span>Документы</span><strong>A4 / A3</strong></div><div class="modal-row"><span>Фотографии и плакаты</span><strong>Цвет / чёрно-белая</strong></div><div class="modal-row"><span>Брошюровка и переплёт</span><strong>От 100 ₽</strong></div><div class="modal-row"><span>Мерч с твоим дизайном</span><strong>ОКЭИ</strong></div><button class="btn primary" data-action="upload">Загрузить документ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>';
    if (kind === 'merch')
      html =
        '<span class="eyebrow">Мерч ОКЭИ</span><h2>Твой колледж. Твой принт.</h2><div class="merch-image" style="border-radius:16px;height:260px"><img src="/assets/college-shirt.png" alt="Футболка ОКЭИ"><img class="shirt-print" src="/assets/college-red.svg" alt=""></div><p style="margin-top:18px">Выбери готовый вариант или создай свой принт в конструкторе приложения.</p><button class="btn secondary" data-workspace="merch" style="text-decoration:none">Открыть коллекцию <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>';
    if (kind === 'forgot')
      html =
        '<span class="eyebrow">Восстановление доступа</span><h2>Вернёмся в аккаунт.</h2><p>В рабочем сервисе здесь будет запрос восстановления через подтверждённый адрес колледжа. В дизайн-превью письма не отправляются.</p><p>Для тестового входа: <strong>student_23</strong> или <strong>staff_01</strong>, пароль <strong>okei2026</strong>.</p><button class="btn primary" data-close>Понятно ✓</button>';
    if (kind === 'upload')
      html =
        `<span class="eyebrow">Новый заказ</span>` +
        `<h2>${state.account ? 'Следующий шаг — PDF.' : 'Сначала войди.'}</h2>` +
        `<p>${state.account ? 'Загрузи PDF и настрой печать в своём кабинете.' : 'Чтобы файл и статус заказа сохранились в твоём кабинете, нужен аккаунт. Форма входа откроется на следующем экране.'}</p>${state.account ? '<button class="btn primary" data-workspace="print" style="text-decoration:none">Загрузить PDF <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>' : '<button class="btn primary" data-go="login">Войти и продолжить <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><button class="text-button" data-go="register">Создать аккаунт <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>'}`;
    return state.prices && kind === 'services'
      ? html.replace('От 100 ₽', 'От ' + money(state.prices.values.spiralSmall / 100))
      : html;
  }
  return { home, auth, modalHTML };
}
