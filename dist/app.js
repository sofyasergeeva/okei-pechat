import * as helpers from './shared.mjs';
import { createStudio } from './studio.js';
import { createStaff } from './staff.js';
import { createCustomer } from './customer.js';
import { startApp } from './app/controller.mjs';
import { createApiClient } from './api.mjs';
import { createServerCustomer } from './server-customer.mjs';
import { createServerStaff } from './server-staff.mjs';

const serverMode =
  document.documentElement.dataset.mode === 'server' ||
  new URLSearchParams(location.search).get('mode') === 'server';
const notify = (message) => window.entryToast?.(message);
let customer;
const studio = createStudio({
  document,
  indexedDB,
  notify,
  placeOrder: (design, preview) => customer.createStudioOrder(design, preview),
});
const localCustomer = serverMode
  ? null
  : createCustomer({
      window,
      document,
      storage: localStorage,
      indexedDB,
      orderMath: globalThis.OrderMath,
      ui: window.OkeiUI,
      studio,
      notify,
    });
const api = serverMode ? createApiClient() : null;
customer = serverMode
  ? createServerCustomer({ api, ui: window.OkeiUI, studio, notify })
  : localCustomer;
const staff = serverMode
  ? createServerStaff({ api, ui: window.OkeiUI, notify })
  : createStaff({ window, document, storage: localStorage, indexedDB, ui: window.OkeiUI });
let initialAccount = null;
let startupError = '';
if (api) {
  api.prepare = (user) => (['staff', 'admin'].includes(user.role) ? staff : customer).load(user);
  try {
    initialAccount = await api.request('/auth/session');
    if (initialAccount) await api.prepare(initialAccount);
  } catch (error) {
    initialAccount = null;
    startupError = error.message;
  }
}
Object.assign(window, { Studio: studio, Customer: customer, Staff: staff });
const app = startApp({
  window,
  document,
  storage: localStorage,
  ui: window.OkeiUI,
  customer,
  staff,
  api,
  initialAccount,
});
window.initializeControls(helpers);
if (startupError) app.toast('Сервер недоступен: ' + startupError);
