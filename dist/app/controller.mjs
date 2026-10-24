import { createAppViews } from './views.mjs';
import { createPresentation } from './presentation.mjs';
import { createAuthForms } from './forms.mjs';
export function startApp({
  window,
  document,
  storage,
  ui,
  customer,
  staff,
  api,
  initialAccount = null,
}) {
  const state = {
    screen: 'home',
    theme: 'sky',
    account: initialAccount,
    toastTimer: undefined,
    modalTrigger: null,
    ephemeralAccount: null,
    lastFocus: '',
    busy: false,
  };
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const main = $('#main'),
    modal = $('#modal'),
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const views = createAppViews(state, { pdfArtwork: () => $('#pdf').innerHTML });
  const { home, auth } = views;
  const { changeTheme, bindMotion, updateHours, applyInitialTheme } = createPresentation(state, {
    document,
    storage,
    reduced,
  });
  const { bindForm, signal } = createAuthForms(state, {
    document,
    storage,
    reduced,
    go,
    toast,
    api,
  });
  function dashboard() {
    return ['staff', 'admin'].includes(state.account?.role)
      ? staff.render(state.account)
      : customer.render(state.account);
  }
  function renderGo(target) {
    if (state.busy) return;
    if (state.account && (target === 'home' || target === 'account')) {
      target = 'account';
      customer.home();
    }
    if (target === 'account' && !state.account) target = 'login';
    state.screen = target;
    document.body.dataset.screen = state.screen;
    document.body.classList.toggle('is-signedin', !!state.account);
    document.body.classList.toggle('is-staff', ['staff', 'admin'].includes(state.account?.role));
    document.body.classList.remove('focus-login', 'focus-password', 'form-error', 'success-art');
    state.lastFocus = '';
    main.innerHTML =
      state.screen === 'home'
        ? home()
        : state.screen === 'account'
          ? dashboard()
          : auth(state.screen);
    main.className = '';
    void main.offsetWidth;
    main.className = 'enter';
    $$('.screen-options button').forEach((b) =>
      b.classList.toggle('active', b.dataset.go === state.screen),
    );
    $('#accountButton').innerHTML = state.account
      ? `${['staff', 'admin'].includes(state.account.role) ? 'Кабинет' : 'Мой кабинет'} <span><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span>`
      : 'Войти <span><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></span>';
    $('#accountButton').dataset.go = state.account ? 'account' : 'login';
    bindForm();
    bindMotion();
    if (state.screen === 'account' && state.requestedPage) {
      if (state.account.role === 'student') customer.openPage(state.requestedPage);
      state.requestedPage = null;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function go(target) {
    if (state.busy) return;
    ui.transition(() => renderGo(target));
  }
  function toast(text) {
    clearTimeout(state.toastTimer);
    $('#toast').textContent = text;
    $('#toast').classList.add('show');
    state.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4300);
  }
  function openModal(kind) {
    state.modalTrigger = document.activeElement;
    const html =
      api && kind === 'forgot'
        ? '<span class="eyebrow">Восстановление доступа</span><h2>Нужен новый пароль?</h2><p>Сотруднику поможет администратор типографии. Для заказчика восстановление доступа пока недоступно.</p><button class="btn primary" data-close>Понятно ✓</button>'
        : views.modalHTML(kind);
    $('#modalContent').innerHTML = html;
    if ($('h2', modal)) $('h2', modal).id = 'modalTitle';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.modal').focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    state.modalTrigger?.focus();
  }
  function selectTheme(b) {
    changeTheme(b.dataset.themeChoice);
  }
  function navigate(b) {
    $('.hours-details').open = false;
    closeModal();
    go(b.dataset.go);
  }
  function showInformation(b) {
    $('.hours-details').open = false;
    openModal(b.dataset.modal);
  }
  function dismissModal() {
    closeModal();
  }
  function startUpload() {
    openModal('upload');
  }
  async function logout() {
    if (api) {
      try {
        await api.request('/auth/logout', { method: 'POST' });
        api.invalidate();
      } catch (error) {
        toast(error.message);
        return;
      }
    }
    state.account = null;
    staff.reset();
    customer.reset();
    go('login');
    toast(api ? 'Ты вышел из аккаунта.' : 'Ты вышел из тестового аккаунта.');
  }
  function togglePassword(b) {
    const input = $('#' + b.dataset.password);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    b.setAttribute('aria-label', visible ? 'Скрыть пароль' : 'Показать пароль');
    b.setAttribute('aria-pressed', String(visible));
    signal(visible ? 'Пароль виден' : 'Пароль скрыт');
  }
  function fillDemo(b) {
    if (state.screen === 'register') {
      go('login');
    }
    $('#login').value = b.dataset.demo === 'staff' ? 'staff_01' : 'student_23';
    $('#password').value = 'okei2026';
    $('#formError').classList.remove('show');
    signal('Данные заполнены');
    $('#login').focus();
  }
  function acceptDemo(b) {
    b.outerHTML = '<span class="status-pill"><i></i>В работе</span>';
    toast('Статус изменён в дизайн-превью.');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button,a');
    if (!b) return;
    if (b.dataset.themeChoice) {
      return selectTheme(b);
    }
    if (b.dataset.workspace) {
      closeModal();
      state.requestedPage = b.dataset.workspace;
      go(state.account ? 'account' : 'login');
      return;
    }
    if (b.dataset.go) {
      return navigate(b);
    }
    if (b.dataset.modal) {
      return showInformation(b);
    }
    if (b.classList.contains('close') || b.hasAttribute('data-close')) {
      return dismissModal();
    }
    if (b.dataset.action === 'upload') {
      return startUpload();
    }
    if (b.dataset.action === 'logout') {
      return logout();
    }
    if (b.dataset.password) {
      return togglePassword(b);
    }
    if (b.dataset.demo) {
      return fillDemo(b);
    }
    if (b.dataset.accept) {
      return acceptDemo(b);
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
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hours-details')) $('.hours-details').open = false;
  });
  window.entryToast = toast;
  applyInitialTheme();
  updateHours();
  setInterval(updateHours, 60000);
  go('home');
  return { toast };
}
