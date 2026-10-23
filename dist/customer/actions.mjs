import {
  formatMoney as money,
  formatDate as fmt,
  escapeHTML as esc,
  createId as uid,
  plural,
} from '../shared.mjs';
import { blank } from './state.mjs';
import { filteredOrders as selectOrders } from './orders.mjs';
export function bindCustomerActions(
  state,
  { document, studio, repository, session, controller, views },
) {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { persist, getFile } = repository;
  const { captureSession, checkSession, sessionCurrent } = session;
  const {
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
  } = controller;
  const { orderRow } = views;
  const filteredOrders = () => selectOrders(state.orders, state.filter, state.search);
  function updateChoice(name, value) {
    if (state.page === 'merch' && name === 'design') {
      state.demoState.design = value;
      draw();
      return;
    }
    if (['duplex', 'useRange'].includes(name)) value = value === 'true';
    state.draft[name] = value;
    persist();
    draw();
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-c-studio') || b.dataset.cPreset) {
      state.page = 'merch';
      state.merchMode = 'studio';
      draw(true);
      if (b.dataset.cPreset) studio.preset(b.dataset.cPreset);
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
      state.filter = b.dataset.cFilter;
      draw();
      return;
    }
    if (b.dataset.cFilterLink) {
      state.filter = b.dataset.cFilterLink;
      state.page = 'orders';
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
      state.draft.step = target;
      state.uploadError = '';
      persist();
      draw();
      return;
    }
    if (b.hasAttribute('data-c-back')) {
      state.draft.step--;
      persist();
      draw();
      return;
    }
    if (b.hasAttribute('data-c-next')) {
      if (state.draft.step < 3) {
        const result = currentQuote();
        if (result.error) {
          state.uploadError = result.error;
          draw();
          return;
        }
        state.draft.step++;
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
      state.draft = blank();
      persist();
      draw();
      return;
    }
    if (b.dataset.cChoice) {
      updateChoice(b.dataset.cChoice, b.dataset.cValue);
      return;
    }
    if (b.dataset.cCopy) {
      state.draft.copies = Math.max(
        1,
        Math.min(99, Number(state.draft.copies) + Number(b.dataset.cCopy)),
      );
      persist();
      draw();
      return;
    }
    if (b.hasAttribute('data-c-preview-draft')) {
      await openPDF(state.draft.fileKey);
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
      state.detailTab = b.dataset.cDrawerTab;
      const o = state.orders.find((o) => o.id === state.detail);
      if (state.detailTab === 'chat') {
        o.unread = 0;
        persist('orders');
        draw();
      }
      renderDrawer();
      return;
    }
    if (b.dataset.cDesignPreview) {
      await openPDF(state.orders.find((o) => o.id === b.dataset.cDesignPreview).previewKey);
      return;
    }
    if (b.dataset.cOpenFile) {
      await openPDF(state.orders.find((o) => o.id === b.dataset.cOpenFile).fileKey);
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
      const o = state.orders.find((o) => o.id === b.dataset.cConfirmCancel);
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
      const o = state.orders.find((o) => o.id === b.dataset.cRepeat);
      if (o.params.design === 'studio') {
        const operation = captureSession();
        try {
          const file = await getFile(o.designKey);
          checkSession(operation);
          if (!file) throw Error();
          const design = JSON.parse(await file.text());
          checkSession(operation);
          closeDrawer();
          state.page = 'merch';
          state.merchMode = 'studio';
          draw(true);
          await studio.loadDesign(design);
          checkSession(operation);
          notice('Макет скопирован в конструктор.');
        } catch {
          if (sessionCurrent(operation)) notice('Макет недоступен в этом браузере.');
        }
        return;
      }
      if (o.kind === 'document') {
        state.draft = {
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
        state.demoState = { ...state.demoState, ...o.params, count: o.params.copies };
        closeDrawer();
        goto('merch');
      }
      return;
    }
    if (b.dataset.cDemoStatus) {
      const o = state.orders.find((o) => o.id === state.detail);
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
      state.demoState.size = b.dataset.cSize;
      draw();
      return;
    }
    if (b.dataset.cMerchCopy) {
      state.demoState.count = Math.max(
        1,
        Math.min(30, state.demoState.count + Number(b.dataset.cMerchCopy)),
      );
      draw();
      return;
    }
    if (b.hasAttribute('data-c-merch-order')) {
      if (state.demoState.design === 'custom' && !state.demoState.text.trim()) {
        notice('Добавь надпись для принта.');
        $('#c-merch-text').focus();
        return;
      }
      state.pendingMerch = { ...state.demoState };
      modal(
        `<span class="c-kicker">Проверим мерч</span><h2>${state.pendingMerch.design === 'custom' ? 'Твоя футболка.' : 'ОКЭИ / Классика'}</h2><div class="modal-row"><span>Размер / количество</span><strong>${state.pendingMerch.size} / ${state.pendingMerch.count} шт.</strong></div><div class="modal-row"><span>Стоимость примера</span><strong>${money(state.pendingMerch.count * 950)}</strong></div><p style="margin-top:18px">Наличие и итоговую цену подтвердит сотрудник. Это демонстрационный заказ.</p><button class="btn primary" data-c-confirm-merch>Подтвердить заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button>`,
      );
      return;
    }
    if (b.hasAttribute('data-c-confirm-merch')) {
      if (!state.pendingMerch) return;
      const d = state.pendingMerch;
      const o = {
        id: String(Math.max(1045, ...state.orders.map((o) => Number(o.id))) + 1),
        kind: 'merch',
        title: d.design === 'custom' ? 'Футболка «' + d.text + '»' : 'Футболка «ОКЭИ / Классика»',
        total: d.count * 950,
        created: new Date().toISOString(),
        status: 'new',
        params: { ...d, copies: d.count },
        customer: { ...state.profile },
        events: [{ status: 'new', time: new Date().toISOString() }],
        messages: [],
        unread: 0,
      };
      state.orders.unshift(o);
      if (!persist('orders')) return;
      state.pendingMerch = null;
      closeMainModal();
      state.page = 'overview';
      draw(true);
      openSuccess(o);
      return;
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.cSelect) {
      state.draft[el.dataset.cSelect] = el.value;
      if (state.draft.paper === 'photo') {
        state.draft.duplex = false;
        state.draft.color = 'color';
      }
      persist();
      draw();
    }
    if (el.id === 'c-copies') {
      state.draft.copies = Math.max(1, Math.min(99, Math.round(Number(el.value) || 1)));
      el.value = state.draft.copies;
      persist();
      refreshQuote();
    }
    if (el.id === 'c-merch-count') {
      state.demoState.count = Math.max(1, Math.min(30, Math.round(Number(el.value) || 1)));
      draw();
    }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'c-range') {
      state.draft.range = el.value;
      persist();
      refreshQuote();
    }
    if (el.id === 'c-copies') {
      state.draft.copies = Number(el.value);
      persist();
      refreshQuote();
    }
    if (el.id === 'c-comment') {
      state.draft.comment = el.value;
      persist();
    }
    if (el.id === 'c-search') {
      state.search = el.value;
      const list = filteredOrders();
      $('#c-filter-results').innerHTML = list.length
        ? list.map(orderRow).join('')
        : '<div class="c-empty"><h2>Ничего не найдено.</h2><p>Попробуй другой номер или название файла.</p></div>';
    }
    if (el.id === 'c-merch-text') {
      state.demoState.text = el.value;
      $('.c-shirt-print').innerHTML = '<strong>' + esc(el.value || 'ТВОЯ НАДПИСЬ') + '</strong>';
    }
    if (el.id === 'c-merch-color') {
      state.demoState.color = el.value;
      $('.c-shirt-print').style.color = el.value;
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'c-chat-form') {
      e.preventDefault();
      const input = $('#c-message'),
        text = input.value.trim();
      if (!text) return;
      const o = state.orders.find((o) => o.id === state.detail);
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
      state.profile = { name, group };
      if (!persist('profile')) return;
      draw();
      notice('Профиль сохранён.');
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('c-drawer-backdrop')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.detail) closeDrawer();
    if (e.ctrlKey && e.key === 'Enter' && e.target.id === 'c-message') {
      e.preventDefault();
      $('#c-chat-form').requestSubmit();
    }
    if (e.key === 'Tab' && state.detail) {
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
}
