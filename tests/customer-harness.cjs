const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Blob } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');

function runSource(context, file) {
  const filename = join(__dirname, '..', 'dist', file);
  vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
}

function loadOrderMath() {
  const context = vm.createContext({});
  runSource(context, 'order-math.js');
  return context.OrderMath;
}

function orderFixture(status = 'new', id = '2001') {
  const time = '2026-01-15T05:00:00.000Z';
  return {
    id,
    kind: 'document',
    title: 'test-document.pdf',
    status,
    created: time,
    total: 12,
    params: {
      pages: 3,
      copies: 1,
      format: 'A4',
      color: 'mono',
      paper: 'normal',
      duplex: false,
      binding: 'none',
    },
    events: [{ status, time }],
    messages: [],
    unread: 0,
  };
}

// This is a logic harness, not a DOM or IndexedDB conformance implementation.
// Each instance owns its VM, JSON storage, blobs, event listeners and UI observations.
function createCustomerHarness({ orders = [], draft = null } = {}) {
  const values = new Map();
  const files = new Map();
  const elements = new Map();
  const listeners = new Map();
  const notices = [];
  const storage = {
    failWrites: false,
    failedWrites: 0,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (this.failWrites) {
        this.failedWrites++;
        const error = new Error('Test storage quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, String(value));
    },
  };

  function makeElement() {
    return {
      id: '',
      value: '',
      innerHTML: '',
      dataset: {},
      style: {},
      hidden: false,
      classList: { contains: () => false },
      querySelector: (selector) => document.querySelector(selector),
      querySelectorAll: () => [],
      focus() {
        document.activeElement = this;
      },
      remove() {
        elements.delete('#' + this.id);
      },
      closest(selector) {
        return selector === 'button' ? this : null;
      },
      hasAttribute(name) {
        const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return Object.hasOwn(this.dataset, key);
      },
    };
  }

  const document = {
    activeElement: null,
    body: {
      dataset: { screen: 'account' },
      style: {},
      append(node) {
        elements.set('#' + node.id, node);
      },
    },
    querySelector: (selector) => elements.get(selector) ?? null,
    querySelectorAll: () => [],
    createElement: makeElement,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
  };
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  }
  for (const selector of [
    '#main',
    '#pdf',
    '#modal',
    '#modalContent',
    '.modal',
    'h2',
    '#c-close-order',
  ]) {
    element(selector);
  }
  element('#modal').hidden = true;

  let writeGate = null;
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  put(blob, key) {
                    const complete = () => {
                      files.set(key, blob);
                      transaction.oncomplete?.();
                    };
                    if (writeGate) {
                      const gate = writeGate;
                      writeGate = null;
                      gate.release = () => queueMicrotask(complete);
                      gate.markStarted();
                    } else queueMicrotask(complete);
                  },
                  get(key) {
                    const read = {};
                    queueMicrotask(() => {
                      read.result = files.get(key);
                      read.onsuccess?.();
                    });
                    return read;
                  },
                };
              },
            };
            return transaction;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
  const window = {
    OkeiUI: { icon: () => '', transition: (update) => update(), enter() {} },
    entryToast: (message) => notices.push(message),
    scrollTo() {},
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: storage,
    indexedDB,
    Blob,
    crypto: { randomUUID },
  });
  runSource(context, 'order-math.js');
  runSource(context, 'customer.js');

  const keyFor = (id) => 'okei-customer-v1:' + id;
  storage.setItem(keyFor('alice'), JSON.stringify({ orders, draft }));
  let currentId = null;
  function login(id) {
    if (currentId !== null) window.Customer.reset();
    currentId = id;
    window.Customer.render({ id, name: id, group: 'TEST-01', role: 'student' });
  }
  async function dispatch(type, target) {
    for (const callback of listeners.get(type) ?? []) {
      await callback({ target, preventDefault() {} });
    }
  }
  login('alice');

  return {
    customer: window.Customer,
    storage,
    files,
    notices,
    element,
    login,
    keyFor,
    data: (id = currentId) => JSON.parse(storage.getItem(keyFor(id))),
    async click(dataset) {
      const button = makeElement();
      button.dataset = dataset;
      await dispatch('click', button);
    },
    submit: (id) => dispatch('submit', { id }),
    input: (id, value) => dispatch('input', { id, value, dataset: {} }),
    pauseNextFileWrite() {
      if (writeGate) throw new Error('A file write is already paused');
      const gate = {};
      const started = new Promise((resolve) => (gate.markStarted = resolve));
      writeGate = gate;
      return {
        started,
        resume() {
          if (!gate.release) throw new Error('Wait for started before resuming the write');
          gate.release();
        },
      };
    },
  };
}

module.exports = { loadOrderMath, orderFixture, createCustomerHarness };
