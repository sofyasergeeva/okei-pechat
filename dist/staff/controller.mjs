import { downloadBlob } from '../shared.mjs';
import { createStaffState, visible as selectVisible, createCSV } from './orders.mjs';
import { createStaffStorage } from './storage.mjs';
import { createStaffViews } from './views.mjs';
import { bindStaffActions } from './actions.mjs';
export function createStaff({ window, document, storage, indexedDB, ui }) {
  const state = createStaffState();
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const entryTitle = document.title;
  const repository = createStaffStorage(state, { storage, indexedDB, notify, onConflict: draw });
  const { load, getFile } = repository;
  const views = createStaffViews(state, { ui, pdfArtwork: () => $('#pdf').innerHTML });
  const { row, detail } = views;
  const visible = () => selectVisible(state);
  function notify(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => el.classList.remove('show'), 3800);
  }
  function init(u) {
    if (state.user) return;
    state.user = u;
    load();
    state.chosen = visible()[0]?._ref || '';
  }
  function render(u) {
    init(u);
    queueMicrotask(() => {
      if (document.body.classList.contains('is-staff')) syncMobile();
    });
    document.title = 'ОКЭИ Печать — кабинет сотрудника';
    return views.render();
  }
  function pickVisible() {
    if (state.page === 'groups') return;
    const list = visible();
    if (!list.some((o) => o._ref === state.chosen)) {
      state.chosen = list[0]?._ref || '';
      state.detailTab = 'info';
      state.confirm = '';
    }
  }
  function draw() {
    if (!state.user || !document.body.classList.contains('is-staff')) return;
    $('#main').innerHTML = render(state.user);
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
    const open = state.mobileOpen && matchMedia('(max-width:800px)').matches;
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
    state.originFocus = document.activeElement;
    state.chosen = ref;
    state.detailTab = chatTab ? 'chat' : 'info';
    state.confirm = '';
    state.mobileOpen = true;
    draw();
    if (matchMedia('(max-width:800px)').matches) $('.w-close')?.focus();
    else ui.enter($('.w-detail-body'));
  }
  function close() {
    state.mobileOpen = false;
    state.confirm = '';
    draw();
    const b = $$('[data-w-order]').find((b) => b.dataset.wOrder === state.chosen);
    b?.focus();
  }
  function refreshResults() {
    const list = visible();
    if (!list.some((o) => o._ref === state.chosen)) {
      state.chosen = list[0]?._ref || '';
      state.detailTab = 'info';
      state.confirm = '';
      $('.w-inspector').innerHTML = detail();
    }
    $('#w-results').innerHTML = list.length
      ? list.map(row).join('')
      : '<div class="w-empty"><h3>Ничего не найдено.</h3><p>Попробуй другой номер или группу.</p></div>';
    $('#w-result-count').textContent = list.length;
  }
  function download(blob, name) {
    downloadBlob(blob, name, { document, append: true, revokeAfter: 60000 });
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
    download(
      new Blob([createCSV(state.all)], {
        type: 'text/csv;charset=utf-8',
      }),
      'okei-orders.csv',
    );
    notify('CSV содержит локальные заказы и демопримеры.');
  }
  bindStaffActions(state, {
    window,
    document,
    ui,
    repository,
    controller: {
      notify,
      pickVisible,
      draw,
      open,
      close,
      refreshResults,
      download,
      openFile,
      exportCSV,
      syncMobile,
    },
  });
  return {
    render,
    reset() {
      document.title = entryTitle;
      state.user = null;
      state.mobileOpen = false;
      state.chosen = '';
      state.page = 'queue';
      state.filter = 'active';
      state.query = '';
      state.kind = 'all';
      state.confirm = '';
      state.checked.clear();
      state.writing.clear();
      state.stale = false;
      document.body.classList.remove('w-panel-open');
    },
  };
}
