import { blank, createCustomerState } from './customer/state.mjs';
import { calculateDocumentsQuote, filteredOrders } from './customer/orders.mjs';
import { createCustomerViews } from './customer/views.mjs';
import { openServerPDF, createOrderPolling, patchOrderRegions } from './api.mjs';
import { plural } from './shared.mjs';

// Server PDF and merch orders reuse the existing templates and constructor.
export function createServerCustomer({ api, ui, studio, notify }) {
  const state = createCustomerState();
  const $ = (selector, root = document) => root.querySelector(selector);
  const views = createCustomerViews(state, {
    orderMath: globalThis.OrderMath,
    server: true,
    ui,
    studio,
    pdfArtwork: () => $('#pdf').innerHTML,
  });
  const messageDrafts = new Map();
  let uploadMode = 'all';
  function syncFiles(files) {
    state.draft.files = files;
    state.draft.fileKey = files[0]?.id || '';
    state.draft.fileName =
      files.length > 1 ? files[0].name + ' и ещё ' + (files.length - 1) : files[0]?.name || '';
    state.draft.pages = files.reduce((sum, file) => sum + file.pages, 0);
    state.draft.fileSize = files.reduce((sum, file) => sum + file.size, 0);
    if (!files.length) state.draft.step = 1;
  }
  function chooseFiles(mode) {
    uploadMode = mode;
    const input = $('#c-file-input');
    input.multiple = mode === 'all' || mode === 'append';
    input.click();
  }
  let pending = false;
  const current = () => state.user?.id;
  const quote = () => calculateDocumentsQuote(state.draft, globalThis.OrderMath);
  function saveDraft() {
    try {
      localStorage.setItem('okei-api-draft-v1:' + current(), JSON.stringify(state.draft));
    } catch {
      notify('Не удалось сохранить черновик в браузере.');
    }
  }
  async function load(user) {
    const orders = await api.request('/orders');
    state.sessionId++;
    state.user = user;
    state.profile = { name: user.name, group: user.group };
    state.orders = orders;
    state.draft = blank();
    try {
      const saved = JSON.parse(localStorage.getItem('okei-api-draft-v1:' + user.id));
      if (saved) state.draft = { ...blank(), ...saved };
    } catch {}
    if (state.draft.fileKey && !state.draft.files)
      state.draft.files = [
        {
          id: state.draft.fileKey,
          name: state.draft.fileName,
          pages: state.draft.pages,
          size: state.draft.fileSize,
        },
      ];
    state.page = 'overview';
    polling.start();
  }
  function serverText(html) {
    return html
      .replaceAll(
        'Демо: заказы и сообщения сохраняются только в этом браузере.',
        'Серверный режим · заказы и сообщения сохраняются на сервере.',
      )
      .replaceAll(
        'Заказ появится в локальном кабинете. Реальная отправка в колледж в этом прототипе пока не подключена.',
        'PDF-заказ будет сохранён на сервере и доступен сотруднику.',
      )
      .replaceAll(
        'Демонстрация. Сообщения хранятся локально и не доставляются сотруднику.',
        'Сообщения сохраняются на сервере и доступны участникам заказа.',
      )
      .replaceAll(' · сохранено локально', ' · сохранено на сервере')
      .replaceAll('Твой ответ сохранён в прототипе.', 'Твой ответ сохранён на сервере.')
      .replaceAll('Сохранить сообщение в демопереписке', 'Сохранить сообщение');
  }
  function render() {
    return serverText(views.render());
  }
  function drawer() {
    const order = state.orders.find((o) => o.id === state.detail);
    if (!order) return;
    let layer = $('#c-order-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'c-order-layer';
      document.body.append(layer);
    }
    layer.innerHTML = serverText(views.orderDrawer(order));
    $('.c-demo-tools', layer)?.remove();
    document.body.style.overflow = 'hidden';
    if (state.detailTab === 'chat') {
      const log = $('#c-chat-log');
      log.scrollTop = log.scrollHeight;
      $('#c-message').value = messageDrafts.get(state.detail) || '';
    }
  }
  function draw() {
    if (!current() || document.body.dataset.screen !== 'account') return;
    $('#main').innerHTML = render();
    if (state.page === 'merch' && state.merchMode === 'studio')
      studio.mount('server-merch:' + current());
    $('#c-file-input')?.addEventListener('change', (e) =>
      run(() => upload([...e.target.files], uploadMode)),
    );
    const drop = $('#c-drop');
    drop?.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop?.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop?.addEventListener('drop', (e) => {
      e.preventDefault();
      run(() => upload([...e.dataTransfer.files]));
    });
    if (state.detail) drawer();
  }
  const polling = createOrderPolling({
    document,
    active: () => Boolean(current()) && !pending,
    onExpired: () => notify('Сессия завершена. Войди снова.'),
    update: async () => {
      const session = state.sessionId,
        orders = await api.request('/orders');
      if (
        !current() ||
        session !== state.sessionId ||
        pending ||
        document.hidden ||
        JSON.stringify(orders) === JSON.stringify(state.orders)
      )
        return;
      state.orders = orders;
      if (document.body.dataset.screen !== 'account') return;
      const next = document.createElement('div');
      next.innerHTML = render();
      const regions = ['.c-nav', '.c-top'];
      if (state.page === 'overview') regions.push('.c-content');
      if (state.page === 'orders') regions.push('#c-filter-results');
      patchOrderRegions(next, regions);
      if (state.detail) {
        const order = orders.find((o) => o.id === state.detail);
        if (order) {
          const layer = document.createElement('div');
          layer.innerHTML = serverText(views.orderDrawer(order));
          layer.querySelector('.c-demo-tools')?.remove();
          patchOrderRegions(layer, [
            '.c-drawer-status',
            '.c-drawer-tabs',
            state.detailTab === 'chat' ? '.c-chat-log' : '.c-drawer-body',
          ]);
        }
      }
    },
  });
  async function refresh() {
    const orders = await api.request('/orders');
    state.orders = orders;
    draw();
  }
  async function run(action) {
    if (pending) return;
    pending = true;
    const owner = current();
    try {
      await action();
    } catch (error) {
      if (current() === owner) {
        state.uploadError = error.message;
        if (error.status === 409) {
          await refresh().catch(() => {});
          if ($('[data-c-confirm-cancel]')) closeModal();
        }
        notify(error.message);
        draw();
      }
    } finally {
      if (current() === owner) {
        pending = false;
        state.loading = false;
        draw();
      }
    }
  }
  async function upload(files, mode = 'all') {
    if (!files.length) return;
    const existing = state.draft.files || [];
    const retained =
      mode === 'all'
        ? []
        : mode === 'append'
          ? existing
          : existing.filter((file) => file.id !== mode);
    if (retained.length + files.length > 10) throw Error('Можно добавить до 10 PDF.');
    if (files.some((file) => file.size > 25 * 1024 * 1024)) throw Error('Каждый PDF — до 25 МБ.');
    if ([...retained, ...files].reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024)
      throw Error('Общий размер PDF — до 50 МБ.');
    state.loading = true;
    state.uploadError = '';
    draw();
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    const saved = await api.request('/files', { method: 'POST', body });
    const attachments =
      mode === 'all'
        ? saved.files
        : mode === 'append'
          ? [...existing, ...saved.files]
          : existing.flatMap((file) => (file.id === mode ? saved.files : [file]));
    syncFiles(attachments);
    Object.assign(state.draft, { range: '', useRange: false, step: 2 });
    saveDraft();
    uploadMode = 'all';
    notify('PDF проверены · ' + state.draft.pages + ' стр.');
  }
  async function sample() {
    const owner = current();
    const response = await fetch('/assets/sample.pdf');
    if (!response.ok) throw Error('Пример не загрузился.');
    const blob = await response.blob();
    if (owner !== current()) throw Error('Сессия изменилась.');
    await upload([new File([blob], 'Пример печати.pdf', { type: 'application/pdf' })]);
  }
  function modal(html) {
    $('#modalContent').innerHTML = html;
    const title = $('#modalContent h2');
    if (title) title.id = 'modalTitle';
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('.modal').focus();
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
  }
  function closeDrawer() {
    $('#c-order-layer')?.remove();
    state.detail = null;
    document.body.style.overflow = '';
    state.drawerFocus?.focus?.();
  }
  async function open(id, tab = 'info') {
    await refresh();
    state.drawerFocus = document.activeElement;
    state.detail = id;
    state.detailTab = tab;
    if (tab === 'chat') {
      await api.request('/orders/' + id + '/read', { method: 'POST' });
      const order = state.orders.find((o) => o.id === id);
      if (order) order.unread = 0;
    }
    drawer();
    $('#c-close-order')?.focus();
  }
  async function change(id, suffix, body) {
    const order = state.orders.find((o) => o.id === id);
    const saved = await api.request('/orders/' + id + suffix, {
      method: suffix === '/status' ? 'PATCH' : 'POST',
      body: { ...body, version: order.version },
    });
    state.orders = state.orders.map((o) => (o.id === id ? saved : o));
  }
  function success(order) {
    modal(
      views
        .successHTML(order)
        .replace('Заказ оформлен в прототипе', 'Заказ сохранён на сервере')
        .replace(
          'Это локальный пример: данные в реальную типографию не отправлены.',
          'Заказ доступен сотруднику в серверном кабинете.',
        ),
    );
  }
  async function submit() {
    const result = quote();
    if (result.error) throw Error(result.error);
    state.loading = true;
    state.uploadError = '';
    draw();
    const order = await api.request('/orders', {
      method: 'POST',
      body: {
        fileKeys: (state.draft.files || [{ id: state.draft.fileKey }]).map((file) => file.id),
        params: { ...state.draft },
      },
    });
    state.orders.unshift(order);
    state.draft = blank();
    saveDraft();
    state.page = 'overview';
    success(order);
  }
  async function click(button) {
    const d = button.dataset;
    if (button.hasAttribute('data-c-studio') || d.cPreset) {
      state.page = 'merch';
      state.merchMode = 'studio';
      if (d.cPreset) studio.preset(d.cPreset);
      return;
    }
    if (d.cPage) {
      if (d.cPage === 'merch') state.merchMode = 'collection';
      state.page = d.cPage;
      state.uploadError = '';
      await refresh();
      return;
    }
    if (d.cRemoveFile) {
      syncFiles(state.draft.files.filter((file) => file.id !== d.cRemoveFile));
      saveDraft();
      return;
    }
    if (d.cFileId) return openServerPDF(api, '/orders/' + state.detail + '/files/' + d.cFileId);
    if (d.cOrder) return open(d.cOrder, d.cTab);
    if (d.cFilter) {
      state.filter = d.cFilter;
      return;
    }
    if (d.cFilterLink) {
      state.filter = d.cFilterLink;
      state.page = 'orders';
      return refresh();
    }
    if (d.cStep) {
      if (Number(d.cStep) === 3 && quote().error) throw Error(quote().error);
      state.draft.step = Number(d.cStep);
      saveDraft();
      return;
    }
    if (button.hasAttribute('data-c-back')) {
      state.draft.step--;
      saveDraft();
      return;
    }
    if (button.hasAttribute('data-c-next')) {
      if (quote().error) throw Error(quote().error);
      if (state.draft.step < 3) {
        state.draft.step++;
        saveDraft();
      } else await submit();
      return;
    }
    if (button.hasAttribute('data-c-upload')) {
      chooseFiles('all');
      return;
    }
    if (button.hasAttribute('data-c-sample')) return sample();
    if (button.hasAttribute('data-c-clear-draft')) {
      state.draft = blank();
      saveDraft();
      return;
    }
    if (d.cChoice) {
      state.draft[d.cChoice] = ['duplex', 'useRange'].includes(d.cChoice)
        ? d.cValue === 'true'
        : d.cValue;
      saveDraft();
      return;
    }
    if (d.cCopy) {
      state.draft.copies = Math.max(1, Math.min(99, state.draft.copies + Number(d.cCopy)));
      saveDraft();
      return;
    }
    if (button.hasAttribute('data-c-preview-draft'))
      return openServerPDF(api, '/files/' + state.draft.fileKey);
    if (d.cDesignPreview) {
      const order = state.orders.find((o) => o.id === d.cDesignPreview);
      return openServerPDF(api, '/orders/' + order.id + '/files/' + order.previewKey);
    }
    if (d.cOpenFile) return openServerPDF(api, '/orders/' + d.cOpenFile + '/file');
    if (d.cSuccessOrder) {
      closeModal();
      return open(d.cSuccessOrder);
    }
    if (button.hasAttribute('data-c-close')) {
      closeDrawer();
      return;
    }
    if (d.cDrawerTab) return open(state.detail, d.cDrawerTab);
    if (d.cCancel) {
      closeDrawer();
      modal(views.cancelConfirmation(d.cCancel));
      return;
    }
    if (d.cConfirmCancel) {
      await change(d.cConfirmCancel, '/status', { status: 'cancelled' });
      closeModal();
      notify('Заказ отменён.');
      return;
    }
    if (d.cKeep) {
      closeModal();
      return open(d.cKeep);
    }
    if (d.cRepeat) {
      const o = state.orders.find((o) => o.id === d.cRepeat);
      if (o.kind === 'merch') {
        const file = await api.request('/orders/' + o.id + '/files/' + o.designKey, { blob: true });
        const design = JSON.parse(await file.text());
        closeDrawer();
        state.page = 'merch';
        state.merchMode = 'studio';
        draw();
        await studio.loadDesign(design);
        return;
      }
      state.draft = { ...blank(), ...o.params, files: o.files, step: 2 };
      syncFiles(o.files);
      closeDrawer();
      state.page = 'print';
      saveDraft();
    }
  }
  document.addEventListener(
    'click',
    (event) => {
      if (
        !current() ||
        document.body.classList.contains('is-staff') ||
        document.body.dataset.screen !== 'account'
      )
        return;
      const button = event.target.closest('button');
      if (!button) {
        if (event.target.classList.contains('c-drawer-backdrop')) closeDrawer();
        return;
      }
      const d = button.dataset;
      if (pending && Object.keys(d).some((key) => /^c[A-Z]/.test(key))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!Object.keys(d).some((key) => /^c[A-Z]/.test(key))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (button.hasAttribute('data-c-add-files') || d.cReplaceFile) {
        chooseFiles(d.cReplaceFile || 'append');
        return;
      }
      // Opening the file picker must preserve the user's click activation and current input.
      if (button.hasAttribute('data-c-upload')) {
        chooseFiles('all');
        return;
      }
      run(() => click(button));
    },
    true,
  );
  document.addEventListener('change', (event) => {
    if (!current()) return;
    const el = event.target;
    if (el.dataset.cSelect) {
      state.draft[el.dataset.cSelect] = el.value;
      if (state.draft.paper === 'photo') {
        state.draft.duplex = false;
        state.draft.color = 'color';
      }
      saveDraft();
      draw();
    }
    if (el.id === 'c-copies') {
      state.draft.copies = Math.max(1, Math.min(99, Math.round(Number(el.value) || 1)));
      saveDraft();
      draw();
    }
  });
  document.addEventListener('input', (event) => {
    if (!current()) return;
    const el = event.target;
    if (['c-range', 'c-comment', 'c-copies'].includes(el.id)) {
      state.draft[{ 'c-range': 'range', 'c-comment': 'comment', 'c-copies': 'copies' }[el.id]] =
        el.id === 'c-copies' ? Number(el.value) : el.value;
      saveDraft();
      if (el.id !== 'c-comment') {
        const { q, error } = quote();
        $('#c-quote').innerHTML = q ? views.quoteHTML(q) : '';
        document
          .querySelectorAll('.c-mobile-cost')
          .forEach((node) => (node.innerHTML = q ? views.quoteHTML(q) : ''));
        const hint = $('#c-range-hint');
        if (hint) hint.textContent = error || 'Повторы не печатаются дважды.';
        $('[data-c-next]').disabled = !!error;
        const sheets = $('.c-paper-visual>small');
        if (q && sheets)
          sheets.textContent =
            q.sheets +
            ' ' +
            plural(q.sheets, 'лист', 'листа', 'листов') +
            ' · ' +
            q.impressions +
            ' стр.';
        if (q) {
          const one = $('[data-c-choice="duplex"][data-c-value="false"] small');
          const two = $('[data-c-choice="duplex"][data-c-value="true"] small');
          if (one)
            one.textContent =
              q.pages +
              ' стр. → ' +
              q.pages +
              ' ' +
              plural(q.pages, 'лист', 'листа', 'листов') +
              ' на копию';
          if (two) {
            const count = state.draft.files?.length
              ? state.draft.files.reduce(
                  (sum, file) =>
                    sum +
                    Math.ceil(
                      globalThis.OrderMath.selection(
                        file.pages,
                        state.draft.useRange ? state.draft.range : '',
                      ).length / 2,
                    ),
                  0,
                )
              : Math.ceil(q.pages / 2);
            two.textContent =
              q.pages +
              ' стр. → ' +
              count +
              ' ' +
              plural(count, 'лист', 'листа', 'листов') +
              ' на копию';
          }
        }
      }
    }
    if (el.id === 'c-message') messageDrafts.set(state.detail, el.value);
    if (el.id === 'c-search') {
      state.search = el.value;
      $('#c-filter-results').innerHTML = filteredOrders(state.orders, state.filter, state.search)
        .map(views.orderRow)
        .join('');
    }
  });
  document.addEventListener('submit', (event) => {
    if (!current() || !['c-chat-form', 'c-profile-form'].includes(event.target.id)) return;
    event.preventDefault();
    const text = $('#c-message')?.value.trim();
    const profile =
      event.target.id === 'c-profile-form'
        ? { name: $('#c-profile-name').value.trim(), group: $('#c-profile-group').value.trim() }
        : null;
    run(async () => {
      if (profile) {
        const saved = await api.request('/profile', { method: 'PATCH', body: profile });
        state.profile = { name: saved.name, group: saved.group };
        state.user = saved;
        notify('Профиль сохранён.');
      } else {
        await change(state.detail, '/messages', { text });
        messageDrafts.delete(state.detail);
        notify('Сообщение сохранено на сервере.');
      }
    });
  });
  document.addEventListener('keydown', (event) => {
    if (!current()) return;
    if (event.key === 'Escape' && state.detail) closeDrawer();
    if (event.ctrlKey && event.key === 'Enter' && event.target.id === 'c-message') {
      event.preventDefault();
      $('#c-chat-form').requestSubmit();
    }
    if (event.key === 'Tab' && state.detail) {
      const items = [
        ...$('#c-order-layer').querySelectorAll('button,input,textarea,summary,[tabindex="0"]'),
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
  return {
    load,
    render,
    openPage(page) {
      state.page = page;
      state.merchMode = 'collection';
      draw();
    },
    home() {
      state.page = 'overview';
    },
    activeCount() {
      return state.orders.filter((o) => !['issued', 'cancelled'].includes(o.status)).length;
    },
    async createStudioOrder(design, preview) {
      if (pending) throw Error('Дождись завершения операции.');
      pending = true;
      const owner = current(),
        session = state.sessionId;
      try {
        const files = await studio.productionFiles(design);
        if (owner !== current() || session !== state.sessionId) throw Error('Сессия изменилась.');
        const body = new FormData();
        body.set(
          'design',
          new Blob([JSON.stringify(design)], { type: 'application/json' }),
          'design.json',
        );
        body.set('preview', preview, 'preview.png');
        for (const [side, blob] of Object.entries(files))
          body.set(side, blob, 'print-' + side + '.png');
        const order = await api.request('/orders', { method: 'POST', body });
        state.orders.unshift(order);
        state.page = 'overview';
        state.merchMode = 'collection';
        draw();
        success(order);
        return order.id;
      } finally {
        if (owner === current() && session === state.sessionId) pending = false;
      }
    },
    reset() {
      closeDrawer();
      polling.stop();
      pending = false;
      messageDrafts.clear();
      const session = state.sessionId + 1;
      Object.assign(state, createCustomerState(), { sessionId: session });
    },
  };
}
