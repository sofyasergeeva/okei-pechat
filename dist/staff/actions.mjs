import {
  fixtureKey,
  resumeConfirmed,
  advanceConfirmed,
  appendStaffMessage,
  issuePaid,
  cancelWithReason,
  canAdvance,
} from './orders.mjs';
export function bindStaffActions(state, { window, document, ui, repository, controller }) {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { load, update, getFile } = repository;
  const {
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
  } = controller;
  const selected = () => state.all.find((o) => o._ref === state.chosen);
  function navigate(d) {
    state.page = d.wPage;
    state.query = '';
    state.kind = 'all';
    state.mobileOpen = false;
    state.confirm = '';
    ui.transition(() => {
      load();
      pickVisible();
      draw();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  function filterQueue(d) {
    state.page = 'queue';
    state.filter = d.wFilter;
    state.confirm = '';
    state.mobileOpen = false;
    ui.transition(() => {
      pickVisible();
      draw();
    });
  }
  function selectOrder(d) {
    open(d.wOrder);
  }
  function selectKind(d) {
    state.kind = d.wKind;
    pickVisible();
    draw();
    $('#w-search')?.focus();
  }
  function showGroup(d) {
    state.page = 'queue';
    state.filter = 'all';
    state.query = d.wGroup;
    state.kind = 'all';
    pickVisible();
    draw();
  }
  function clearFilters() {
    state.query = '';
    state.kind = 'all';
    state.filter = 'active';
    pickVisible();
    draw();
  }
  function refreshQueue() {
    state.confirm = '';
    state.checked.clear();
    load();
    pickVisible();
    draw();
    notify('Очередь обновлена из этого браузера.');
  }
  function downloadReport() {
    exportCSV();
  }
  function closeInspector() {
    close();
  }
  function switchTab(d) {
    state.detailTab = d.wTab;
    state.confirm = '';
    draw();
    ui.enter($('.w-detail-body'));
  }
  async function showFile(o) {
    await openFile(o);
  }
  async function downloadAttachment(b, o) {
    try {
      const preview = b.hasAttribute('data-w-preview'),
        blob = await getFile(preview ? o.previewKey : o.designKey);
      if (!blob) throw Error();
      download(blob, 'okei-' + o.id + (preview ? '-preview.png' : '-design.json'));
      if (preview) notify('Превью для просмотра. Для производства используй исходный макет.');
    } catch {
      notify('Файл недоступен в этом браузере.');
    }
  }
  function dismissConfirmation() {
    state.confirm = '';
    draw();
  }
  function askCancellation() {
    state.confirm = 'cancel';
    draw();
    $('.w-confirm input')?.focus();
  }
  function resumeOrder(o) {
    if (
      o.status === 'attention' &&
      state.checked.has(o._ref) &&
      update(o._ref, (current) => resumeConfirmed(current))
    ) {
      draw();
      notify('Уточнение согласовано. Заказ возвращён в работу.');
    }
  }
  function advanceOrder(d, o) {
    if (o.status === 'ready' && d.wNext === 'issued') {
      state.confirm = 'issue';
      draw();
      $('.w-confirm input')?.focus();
      return;
    }
    if (!canAdvance(o, d.wNext, state.checked.has(o._ref))) return;
    if (update(o._ref, (current) => advanceConfirmed(current, o.status, d.wNext))) {
      state.confirm = '';
      draw();
      notify(d.wNext === 'ready' ? 'Заказ готов к выдаче.' : 'Заказ принят в работу.');
    }
  }
  document.addEventListener('click', async (e) => {
    if (!state.user || !document.body.classList.contains('is-staff')) return;
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.wPage) {
      return navigate(d);
    }
    if (d.wFilter) {
      return filterQueue(d);
    }
    if (d.wOrder) {
      return selectOrder(d);
    }
    if (d.wKind) {
      return selectKind(d);
    }
    if (d.wGroup) {
      return showGroup(d);
    }
    if (b.hasAttribute('data-w-clear')) {
      return clearFilters();
    }
    if (b.hasAttribute('data-w-refresh')) {
      return refreshQueue();
    }
    if (b.hasAttribute('data-w-export')) {
      return downloadReport();
    }
    if (b.hasAttribute('data-w-close')) {
      return closeInspector();
    }
    const o = selected();
    if (!o) return;
    if (d.wTab) {
      return switchTab(d);
    }
    if (b.hasAttribute('data-w-file')) {
      return showFile(o);
    }
    if (b.hasAttribute('data-w-preview') || b.hasAttribute('data-w-design')) {
      return downloadAttachment(b, o);
    }
    if (b.hasAttribute('data-w-dismiss')) {
      return dismissConfirmation();
    }
    if (b.hasAttribute('data-w-cancel')) {
      return askCancellation();
    }
    if (b.hasAttribute('data-w-resume')) {
      return resumeOrder(o);
    }
    if (d.wNext) {
      return advanceOrder(d, o);
    }
  });
  document.addEventListener('change', (e) => {
    if (!state.user || !document.body.classList.contains('is-staff')) return;
    if (e.target.name === 'pause') {
      state.writing.set(state.chosen, {
        text: $('#w-message')?.value || '',
        pause: e.target.checked,
      });
    }
    if (e.target.hasAttribute('data-w-checked')) {
      if (e.target.checked) state.checked.add(state.chosen);
      else state.checked.delete(state.chosen);
      const b = $('[data-w-next],[data-w-resume]');
      if (b) b.disabled = !e.target.checked;
    }
  });
  document.addEventListener('input', (e) => {
    if (state.user && document.body.classList.contains('is-staff') && e.target.id === 'w-message') {
      state.writing.set(state.chosen, {
        text: e.target.value,
        pause: $('#w-chat-form input[name=pause]')?.checked ?? true,
      });
    }
    if (state.user && document.body.classList.contains('is-staff') && e.target.id === 'w-search') {
      state.query = e.target.value;
      refreshResults();
    }
  });
  document.addEventListener('submit', (e) => {
    if (
      !state.user ||
      !document.body.classList.contains('is-staff') ||
      !e.target.id.startsWith('w-')
    )
      return;
    e.preventDefault();
    const o = selected();
    if (!o) return;
    const data = new FormData(e.target);
    if (e.target.id === 'w-chat-form') {
      const text = String(data.get('message') || '').trim();
      if (!text) return;
      if (update(o._ref, (current) => appendStaffMessage(current, text, data.has('pause')))) {
        state.writing.delete(o._ref);
        state.checked.delete(o._ref);
        draw();
        $('#w-message')?.focus();
        notify(
          o._store === fixtureKey
            ? 'Сообщение сохранено в демозаказе.'
            : 'Сообщение сохранено. Заказчик увидит его при входе в этом браузере.',
        );
      }
    } else if (e.target.id === 'w-issue-form' && data.has('paid') && o.status === 'ready') {
      if (update(o._ref, (current) => issuePaid(current))) {
        state.confirm = '';
        draw();
        notify('Выдача и оплата отмечены.');
      }
    } else if (e.target.id === 'w-cancel-form' && ['new', 'work', 'review'].includes(o.status)) {
      const reason = String(data.get('reason') || '').trim();
      if (!reason) return;
      if (update(o._ref, (current) => cancelWithReason(current, reason))) {
        state.confirm = '';
        draw();
        notify('Заказ отменён. Причина сохранена.');
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (
      state.user &&
      document.body.classList.contains('is-staff') &&
      e.target.closest('.w-detail-tabs') &&
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
    ) {
      e.preventDefault();
      state.detailTab =
        e.key === 'Home'
          ? 'info'
          : e.key === 'End'
            ? 'chat'
            : state.detailTab === 'info'
              ? 'chat'
              : 'info';
      state.confirm = '';
      draw();
      $('.w-detail-tabs [aria-selected=true]')?.focus();
      return;
    }
    if (
      !state.user ||
      !state.mobileOpen ||
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
  window.addEventListener(
    'scroll',
    () => {
      if (
        !state.user ||
        !document.body.classList.contains('is-staff') ||
        state.framePending ||
        matchMedia('(max-width:800px)').matches
      )
        return;
      state.framePending = true;
      requestAnimationFrame(() => {
        state.framePending = false;
        syncMobile();
      });
    },
    { passive: true },
  );
  window.addEventListener('resize', () => {
    if (state.user && document.body.classList.contains('is-staff')) syncMobile();
  });
  window.addEventListener('storage', (e) => {
    if (state.user && (e.key === fixtureKey || e.key?.startsWith('okei-customer-v1:'))) {
      state.stale = true;
      const dot = $('.w-refresh-dot');
      if (dot) dot.hidden = false;
      notify('Есть изменения в заказах. Обнови очередь.');
    }
  });
}
