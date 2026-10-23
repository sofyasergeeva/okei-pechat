import * as helpers from './shared.mjs';
import { createStudio } from './studio.js';
import { createStaff } from './staff.js';
import { createCustomer } from './customer.js';
import { startApp } from './app/controller.mjs';
const notify = (message) => window.entryToast?.(message);
const studio = createStudio({
  document,
  indexedDB,
  notify,
  placeOrder: (design, preview) => customer.createStudioOrder(design, preview),
});
const customer = createCustomer({
  window,
  document,
  storage: localStorage,
  indexedDB,
  orderMath: globalThis.OrderMath,
  ui: window.OkeiUI,
  studio,
  notify,
});
const staff = createStaff({
  window,
  document,
  storage: localStorage,
  indexedDB,
  ui: window.OkeiUI,
});
Object.assign(window, { Studio: studio, Customer: customer, Staff: staff });
startApp({ window, document, storage: localStorage, ui: window.OkeiUI, customer, staff });
window.initializeControls(helpers);
