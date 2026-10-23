const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $('#main'),
  modal = $('#modal'),
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let screen = 'home',
  theme = 'sky',
  account = null,
  toastTimer,
  modalTrigger = null,
  ephemeralAccount = null,
  lastFocus = '',
  busy = false;
const pdf = () => $('#pdf').innerHTML;
const arrow =
  '<span class="button-arrow" aria-hidden="true"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span>';
const eye =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const lock =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.5" y="8" width="11" height="9" rx="2"/><path d="M7 8V5a3 3 0 0 1 6 0v3"/></svg>';
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function visual() {
  return `<div class="hero-visual"><div class="visual-label"><i></i>Документы · PDF</div><div class="tilt-space">${pdf()}</div><div class="file-float glass-card"><div class="file-icon">PDF</div><div><strong>Курсовая работа.pdf</strong><small>Файл проверен · 24 страницы</small></div><span class="check-bubble">✓</span></div><div class="price-float glass-card"><strong>от 4 ₽</strong><span>за односторонний<br>лист A4</span></div><div class="visual-index"><span>A4 / A3</span><br>Цветная и чёрно-белая печать</div></div>`;
}
function home() {
  return `<section class="hero"><div class="hero-copy"><span class="eyebrow">Типография ОКЭИ</span><h1>Печать.<br><em>Без лишних</em><br>шагов.</h1><p>Загрузи PDF. Забери готовое в колледже.</p><div class="hero-actions"><button class="btn primary" data-action="upload">Загрузить PDF ${arrow}</button><button class="text-button" data-modal="merch">Создать принт ${arrow}</button></div><div class="useful-meta"><span><strong>PDF</strong> · сохраним вёрстку</span><span>Статус заказа <strong>всегда рядом</strong></span></div></div>${visual()}</section><section class="home-bottom" aria-label="Возможности типографии"><div class="feature-card how-card"><h3>От файла до готовой работы</h3><div class="how-steps"><span><b>01</b>Загрузи PDF</span><i>→</i><span><b>02</b>Выбери параметры</span><i>→</i><span><b>03</b>Забери заказ</span></div></div><div class="feature-card"><span class="mini-icon">▤</span><h3>Стоимость до заказа</h3><p>Формат, цвет и переплёт — цена рассчитывается сразу.</p><button data-modal="prices" aria-label="Посмотреть прайс"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div><div class="feature-card"><span class="mini-icon">⌖</span><h3>Забрать в колледже</h3><p>Чкалова, 11. Приходи, когда статус изменится на «Готов».</p><button data-modal="hours" aria-label="График работы"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div></section>`;
}
function field(id, label, placeholder, type = 'text', autocomplete = 'off', required = true) {
  return `<label class="field" for="${id}"><span>${label}</span><div class="input-wrap"><input id="${id}" name="${id}" aria-label="${label}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" ${required ? 'required' : ''} ${id === 'login' ? 'spellcheck="false" autocapitalize="none"' : ''}>${type === 'password' ? `<button type="button" class="password-toggle" data-password="${id}" aria-label="Показать пароль" aria-pressed="false">${eye}</button>` : ''}</div></label>`;
}
function auth(mode) {
  const reg = mode === 'register';
  return `<section class="auth-layout"><div class="auth-art"><h2>${reg ? 'Твои файлы.<br>Твоё пространство.' : 'Всё готово<br>к твоим идеям.'}<small>Печать и мерч — в твоём кабинете.</small></h2><div class="glass-ring"></div><div class="tilt-space">${pdf()}</div><div class="scan-beam"></div><div class="art-signal glass-card" aria-live="polite">Готов к работе</div><div class="art-bottom"><div class="interactive-tip"><span class="pulse-ring"><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span><span>Твой файл<br>в надёжных руках</span></div><span>ОКЭИ / ПЕЧАТЬ</span></div></div><div class="auth-panel ${reg ? 'register' : ''}"><button class="auth-back" data-go="home">← На главную</button><div class="auth-tabs" role="tablist" aria-label="Вход или регистрация"><button role="tab" aria-selected="${!reg}" class="${!reg ? 'active' : ''}" data-go="login">Вход</button><button role="tab" aria-selected="${reg}" class="${reg ? 'active' : ''}" data-go="register">Регистрация</button></div><h1>${reg ? 'Привет, это ОКЭИ.' : 'С возвращением.'}</h1><p class="auth-lead">${reg ? 'Печать, мерч и статусы заказов.' : 'Твои заказы и готовые макеты.'}</p><form id="authForm" novalidate>${reg ? `<div class="form-row">${field('name', 'Имя', 'Софья', 'text', 'given-name')}${field('group', 'Учебная группа', 'ИСП-23', 'text', 'off')}</div>` : ''}${field('login', 'Логин', reg ? 'Придумай логин' : 'Введи логин', 'text', 'off')}${field('password', 'Пароль', reg ? 'Не менее 8 символов' : 'Введи пароль', 'password', 'off')}${reg ? '<div class="password-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="meter-label" id="meterLabel">Используй буквы и цифры</p><div style="height:15px"></div>' + field('passwordConfirm', 'Подтверди пароль', 'Повтори пароль', 'password', 'off') + '<p class="match-hint" id="matchHint" aria-live="polite"></p>' : `<div class="form-options"><label><input type="checkbox" id="remember">Запомнить логин</label><button type="button" data-modal="forgot">Забыли пароль?</button></div>`}<p class="error" id="formError" role="alert"></p><button class="btn primary auth-submit" type="submit">${reg ? 'Создать аккаунт' : 'Войти'} ${arrow}</button><p class="role-note">${lock}<span>${reg ? 'Для заказчиков. Сотруднику доступ выдаёт колледж.' : 'Вход для заказчиков и сотрудников.'}</span></p>${reg ? '<p class="terms">Демоаккаунт действует в этой вкладке. Не вводи реальные данные.</p>' : ''}</form><details class="demo-box"><summary>Демо-доступ</summary><div class="demo-data"><span>Заказчик: <code>student_23</code></span><span>Сотрудник: <code>staff_01</code></span><span>Пароль: <code>okei2026</code></span></div><div class="demo-caption">Это дизайн-превью. Используй только тестовые данные.</div></details></div></section>`;
}
function dashboard() {
  return account?.role === 'staff' ? window.Staff.render(account) : window.Customer.render(account);
}
function renderGo(target) {
  if (busy) return;
  if (account && (target === 'home' || target === 'account')) {
    target = 'account';
    window.Customer.home();
  }
  if (target === 'account' && !account) target = 'login';
  screen = target;
  document.body.dataset.screen = screen;
  document.body.classList.toggle('is-signedin', !!account);
  document.body.classList.toggle('is-staff', account?.role === 'staff');
  document.body.classList.remove('focus-login', 'focus-password', 'form-error', 'success-art');
  lastFocus = '';
  main.innerHTML = screen === 'home' ? home() : screen === 'account' ? dashboard() : auth(screen);
  main.className = '';
  void main.offsetWidth;
  main.className = 'enter';
  $$('.screen-options button').forEach((b) =>
    b.classList.toggle('active', b.dataset.go === screen),
  );
  $('#accountButton').innerHTML = account
    ? `${account.role === 'staff' ? 'Кабинет' : 'Мой кабинет'} <span><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span>`
    : 'Войти <span><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span>';
  $('#accountButton').dataset.go = account ? 'account' : 'login';
  bindForm();
  bindMotion();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function go(target) {
  if (busy) return;
  window.OkeiUI.transition(() => renderGo(target));
}
function toast(text) {
  clearTimeout(toastTimer);
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4300);
}
function changeTheme(t) {
  theme = t === 'sky' ? 'sky' : 'glass';
  document.body.dataset.theme = theme;
  try {
    localStorage.setItem('okei-preferred-theme', theme);
  } catch {}
  $$('[data-theme-choice]').forEach((b) => {
    b.classList.toggle('active', b.dataset.themeChoice === theme);
    b.setAttribute('aria-pressed', String(b.dataset.themeChoice === theme));
  });
  $('meta[name=theme-color]').content = theme === 'sky' ? '#ede9e4' : '#1b191b';
}
function signal(text) {
  const el = $('.art-signal');
  if (el) el.textContent = text;
}
function formError(message) {
  $('#formError').textContent = message;
  $('#formError').classList.add('show');
  document.body.classList.remove('form-error');
  void main.offsetWidth;
  document.body.classList.add('form-error');
  signal('Проверим ещё раз');
  setTimeout(() => document.body.classList.remove('form-error'), 600);
}
function bindForm() {
  const form = $('#authForm');
  if (!form) return;
  if (screen === 'login') {
    try {
      const saved = localStorage.getItem('okei-concept-login');
      if (saved) {
        $('#login').value = saved;
        $('#remember').checked = true;
      }
    } catch {}
  }
  form.addEventListener('focusin', (e) => {
    if (e.target.tagName !== 'INPUT') return;
    lastFocus = e.target.id;
    document.body.classList.toggle('focus-password', e.target.id.startsWith('password'));
    document.body.classList.toggle('focus-login', !e.target.id.startsWith('password'));
    signal(
      e.target.id.startsWith('password')
        ? 'Пароль скрыт'
        : e.target.id === 'login'
          ? 'Введи свой логин'
          : 'Знакомимся',
    );
  });
  form.addEventListener('focusout', () =>
    setTimeout(() => {
      if (!form.contains(document.activeElement)) {
        document.body.classList.remove('focus-login', 'focus-password');
        signal('Готов к работе');
      }
    }, 0),
  );
  $('#password').addEventListener('input', (e) => {
    if (screen === 'register') {
      const p = e.target.value;
      const strength =
        Number(p.length >= 8) +
        Number(/[a-zа-я]/i.test(p)) +
        Number(/\d/.test(p)) +
        Number(/[^a-zа-я0-9]/i.test(p));
      $$('.password-meter i').forEach((el, i) =>
        el.classList.toggle('on', p.length > 0 && i < strength),
      );
      $('#meterLabel').textContent =
        p.length < 8
          ? 'Ещё ' + (8 - p.length) + ' символов до минимума'
          : strength < 3
            ? 'Добавь цифры или специальный символ'
            : 'Хороший тестовый пароль';
    }
    $('#formError').classList.remove('show');
  });
  form.addEventListener('input', () => {
    $('#formError').classList.remove('show');
    if (screen === 'register') {
      const p = $('#password').value,
        c = $('#passwordConfirm').value,
        h = $('#matchHint');
      $('#passwordConfirm').removeAttribute('aria-invalid');
      if (!c) {
        h.textContent = '';
        h.className = 'match-hint';
        return;
      }
      const matches = p === c;
      h.textContent = matches ? '✓ Пароли совпадают' : 'Пароли пока не совпадают';
      h.className = 'match-hint ' + (matches ? 'matches' : 'differs');
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const login = $('#login').value.trim(),
      password = $('#password').value;
    if (!login) {
      formError('Введи логин.');
      $('#login').focus();
      return;
    }
    if (!password) {
      formError('Введи пароль.');
      $('#password').focus();
      return;
    }
    if (screen === 'register') {
      const name = $('#name').value.trim(),
        group = $('#group').value.trim();
      if (!name || !group) {
        formError('Укажи имя и учебную группу.');
        return;
      }
      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(login)) {
        formError('Логин: 3–30 латинских букв, цифр, точек, дефисов или _.');
        return;
      }
      if (['student_23', 'staff_01'].includes(login.toLowerCase())) {
        formError('Этот тестовый логин уже занят. Придумай другой.');
        return;
      }
      if (password.length < 8) {
        formError('В пароле должно быть не менее 8 символов.');
        return;
      }
      if (password !== $('#passwordConfirm').value) {
        $('#passwordConfirm').setAttribute('aria-invalid', 'true');
        formError('Пароли не совпадают. Повтори пароль ещё раз.');
        $('#passwordConfirm').focus();
        return;
      }
      busy = true;
      const submit = $('.auth-submit');
      submit.textContent = 'Создаём…';
      signal('Почти готово');
      const digest = await hash(password);
      ephemeralAccount = { login: login.toLowerCase(), digest, name, group, role: 'student' };
      finishAuth(ephemeralAccount, true);
      return;
    }
    try {
      if ($('#remember')?.checked) localStorage.setItem('okei-concept-login', login);
      else localStorage.removeItem('okei-concept-login');
    } catch {}
    let found = null;
    if (password === 'okei2026') {
      if (login.toLowerCase() === 'student_23')
        found = { name: 'Софья', group: 'ИСП-23', role: 'student' };
      if (login.toLowerCase() === 'staff_01') found = { name: 'Сотрудник', role: 'staff' };
    }
    if (
      !found &&
      ephemeralAccount &&
      ephemeralAccount.login === login.toLowerCase() &&
      ephemeralAccount.digest === (await hash(password))
    )
      found = ephemeralAccount;
    if (!found) {
      formError(
        'Логин или пароль не совпали. Для примера используй student_23 или staff_01 и okei2026.',
      );
      return;
    }
    busy = true;
    $('.auth-submit').textContent = 'Входим…';
    signal('Всё верно');
    finishAuth(found, false);
  });
}
async function hash(value) {
  if (crypto.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return value
    .split('')
    .reduce((s, c) => Math.imul(s ^ c.charCodeAt(0), 16777619), 2166136261)
    .toString(16);
}
function finishAuth(found, registered) {
  document.body.classList.add('success-art');
  $('.auth-submit').textContent = 'Готово ✓';
  $('#password').value = '';
  if ($('#passwordConfirm')) $('#passwordConfirm').value = '';
  setTimeout(
    () => {
      busy = false;
      account = {
        id: found.login || $('#login').value.trim().toLowerCase(),
        name: found.name,
        group: found.group,
        role: found.role,
      };
      if (registered) toast('Тестовый аккаунт создан. Он действует только в этой вкладке.');
      go('account');
    },
    reduced ? 0 : 850,
  );
}
function bindMotion() {
  if (reduced) return;
  $$('.hero-visual,.auth-art').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = el.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width - 0.5,
        y = (e.clientY - b.top) / b.height - 0.5;
      const tilt = $('.tilt-space', el);
      if (tilt)
        tilt.style.transform = `rotateX(${-y * 9}deg) rotateY(${x * 13}deg) translate3d(${x * 7}px,${y * 7}px,0)`;
    });
    el.addEventListener('pointerleave', () => {
      const tilt = $('.tilt-space', el);
      if (tilt) tilt.style.transform = '';
    });
  });
}
function openModal(kind) {
  modalTrigger = document.activeElement;
  let html = '';
  if (kind === 'prices')
    html = `<span class="eyebrow">Прайс типографии</span><h2>Понятно, сколько стоит.</h2><p>Тарифы из предоставленного прайса. Итоговую стоимость подтверждает сотрудник.</p>${[
      ['A4 · чёрно-белая печать', '4 ₽'],
      ['A4 · цветная печать', '25 ₽'],
      ['A3 · чёрно-белая печать', '10 ₽'],
      ['A3 · цветная печать', '50 ₽'],
      ['Брошюровка до 50 листов', '100 ₽'],
      ['Переплёт диплома', '525 ₽'],
    ]
      .map(([l, r]) => `<div class="modal-row"><span>${l}</span><strong>${r}</strong></div>`)
      .join(
        '',
      )}<p style="font-size:10px;margin-top:15px">Показаны основные позиции. В полном сайте есть фотопечать, копирование, сканирование и другие виды переплёта.</p><button class="btn primary" data-action="upload">Начать заказ ${arrow}</button>`;
  if (kind === 'hours')
    html =
      '<span class="eyebrow">ОКЭИ · Чкалова, 11</span><h2>Когда можно забрать?</h2><div class="modal-row"><span>Понедельник — четверг</span><strong>09:00 — 17:00</strong></div><div class="modal-row"><span>Пятница</span><strong>09:00 — 16:40</strong></div><div class="modal-row"><span>Обед</span><strong>13:00 — 13:45</strong></div><p style="margin-top:20px">Дождись статуса «Готов», прежде чем идти в типографию. Оплата безналичная.</p>';
  if (kind === 'services')
    html =
      '<span class="eyebrow">Услуги</span><h2>Что будем печатать?</h2><div class="modal-row"><span>Документы</span><strong>A4 / A3</strong></div><div class="modal-row"><span>Фотографии и плакаты</span><strong>Цвет / чёрно-белая</strong></div><div class="modal-row"><span>Брошюровка и переплёт</span><strong>От 100 ₽</strong></div><div class="modal-row"><span>Мерч с твоим дизайном</span><strong>ОКЭИ</strong></div><button class="btn primary" data-action="upload">Загрузить документ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>';
  if (kind === 'merch')
    html =
      '<span class="eyebrow">Мерч ОКЭИ</span><h2>Твой колледж. Твой принт.</h2><div class="merch-image" style="border-radius:16px;height:260px"><img src="/assets/college-shirt.png" alt="Футболка ОКЭИ"><img class="shirt-print" src="/assets/college-red.svg" alt=""></div><p style="margin-top:18px">Здесь показан пример карточки мерча. Полный конструктор остаётся в основном сайте — в этом превью мы сравниваем главную и авторизацию.</p><a class="btn secondary" href="https://printly-college-space.sergeevasofa950.chatgpt.site" target="_blank" rel="noopener" style="text-decoration:none">Открыть основной сайт <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></a>';
  if (kind === 'forgot')
    html =
      '<span class="eyebrow">Восстановление доступа</span><h2>Вернёмся в аккаунт.</h2><p>В рабочем сервисе здесь будет запрос восстановления через подтверждённый адрес колледжа. В дизайн-превью письма не отправляются.</p><p>Для тестового входа: <strong>student_23</strong> или <strong>staff_01</strong>, пароль <strong>okei2026</strong>.</p><button class="btn primary" data-close>Понятно ✓</button>';
  if (kind === 'upload')
    html = `<span class="eyebrow">Новый заказ</span><h2>${account ? 'Следующий шаг — PDF.' : 'Сначала войди.'}</h2><p>${account ? 'Переход к загрузке файла показан как граница этой концепции. Расчёт и полноценная загрузка остаются в основном сайте.' : 'Чтобы файл и статус заказа сохранились в твоём кабинете, нужен аккаунт. Форма входа откроется на следующем экране.'}</p>${account ? '<a class="btn primary" href="https://printly-college-space.sergeevasofa950.chatgpt.site" target="_blank" rel="noopener" style="text-decoration:none">Перейти к полному прототипу <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></a>' : '<button class="btn primary" data-go="login">Войти и продолжить <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><button class="text-button" data-go="register">Создать аккаунт <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>'}`;
  $('#modalContent').innerHTML = html;
  if ($('h2', modal)) $('h2', modal).id = 'modalTitle';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.modal').focus();
}
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  modalTrigger?.focus();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button,a');
  if (!b) return;
  if (b.dataset.themeChoice) {
    changeTheme(b.dataset.themeChoice);
    return;
  }
  if (b.dataset.go) {
    $('.hours-details').open = false;
    closeModal();
    go(b.dataset.go);
    return;
  }
  if (b.dataset.modal) {
    $('.hours-details').open = false;
    openModal(b.dataset.modal);
    return;
  }
  if (b.classList.contains('close') || b.hasAttribute('data-close')) {
    closeModal();
    return;
  }
  if (b.dataset.action === 'upload') {
    openModal('upload');
    return;
  }
  if (b.dataset.action === 'logout') {
    account = null;
    window.Staff.reset();
    window.Customer.reset();
    go('login');
    toast('Ты вышел из тестового аккаунта.');
    return;
  }
  if (b.dataset.password) {
    const input = $('#' + b.dataset.password);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    b.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
    b.setAttribute('aria-pressed', String(visible));
    signal(visible ? 'Пароль виден' : 'Пароль скрыт');
    return;
  }
  if (b.dataset.demo) {
    if (screen === 'register') {
      go('login');
    }
    $('#login').value = b.dataset.demo === 'staff' ? 'staff_01' : 'student_23';
    $('#password').value = 'okei2026';
    $('#formError').classList.remove('show');
    signal('Данные заполнены');
    $('#login').focus();
    return;
  }
  if (b.dataset.accept) {
    b.outerHTML = '<span class="status-pill"><i></i>В работе</span>';
    toast('Статус изменён в дизайн-превью.');
    return;
  }
});
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('.hours-details').open = false;
    if (!modal.hidden) closeModal();
  }
  if (e.key === 'Tab' && !modal.hidden) {
    const items = $$('button,a,input,[tabindex="0"]', modal).filter((x) => !x.disabled);
    if (!items.length) return;
    const first = items[0],
      last = items.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first || document.activeElement === $('.modal'))
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
function updateHours() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Yekaterinburg',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((x) => x.type === t)?.value;
  const day = get('weekday'),
    minutes = Number(get('hour')) * 60 + Number(get('minute')),
    weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(day),
    end = day === 'Fri' ? 1000 : 1020;
  const open = weekday && minutes >= 540 && minutes < end && !(minutes >= 780 && minutes < 825);
  let label = open
    ? 'Открыто · до ' + (day === 'Fri' ? '16:40' : '17:00')
    : weekday && minutes >= 780 && minutes < 825
      ? 'Обед · откроемся в 13:45'
      : weekday && minutes < 540
        ? 'Закрыто · откроемся в 09:00'
        : day === 'Fri' || day === 'Sat' || day === 'Sun'
          ? 'Закрыто · в понедельник с 09:00'
          : 'Закрыто · завтра с 09:00';
  $('#workingStatus').textContent = label;
  $('#dayHours').textContent = weekday
    ? 'Сегодня 09:00 — ' + (day === 'Fri' ? '16:40' : '17:00')
    : 'Пн — Пт · график';
  $('.hours-status').classList.toggle('is-open', open);
}
window.entryToast = toast;
try {
  const saved = localStorage.getItem('okei-preferred-theme');
  theme = saved === 'sky' ? 'sky' : 'glass';
} catch {
  theme = 'glass';
}
changeTheme(theme);
updateHours();
setInterval(updateHours, 60000);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.hours-details')) $('.hours-details').open = false;
});
go('home');
