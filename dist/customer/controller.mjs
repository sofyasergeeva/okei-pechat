import { escapeHTML as esc, createId as uid, plural } from '../shared.mjs';
import {
  blank,
  createCustomerState,
  captureSession as capture,
  sessionCurrent as isCurrent,
  checkSession as check,
} from './state.mjs';
import { createCustomerStorage } from './storage.mjs';
import {
  sampleOrders,
  activeOrders,
  calculateQuote,
  placeDocumentOrder,
  placeStudioOrder,
} from './orders.mjs';
import { createCustomerViews } from './views.mjs';
import { bindCustomerActions } from './actions.mjs';
export function createCustomer({
  window,
  document,
  storage,
  indexedDB,
  orderMath,
  ui,
  studio,
  notify,
  enabled = () => true,
}) {
  const state = createCustomerState();
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const captureSession = () => capture(state),
    sessionCurrent = (operation) => isCurrent(state, operation),
    checkSession = (operation) => check(state, operation);
  const repository = createCustomerStorage(state, { storage, indexedDB, notice });
  const { read, persist, rememberOrders, putFile, getFile } = repository;
  const views = createCustomerViews(state, {
    orderMath,
    ui,
    studio,
    pdfArtwork: () => $('#pdf').innerHTML,
  });
  const { quoteHTML } = views;
  const active = () => activeOrders(state.orders);
  const currentQuote = () => calculateQuote(state.draft, orderMath);
  function render(u) {
    init(u);
    return views.render();
  }
  function init(u) {
    const newKey = 'okei-customer-v1:' + u.id;
    if (state.key === newKey) return;
    state.sessionId++;
    state.user = u;
    state.key = newKey;
    const saved = read(state.key, null);
    state.profile = saved?.profile || { name: u.name, group: u.group || 'ИСП-23' };
    state.orders = saved?.orders || (u.id === 'student_23' ? sampleOrders() : []);
    rememberOrders();
    state.draft = saved?.draft || blank();
    state.page = 'overview';
    state.loading = false;
    state.uploadError = '';
    state.pendingMerch = null;
    persist();
  }
  function draw(scroll = false) {
    if (!enabled() || !state.user || document.body.dataset.screen !== 'account') return;
    $('#main').innerHTML = render(state.user);
    $('#main').className = 'c-page-enter';
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
    bindUpload();
    if (scroll) ui.enter($('.c-content'));
  }
  function goto(p) {
    ui.transition(() => {
      if (p === 'merch') state.merchMode = 'collection';
      state.page = p;
      state.uploadError = '';
      draw(true);
    });
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
  async function upload(file) {
    if (!file || state.loading) return;
    const operation = captureSession();
    if (file.size > 25 * 1024 * 1024) {
      state.uploadError = 'Выбери PDF до 25 МБ.';
      draw();
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      state.uploadError = 'Нужен PDF. Сохрани документ в PDF и попробуй снова.';
      draw();
      return;
    }
    state.loading = true;
    state.uploadError = '';
    draw();
    let loadingTask;
    try {
      const pdfjs = await import('/assets/pdf.mjs');
      checkSession(operation);
      pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.mjs';
      const data = await file.arrayBuffer();
      checkSession(operation);
      loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;
      checkSession(operation);
      const pages = pdf.numPages;
      await loadingTask.destroy();
      loadingTask = null;
      checkSession(operation);
      if (pages > 2000) throw Error('Для прототипа выбери документ до 2000 страниц.');
      const k = 'pdf-' + uid();
      await putFile(k, file);
      checkSession(operation);
      state.draft = {
        ...state.draft,
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
        state.uploadError = e.message?.startsWith('Для прототипа')
          ? e.message
          : 'Не удалось прочитать PDF. Проверь файл и сними пароль, если он установлен.';
      }
    } finally {
      if (loadingTask) await loadingTask.destroy().catch(() => {});
      if (sessionCurrent(operation)) {
        state.loading = false;
        draw();
      }
    }
  }
  function bindUpload() {
    if (state.page === 'merch' && state.merchMode === 'studio') studio.mount(state.user.id);
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
    if (state.loading) return;
    const operation = captureSession();
    const submittedDraft = { ...state.draft };
    const { q, selected, error } = currentQuote();
    if (error) {
      state.uploadError = error;
      draw();
      return;
    }
    if (!state.profile.name.trim() || !state.profile.group.trim()) {
      notice('Укажи имя и группу в профиле.');
      goto('profile');
      return;
    }
    state.loading = true;
    draw();
    try {
      const o = await placeDocumentOrder(state, repository, operation, submittedDraft, q, selected);
      if (!o) {
        state.loading = false;
        draw();
        return;
      }
      state.loading = false;
      state.page = 'overview';
      draw(true);
      openSuccess(o);
    } catch (e) {
      if (sessionCurrent(operation)) {
        state.loading = false;
        state.uploadError = e.message;
        draw();
      }
    }
  }
  function modal(html) {
    const m = $('#modal');
    state.drawerFocus = document.activeElement;
    $('#modalContent').innerHTML = html;
    const title = $('h2', m);
    if (title) title.id = 'modalTitle';
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.modal').focus();
  }
  function openSuccess(o) {
    modal(views.successHTML(o));
  }
  function closeMainModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
  }
  function openOrder(id, tab = 'info') {
    const o = state.orders.find((o) => o.id === id);
    if (!o) return;
    state.detail = id;
    state.detailTab = tab;
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
    state.drawerFocus = document.activeElement;
    renderDrawer();
    document.body.style.overflow = 'hidden';
    $('#c-close-order').focus();
  }
  function renderDrawer() {
    const o = state.orders.find((o) => o.id === state.detail);
    if (!o) return;
    $('#c-order-layer').innerHTML = views.orderDrawer(o);
    if (state.detailTab === 'chat') {
      const log = $('#c-chat-log');
      if (log) log.scrollTop = log.scrollHeight;
    }
  }
  function closeDrawer() {
    $('#c-order-layer')?.remove();
    state.detail = null;
    document.body.style.overflow = '';
    state.drawerFocus?.focus?.();
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
  function notice(s) {
    if (notify) notify(s);
    else {
      const el = $('#toast');
      el.textContent = s;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 4500);
    }
  }
  bindCustomerActions(state, {
    document,
    enabled,
    studio,
    repository,
    views,
    controller: {
      goto,
      draw,
      currentQuote,
      submit,
      sample,
      openPDF,
      closeMainModal,
      openOrder,
      renderDrawer,
      closeDrawer,
      modal,
      notice,
      refreshQuote,
      openSuccess,
    },
  });
  return {
    async createStudioOrder(design, preview) {
      const o = await placeStudioOrder(state, repository, design, preview);
      state.page = 'overview';
      draw(true);
      openSuccess(o);
      return o.id;
    },
    render,
    openPage(page) {
      state.page = page;
      state.merchMode = 'collection';
      draw();
    },
    home() {
      state.page = 'overview';
    },
    reset() {
      state.sessionId++;
      state.user = null;
      state.key = '';
      state.loading = false;
      state.pendingMerch = null;
      closeDrawer();
    },
    activeCount() {
      return active().length;
    },
  };
}
