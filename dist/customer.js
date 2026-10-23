import * as helpers from './shared.mjs';
import { createStaff } from './staff.js';
import { createCustomer } from './customer/controller.mjs';

window.initializeStudio(helpers);
window.Customer = createCustomer({
  window,
  document,
  storage: localStorage,
  indexedDB,
  orderMath: globalThis.OrderMath,
  ui: window.OkeiUI,
  studio: window.Studio,
  notify: (message) => window.entryToast(message),
});
window.Staff = createStaff({
  window,
  document,
  storage: localStorage,
  indexedDB,
  ui: window.OkeiUI,
});

// Keep the classic app initialization after the customer module graph is ready.
await new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = '/app.js';
  script.onload = resolve;
  script.onerror = reject;
  document.body.append(script);
});
window.initializeControls(helpers);
