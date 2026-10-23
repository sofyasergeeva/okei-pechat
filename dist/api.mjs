export function createApiClient() {
  let generation = 0,
    changes = 0,
    ordersRequest = null;
  async function send(path, { method = 'GET', body, blob = false } = {}) {
    const operation = generation;
    const multipart = body instanceof FormData;
    const response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
      headers: body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {},
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
    const data = blob && response.ok ? await response.blob() : await response.json();
    if (operation !== generation) throw Error('Сессия изменилась. Операция отменена.');
    if (!response.ok) {
      if (response.status === 409) changes++;
      throw Object.assign(Error(data.error || 'Ошибка запроса.'), { status: response.status });
    }
    if (method !== 'GET') changes++;
    return data;
  }
  function request(path, options = {}) {
    if (path !== '/orders' || (options.method && options.method !== 'GET'))
      return send(path, options);
    if (ordersRequest) return ordersRequest;
    const operation = generation;
    const promise = (async () => {
      let data, revision;
      do {
        revision = changes;
        data = await send(path, options);
      } while (revision !== changes && operation === generation);
      return data;
    })();
    ordersRequest = promise;
    promise
      .finally(() => {
        if (ordersRequest === promise) ordersRequest = null;
      })
      .catch(() => {});
    return promise;
  }
  return {
    request,
    invalidate() {
      generation++;
      ordersRequest = null;
    },
  };
}
export async function openServerPDF(api, path) {
  const tab = window.open('about:blank', '_blank');
  try {
    const blob = await api.request(path, { blob: true });
    if (!tab) throw Error('Разреши открытие PDF в новой вкладке.');
    const url = URL.createObjectURL(blob);
    tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

// One polling loop for the active server workspace; forms are outside patched regions.
export function createOrderPolling({
  document,
  update,
  active,
  onExpired = () => {},
  interval = 27000,
}) {
  let timer = null,
    running = false,
    enabled = false;
  function schedule() {
    clearTimeout(timer);
    if (enabled && !document.hidden) timer = setTimeout(tick, interval);
  }
  async function tick() {
    if (!enabled || document.hidden || !active()) {
      schedule();
      return;
    }
    if (running) {
      schedule();
      return;
    }
    running = true;
    try {
      await update();
    } catch (error) {
      if (error.status === 401) {
        stop();
        onExpired();
      }
    } finally {
      running = false;
      schedule();
    }
  }
  function stop() {
    enabled = false;
    clearTimeout(timer);
    timer = null;
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (enabled && !document.hidden) tick();
  });
  return {
    start() {
      enabled = true;
      schedule();
    },
    stop,
  };
}
export function patchOrderRegions(next, selectors) {
  const focused = document.activeElement;
  let identity = focused?.id ? '#' + CSS.escape(focused.id) : null;
  if (!identity && focused?.dataset) {
    const entry = Object.entries(focused.dataset)[0];
    if (entry)
      identity =
        '[data-' +
        entry[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) +
        '="' +
        CSS.escape(entry[1]) +
        '"]';
  }
  let replacedFocus = false;
  const panels = [...document.querySelectorAll('.w-inspector,.c-drawer')].map((node) => ({
    node,
    top: node.scrollTop,
  }));
  const horizontal = ['.c-live-scroll', '.w-table-scroll'].map((selector) => ({
    selector,
    left: document.querySelector(selector)?.scrollLeft || 0,
  }));
  const x = scrollX,
    y = scrollY;
  for (const selector of selectors) {
    const current = document.querySelector(selector),
      fresh = next.querySelector(selector);
    if (!current || !fresh) continue;
    const details = [...current.querySelectorAll('details')];
    fresh.querySelectorAll('details').forEach((node, index) => {
      if (details[index]) node.open = details[index].open;
    });
    if (current.className !== fresh.className && current.matches('.w-status'))
      current.className = fresh.className;
    if (current.innerHTML === fresh.innerHTML) continue;
    const log = current.matches('.c-chat-log,.w-messages'),
      bottom = log && current.scrollHeight - current.scrollTop - current.clientHeight < 30,
      top = current.scrollTop;
    replacedFocus ||= current.contains(focused);
    current.innerHTML = fresh.innerHTML;
    current.scrollTop = bottom ? current.scrollHeight : top;
  }
  horizontal.forEach(({ selector, left }) => {
    const node = document.querySelector(selector);
    if (node) node.scrollLeft = left;
  });
  panels.forEach(({ node, top }) => {
    node.scrollTop = top;
  });
  if (replacedFocus && identity) document.querySelector(identity)?.focus({ preventScroll: true });
  if (scrollX !== x || scrollY !== y) scrollTo({ left: x, top: y, behavior: 'instant' });
}
