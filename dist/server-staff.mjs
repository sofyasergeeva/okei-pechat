import { createStaffState, visible, createCSV } from './staff/orders.mjs';
import { createStaffViews } from './staff/views.mjs';
import { downloadBlob } from './shared.mjs';
import { openServerPDF } from './api.mjs';

export function createServerStaff({ api, ui, notify }) {
  const state = createStaffState();
  const $ = (selector) => document.querySelector(selector);
  const views = createStaffViews(state, { ui, pdfArtwork: () => $('#pdf').innerHTML });
  let pending = false;
  const selected = () => state.all.find((o) => o.id === state.chosen);
  function pick() {
    if (!visible(state).some((o) => o.id === state.chosen))
      state.chosen = visible(state)[0]?.id || '';
  }
  async function refresh() {
    const orders = await api.request('/orders');
    state.all = orders.map((o) => ({ ...o, _ref: o.id, _store: 'server' }));
    state.checked.clear();
    pick();
  }
  async function load(user) {
    await refresh();
    state.user = user;
  }
  function syncMobile() {
    const panel = $('.w-inspector');
    if (!panel) return;
    const mobile = matchMedia('(max-width:800px)').matches;
    if (!mobile)
      panel.style.setProperty(
        '--w-room',
        Math.max(400, innerHeight - Math.max(16, panel.getBoundingClientRect().top) - 16) + 'px',
      );
    const open = mobile && state.mobileOpen;
    panel.classList.toggle('is-open', open);
    document.body.classList.toggle('w-panel-open', open);
    if (open) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
    }
  }
  function render() {
    queueMicrotask(syncMobile);
    return views
      .render()
      .replace(
        'Демо-режим · заказы и сообщения доступны только в этом браузере.',
        'Серверный режим · общая очередь PDF-заказов.',
      )
      .replace('Переписка локальная, в этом браузере.', 'Переписка сохраняется на сервере.')
      .replace('Показаны локальные данные и примеры.', 'Показаны серверные PDF-заказы.');
  }
  function draw() {
    if (state.user && document.body.classList.contains('is-staff')) {
      $('#main').innerHTML = render();
      syncMobile();
    }
  }
  async function run(action) {
    if (pending) return;
    pending = true;
    const owner = state.user?.id;
    try {
      await action();
    } catch (error) {
      if (owner === state.user?.id) {
        if (error.status === 409) await refresh().catch(() => {});
        notify(error.message);
      }
    } finally {
      if (owner === state.user?.id) {
        pending = false;
        pick();
        draw();
      }
    }
  }
  async function update(suffix, body) {
    const order = selected();
    await api.request('/orders/' + order.id + suffix, {
      method: suffix === '/status' ? 'PATCH' : 'POST',
      body: { ...body, version: order.version },
    });
    state.confirm = '';
    state.writing.delete(order.id);
    await refresh();
  }
  document.addEventListener('click', (event) => {
    if (!state.user || !document.body.classList.contains('is-staff')) return;
    const button = event.target.closest('button');
    if (!button) return;
    const d = button.dataset;
    if (!Object.keys(d).some((key) => key.startsWith('w'))) return;
    event.preventDefault();
    run(async () => {
      if (d.wPage) {
        state.page = d.wPage;
        state.query = '';
        state.kind = 'all';
        state.mobileOpen = false;
        state.confirm = '';
        await refresh();
        return;
      }
      if (d.wFilter) {
        state.page = 'queue';
        state.filter = d.wFilter;
        state.mobileOpen = false;
        return;
      }
      if (d.wOrder) {
        state.chosen = d.wOrder;
        state.detailTab = 'info';
        state.mobileOpen = true;
        state.confirm = '';
        return;
      }
      if (d.wKind) {
        state.kind = d.wKind;
        return;
      }
      if (d.wGroup) {
        state.page = 'queue';
        state.filter = 'all';
        state.query = d.wGroup;
        state.kind = 'all';
        return;
      }
      if (button.hasAttribute('data-w-clear')) {
        state.query = '';
        state.kind = 'all';
        state.filter = 'active';
        return;
      }
      if (button.hasAttribute('data-w-refresh')) {
        state.confirm = '';
        await refresh();
        notify('Очередь обновлена с сервера.');
        return;
      }
      if (button.hasAttribute('data-w-export')) {
        downloadBlob(
          new Blob([createCSV(state.all).replaceAll('Локальный заказ', 'Серверный заказ')], {
            type: 'text/csv;charset=utf-8',
          }),
          'okei-orders.csv',
          { document, append: true, revokeAfter: 60000 },
        );
        return;
      }
      if (button.hasAttribute('data-w-close')) {
        state.mobileOpen = false;
        state.confirm = '';
        return;
      }
      if (d.wTab) {
        state.detailTab = d.wTab;
        state.confirm = '';
        return;
      }
      if (button.hasAttribute('data-w-file'))
        return openServerPDF(api, '/orders/' + selected().id + '/file');
      if (button.hasAttribute('data-w-dismiss')) {
        state.confirm = '';
        return;
      }
      if (button.hasAttribute('data-w-cancel')) {
        state.confirm = 'cancel';
        return;
      }
      if (button.hasAttribute('data-w-resume'))
        return update('/status', { status: 'work', checked: state.checked.has(state.chosen) });
      if (d.wNext) {
        if (d.wNext === 'issued') {
          state.confirm = 'issue';
          return;
        }
        await update('/status', { status: d.wNext, checked: state.checked.has(state.chosen) });
        notify('Статус сохранён на сервере.');
      }
    });
  });
  document.addEventListener('change', (event) => {
    if (!state.user || !document.body.classList.contains('is-staff')) return;
    if (event.target.hasAttribute('data-w-checked')) {
      if (event.target.checked) state.checked.add(state.chosen);
      else state.checked.delete(state.chosen);
      const button = $('[data-w-next],[data-w-resume]');
      if (button) button.disabled = !event.target.checked;
    }
    if (event.target.name === 'pause')
      state.writing.set(state.chosen, {
        text: $('#w-message')?.value || '',
        pause: event.target.checked,
      });
  });
  document.addEventListener('input', (event) => {
    if (!state.user || !document.body.classList.contains('is-staff')) return;
    if (event.target.id === 'w-message')
      state.writing.set(state.chosen, {
        text: event.target.value,
        pause: $('#w-chat-form input[name=pause]')?.checked ?? true,
      });
    if (event.target.id === 'w-search') {
      state.query = event.target.value;
      pick();
      $('#w-results').innerHTML = visible(state).map(views.row).join('');
      $('#w-result-count').textContent = visible(state).length;
      $('.w-inspector').innerHTML = views.detail();
    }
  });
  document.addEventListener('submit', (event) => {
    if (
      !state.user ||
      !document.body.classList.contains('is-staff') ||
      !event.target.id.startsWith('w-')
    )
      return;
    event.preventDefault();
    const data = new FormData(event.target),
      id = event.target.id;
    run(async () => {
      if (id === 'w-chat-form')
        await update('/messages', {
          text: String(data.get('message') || '').trim(),
          pause: data.has('pause'),
        });
      if (id === 'w-issue-form')
        await update('/status', { status: 'issued', paid: data.has('paid') });
      if (id === 'w-cancel-form')
        await update('/status', {
          status: 'cancelled',
          reason: String(data.get('reason') || '').trim(),
        });
      notify('Изменения сохранены на сервере.');
    });
  });
  document.addEventListener('keydown', (event) => {
    if (!state.user || !document.body.classList.contains('is-staff')) return;
    if (
      event.target.closest('.w-detail-tabs') &&
      ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    ) {
      event.preventDefault();
      state.detailTab =
        event.key === 'Home'
          ? 'info'
          : event.key === 'End'
            ? 'chat'
            : state.detailTab === 'info'
              ? 'chat'
              : 'info';
      draw();
      $('.w-detail-tabs [aria-selected=true]')?.focus();
    }
    if (!state.mobileOpen || !matchMedia('(max-width:800px)').matches) return;
    if (event.key === 'Escape') {
      state.mobileOpen = false;
      draw();
    }
    if (event.key === 'Tab') {
      const items = [
        ...$('.w-inspector').querySelectorAll('button,input,textarea,summary,a[href]'),
      ].filter((el) => !el.disabled && el.getClientRects().length);
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    }
  });
  window.addEventListener('resize', () => {
    if (state.user) syncMobile();
  });
  window.addEventListener(
    'scroll',
    () => {
      if (state.user) syncMobile();
    },
    { passive: true },
  );
  return {
    load,
    render,
    reset() {
      Object.assign(state, createStaffState());
      pending = false;
      document.body.classList.remove('w-panel-open');
    },
  };
}
