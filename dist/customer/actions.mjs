import { escapeHTML as esc } from '../shared.mjs';
import { blank, captureSession, checkSession, sessionCurrent } from './state.mjs';
import {
  filteredOrders as selectOrders,
  cancelOrder,
  advanceDemoStatus,
  addCustomerMessage,
  repeatDocument,
  placeCollectionOrder,
} from './orders.mjs';
export function bindCustomerActions(state, { document, studio, repository, controller, views }) {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { persist, getFile } = repository;
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
  function openStudio(button) {
    state.page = 'merch';
    state.merchMode = 'studio';
    draw(true);
    if (button.dataset.cPreset) studio.preset(button.dataset.cPreset);
  }

  function filterOrders(button) {
    state.filter = button.dataset.cFilter;
    draw();
  }
  function showHistory(button) {
    state.filter = button.dataset.cFilterLink;
    state.page = 'orders';
    draw(true);
  }
  function chooseStep(button) {
    const target = Number(button.dataset.cStep);
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
  }
  function previousStep() {
    state.draft.step--;
    persist();
    draw();
  }
  async function nextStep() {
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
  }

  function clearDraft() {
    state.draft = blank();
    persist();
    draw();
  }

  function changeCopies(button) {
    state.draft.copies = Math.max(
      1,
      Math.min(99, Number(state.draft.copies) + Number(button.dataset.cCopy)),
    );
    persist();
    draw();
  }

  function showCreatedOrder(button) {
    closeMainModal();
    openOrder(button.dataset.cSuccessOrder);
  }

  function switchDrawerTab(button) {
    state.detailTab = button.dataset.cDrawerTab;
    const o = state.orders.find((o) => o.id === state.detail);
    if (state.detailTab === 'chat') {
      o.unread = 0;
      persist('orders');
      draw();
    }
    renderDrawer();
  }
  async function previewDesign(button) {
    await openPDF(state.orders.find((o) => o.id === button.dataset.cDesignPreview).previewKey);
  }
  async function showPDF(button) {
    await openPDF(state.orders.find((o) => o.id === button.dataset.cOpenFile).fileKey);
  }
  function askCancellation(button) {
    const id = button.dataset.cCancel;
    closeDrawer();
    modal(views.cancelConfirmation(id));
  }
  function confirmCancellation(button) {
    const o = state.orders.find((o) => o.id === button.dataset.cConfirmCancel);
    if (cancelOrder(o)) {
      if (!persist('orders')) {
        closeMainModal();
        draw();
        return;
      }
    }
    closeMainModal();
    draw();
    notice('Заказ отменён в прототипе.');
  }
  function keepOrder(button) {
    closeMainModal();
    openOrder(button.dataset.cKeep);
  }
  async function repeatOrder(button) {
    const o = state.orders.find((o) => o.id === button.dataset.cRepeat);
    if (o.params.design === 'studio') {
      const operation = captureSession(state);
      try {
        const file = await getFile(o.designKey);
        checkSession(state, operation);
        if (!file) throw Error();
        const design = JSON.parse(await file.text());
        checkSession(state, operation);
        closeDrawer();
        state.page = 'merch';
        state.merchMode = 'studio';
        draw(true);
        await studio.loadDesign(design);
        checkSession(state, operation);
        notice('Макет скопирован в конструктор.');
      } catch {
        if (sessionCurrent(state, operation)) notice('Макет недоступен в этом браузере.');
      }
      return;
    }
    if (o.kind === 'document') {
      state.draft = repeatDocument(o);
      persist();
      closeDrawer();
      goto('print');
      if (!o.fileKey) notice('Загрузи PDF заново: у примера заказа нет файла.');
    } else {
      state.demoState = { ...state.demoState, ...o.params, count: o.params.copies };
      closeDrawer();
      goto('merch');
    }
  }
  function changeDemoStatus() {
    const o = state.orders.find((o) => o.id === state.detail);
    if (advanceDemoStatus(o)) {
      if (!persist('orders')) {
        draw();
        renderDrawer();
        return;
      }
      draw();
      renderDrawer();
      notice('Статус изменён только для демонстрации.');
    } else notice('Этот заказ уже завершён.');
  }
  function chooseSize(button) {
    state.demoState.size = button.dataset.cSize;
    draw();
  }
  function changeMerchCopies(button) {
    state.demoState.count = Math.max(
      1,
      Math.min(30, state.demoState.count + Number(button.dataset.cMerchCopy)),
    );
    draw();
  }
  function askMerchOrder() {
    if (state.demoState.design === 'custom' && !state.demoState.text.trim()) {
      notice('Добавь надпись для принта.');
      $('#c-merch-text').focus();
      return;
    }
    state.pendingMerch = { ...state.demoState };
    modal(views.merchConfirmation(state.pendingMerch));
  }
  function confirmMerchOrder() {
    if (!state.pendingMerch) return;
    const d = state.pendingMerch;
    const o = placeCollectionOrder(state, repository, d);
    if (!o) return;
    state.pendingMerch = null;
    closeMainModal();
    state.page = 'overview';
    draw(true);
    openSuccess(o);
  }
  function changePrintOption(input) {
    state.draft[input.dataset.cSelect] = input.value;
    if (state.draft.paper === 'photo') {
      state.draft.duplex = false;
      state.draft.color = 'color';
    }
    persist();
    draw();
  }
  function commitCopies(input) {
    state.draft.copies = Math.max(1, Math.min(99, Math.round(Number(input.value) || 1)));
    input.value = state.draft.copies;
    persist();
    refreshQuote();
  }
  function commitMerchCount(input) {
    state.demoState.count = Math.max(1, Math.min(30, Math.round(Number(input.value) || 1)));
    draw();
  }
  function editRange(input) {
    state.draft.range = input.value;
    persist();
    refreshQuote();
  }
  function editCopies(input) {
    state.draft.copies = Number(input.value);
    persist();
    refreshQuote();
  }
  function editComment(input) {
    state.draft.comment = input.value;
    persist();
  }
  function searchOrders(input) {
    state.search = input.value;
    const list = filteredOrders();
    $('#c-filter-results').innerHTML = list.length
      ? list.map(orderRow).join('')
      : '<div class="c-empty"><h2>Ничего не найдено.</h2><p>Попробуй другой номер или название файла.</p></div>';
  }
  function editMerchText(input) {
    state.demoState.text = input.value;
    $('.c-shirt-print').innerHTML = '<strong>' + esc(input.value || 'ТВОЯ НАДПИСЬ') + '</strong>';
  }
  function editMerchColor(input) {
    state.demoState.color = input.value;
    $('.c-shirt-print').style.color = input.value;
  }
  function sendMessage(event) {
    event.preventDefault();
    const input = $('#c-message'),
      text = input.value.trim();
    if (!text) return;
    const o = state.orders.find((o) => o.id === state.detail);
    addCustomerMessage(o, text);
    if (!persist('orders')) return;
    draw();
    renderDrawer();
    $('#c-message').focus();
    notice('Сообщение сохранено локально. Реальная доставка не подключена.');
  }
  function saveProfile(event) {
    event.preventDefault();
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
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-c-studio') || button.dataset.cPreset) return openStudio(button);
    if (button.dataset.cPage) return goto(button.dataset.cPage);
    if (button.dataset.cOrder) return openOrder(button.dataset.cOrder, button.dataset.cTab);
    if (button.dataset.cFilter) return filterOrders(button);
    if (button.dataset.cFilterLink) return showHistory(button);
    if (button.dataset.cStep) return chooseStep(button);
    if (button.hasAttribute('data-c-back')) return previousStep();
    if (button.hasAttribute('data-c-next')) return nextStep();
    if (button.hasAttribute('data-c-upload')) return $('#c-file-input').click();
    if (button.hasAttribute('data-c-sample')) return sample();
    if (button.hasAttribute('data-c-clear-draft')) return clearDraft();
    if (button.dataset.cChoice) return updateChoice(button.dataset.cChoice, button.dataset.cValue);
    if (button.dataset.cCopy) return changeCopies(button);
    if (button.hasAttribute('data-c-preview-draft')) return openPDF(state.draft.fileKey);
    if (button.dataset.cSuccessOrder) return showCreatedOrder(button);
    if (button.hasAttribute('data-c-close')) return closeDrawer();
    if (button.dataset.cDrawerTab) return switchDrawerTab(button);
    if (button.dataset.cDesignPreview) return previewDesign(button);
    if (button.dataset.cOpenFile) return showPDF(button);
    if (button.dataset.cCancel) return askCancellation(button);
    if (button.dataset.cConfirmCancel) return confirmCancellation(button);
    if (button.dataset.cKeep) return keepOrder(button);
    if (button.dataset.cRepeat) return repeatOrder(button);
    if (button.dataset.cDemoStatus) return changeDemoStatus();
    if (button.dataset.cSize) return chooseSize(button);
    if (button.dataset.cMerchCopy) return changeMerchCopies(button);
    if (button.hasAttribute('data-c-merch-order')) return askMerchOrder();
    if (button.hasAttribute('data-c-confirm-merch')) return confirmMerchOrder();
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input.dataset.cSelect) changePrintOption(input);
    if (input.id === 'c-copies') commitCopies(input);
    if (input.id === 'c-merch-count') commitMerchCount(input);
  });
  document.addEventListener('input', (event) => {
    const input = event.target;
    if (input.id === 'c-range') editRange(input);
    if (input.id === 'c-copies') editCopies(input);
    if (input.id === 'c-comment') editComment(input);
    if (input.id === 'c-search') searchOrders(input);
    if (input.id === 'c-merch-text') editMerchText(input);
    if (input.id === 'c-merch-color') editMerchColor(input);
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'c-chat-form') sendMessage(event);
    if (event.target.id === 'c-profile-form') saveProfile(event);
  });
  document.addEventListener('click', (event) => {
    if (event.target.classList.contains('c-drawer-backdrop')) closeDrawer();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.detail) closeDrawer();
    if (event.ctrlKey && event.key === 'Enter' && event.target.id === 'c-message') {
      event.preventDefault();
      $('#c-chat-form').requestSubmit();
    }
    if (event.key === 'Tab' && state.detail) {
      const items = $$('button,input,textarea,summary,[tabindex="0"]', $('#c-order-layer')).filter(
          (x) => !x.disabled && x.getClientRects().length,
        ),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}
