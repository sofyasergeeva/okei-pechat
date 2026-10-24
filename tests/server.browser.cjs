const { test, expect } = require('@playwright/test');
const { join } = require('node:path');
const url = 'http://127.0.0.1:18088/?mode=server';
async function login(page, login) {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.entryToast === 'function');
  await expect(page.locator('#accountButton')).toContainText('Войти');
  await page.locator('#accountButton').click();
  await page.locator('#login').fill(login);
  await page.locator('#password').fill('browser-password-2026');
  await page.locator('#authForm button[type=submit]').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'account');
}
async function register(page, login) {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.entryToast === 'function');
  await expect(page.locator('#accountButton')).toContainText('Войти');
  await page.locator('#accountButton').click();
  await page.locator('[data-go=register]').first().click();
  await page.locator('#name').fill('Тестовый заказчик');
  await page.locator('#group').fill('ИСП-24');
  await page.locator('#login').fill(login);
  await page.locator('#password').fill('browser-password-2026');
  await page.locator('#passwordConfirm').fill('browser-password-2026');
  await page.locator('#authForm button[type=submit]').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'account');
}
async function prepare(page) {
  await page.locator('.c-nav [data-c-page=print]').click();
  await page.locator('#c-file-input').setInputFiles(join(__dirname, '../dist/assets/sample.pdf'));
  await expect(page.locator('.c-file-inline')).toContainText('3 страницы');
  await expect(page.locator('.c-cost-card .c-total dd')).toHaveText('12 ₽');
  await page.locator('[data-c-next]').click();
  await expect(page.locator('#c-comment')).toBeVisible();
}
test('Server: independent customer/staff contexts exchange PDF orders, statuses and messages', async ({
  browser,
}, info) => {
  const customer = await browser.newContext(),
    staff = await browser.newContext();
  const page = await customer.newPage(),
    operator = await staff.newPage();
  const errors = [];
  for (const p of [page, operator]) p.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(url);
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await page.evaluate(() =>
      localStorage.setItem('okei-customer-v1:student_23', 'legacy-sentinel'),
    );
    await register(page, 'browser_customer');
    await prepare(page);
    await page.locator('#c-comment').fill('Заказ из другого браузера');
    await page.locator('[data-c-next]').click();
    await expect(page.locator('#modalContent h2')).toContainText('принят');
    await page.locator('[data-c-success-order]').click();
    await expect(page.locator('.c-drawer')).toContainText('sample.pdf');
    await page.locator('[data-c-close]').click();
    await login(operator, 'browser_operator');
    await expect(operator.locator('.w-order')).toHaveCount(1);
    await expect(operator.locator('.w-inspector')).toContainText('Заказ из другого браузера');
    await operator.locator('[data-w-checked]').check();
    await operator.locator('[data-w-next=work]').click();
    await expect(operator.locator('.w-inspector')).toContainText('В работе');
    await operator.locator('[data-w-tab=chat]').first().click();
    await operator.locator('#w-message').fill('Подтвердите параметры');
    await operator.locator('#w-chat-form button[type=submit]').click();
    await expect(operator.locator('.w-inspector')).toContainText('Ждём ответ');
    await page.reload();
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await expect(page.locator('.c-live')).toContainText('Нужно уточнение');
    await page.locator('.c-live [data-c-order]').first().click();
    await expect(page.locator('#c-chat-log')).toContainText('Подтвердите параметры');
    await page.locator('#c-message').fill('Подтверждаю');
    await page.locator('#c-chat-form button[type=submit]').click();
    await expect(page.locator('.c-drawer-status')).toContainText('Ответ сохранён');
    await page.locator('[data-c-close]').click();
    await operator.locator('[data-w-refresh]').click();
    await expect(operator.locator('.w-inspector')).toContainText('Подтверждаю');
    await operator.setViewportSize({ width: 390, height: 844 });
    await operator.locator('.w-order').click();
    await expect(operator.locator('.w-inspector')).toHaveAttribute('role', 'dialog');
    await operator.locator('[data-w-close]').click();
    await operator.setViewportSize({ width: 1440, height: 1000 });
    await operator.locator('[data-w-tab=info]').click();
    await operator.locator('[data-w-checked]').check();
    await operator.locator('[data-w-next=work]').click();
    await operator.locator('[data-w-start-printing]').click();
    await expect(operator.locator('.w-inspector')).toContainText('Печать начата');
    await operator.locator('[data-w-next=ready]').click();
    await operator.locator('[data-w-next=issued]').click();
    await operator.locator('#w-issue-form input[name=paid]').check();
    await operator.locator('#w-issue-form button[type=submit]').click();
    await page.reload();
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await page.locator('.c-nav [data-c-page=orders]').click();
    await page.locator('[data-c-filter=completed]').click();
    await expect(page.locator('.c-order-row')).toHaveCount(1);
    await expect(page.locator('.c-order-row')).toContainText('Выдан');
    expect(await page.evaluate(() => localStorage.getItem('okei-customer-v1:student_23'))).toBe(
      'legacy-sentinel',
    );
    await page.locator('.c-nav [data-c-page=profile]').click();
    await page.locator('[data-action=logout]').click();
    await expect(page.locator('#authForm')).toBeVisible();
    await login(page, 'browser_customer');
    await expect(page.locator('.customer-space')).toBeVisible();
    for (const theme of ['sky', 'glass']) {
      await page.locator(`[data-theme-choice=${theme}]`).click();
      await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
      await page.screenshot({
        path: info.outputPath('server-' + theme + '.png'),
        animations: 'disabled',
      });
    }
    expect(errors).toEqual([]);
  } finally {
    await customer.close();
    await staff.close();
  }
});
test('Server: failed order request preserves draft; merch joins the server queue', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await register(page, 'browser_failure');
  await prepare(page);
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Тестовый отказ сохранения' }),
      });
    else await route.continue();
  });
  await page.locator('[data-c-next]').click();
  await expect(page.locator('.c-error')).toContainText('Тестовый отказ сохранения');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#c-comment')).toBeVisible();
  await page.unroute('**/api/orders');
  await page.locator('[data-c-next]').click();
  await expect(page.locator('#modalContent h2')).toContainText('принят');
  await page.locator('#modal .close').click();
  await page.locator('.c-nav [data-c-page=merch]').click();
  await expect(page.locator('.v-product-grid')).toBeVisible();
  await page.locator('[data-c-studio]').click();
  await expect(page.locator('#s-canvas')).toBeVisible();
  await page.locator('[data-s-order]').click();
  await expect(page.locator('#s-review')).toBeVisible();
  await page.locator('#s-confirm-order').click();
  await expect(page.locator('#modalContent h2')).toContainText('принят');
  await page.locator('#modal .close').click();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('okei-customer-v1:server-merch:')),
    ),
  ).toEqual([]);
  await page.locator('.c-nav [data-c-page=orders]').click();
  await expect(page.locator('.c-order-row')).toHaveCount(2);
  await expect(page.locator('.c-order-row').filter({ hasText: 'Футболка' })).toHaveCount(1);
  await expect(page.locator('.c-prototype-note')).toHaveText(
    'Типография ОКЭИ · твои заказы под рукой.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.c-nav')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Server: multiple PDFs can be replaced, removed, downloaded and cancelled only before printing', async ({
  browser,
}, info) => {
  const customer = await browser.newContext(),
    staff = await browser.newContext(),
    page = await customer.newPage(),
    operator = await staff.newPage();
  const errors = [];
  for (const context of [customer, staff])
    context.on('page', (p) => p.on('pageerror', (error) => errors.push(error.message)));
  for (const p of [page, operator]) p.on('pageerror', (error) => errors.push(error.message));
  const bytes = await require('node:fs/promises').readFile(
    join(__dirname, '../dist/assets/sample.pdf'),
  );
  const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: bytes });
  try {
    await register(page, 'browser_multi');
    await page.locator('.c-nav [data-c-page=print]').click();
    await page.locator('#c-file-input').setInputFiles([
      pdf('first.pdf'),
      {
        name: 'broken.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7\ninvalid'),
      },
    ]);
    await expect(page.locator('.c-error')).toContainText('Не удалось прочитать PDF');
    await expect(page.locator('[data-c-next]')).toBeDisabled();
    await page.locator('#c-file-input').setInputFiles([pdf('first.pdf'), pdf('second.pdf')]);
    await expect(page.locator('[data-c-replace-file]')).toHaveCount(2);
    await expect(page.locator('.c-cost-card .c-total dd')).toHaveText('24 ₽');
    await page.locator('[data-c-choice=duplex][data-c-value=true]').click();
    await page.locator('#c-copies').fill('2');
    await page.locator('#c-copies').press('Tab');
    await expect(page.locator('.c-cost-card .c-total dd')).toHaveText('40 ₽');
    await page.locator('[data-c-replace-file]').first().click();
    await page.locator('#c-file-input').setInputFiles(pdf('replacement.pdf'));
    await expect(page.locator('.c-form-card')).toContainText('replacement.pdf');
    await page.locator('[data-c-remove-file]').last().click();
    await expect(page.locator('.c-cost-card .c-total dd')).toHaveText('20 ₽');
    await page.locator('[data-c-add-files]').click();
    await page.locator('#c-file-input').setInputFiles(pdf('second.pdf'));
    await expect(page.locator('[data-c-replace-file]')).toHaveCount(2);
    await expect(page.locator('.c-cost-card .c-total dd')).toHaveText('40 ₽');
    for (const theme of ['sky', 'glass']) {
      await page.locator(`[data-theme-choice=${theme}]`).click();
      await page.screenshot({
        path: info.outputPath('multiple-pdf-' + theme + '.png'),
        animations: 'disabled',
      });
    }
    await page.locator('[data-c-next]').click();
    await page.locator('[data-c-next]').click();
    await page.locator('[data-c-success-order]').click();
    await expect(page.locator('[data-c-file-id]')).toHaveCount(2);
    await page.locator('[data-c-close]').click();
    await login(operator, 'browser_operator');
    await operator.locator('#w-search').fill('replacement.pdf');
    await operator.locator('.w-order').click();
    await expect(operator.locator('[data-w-file-id]')).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const popupPromise = operator.waitForEvent('popup');
      await operator.locator('[data-w-file-id]').nth(i).click();
      const popup = await popupPromise;
      await popup.waitForURL(/^blob:/);
      await popup.close();
      const downloading = operator.waitForEvent('download');
      await operator.locator('.w-file-actions a[download]').nth(i).click();
      const downloaded = await downloading;
      expect(await require('node:fs/promises').readFile(await downloaded.path())).toEqual(bytes);
    }
    await operator.locator('[data-w-checked]').check();
    await operator.locator('[data-w-next=work]').click();
    await expect(operator.locator('[data-w-start-printing]')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await page.locator('.c-live [data-c-order]').first().click();
    await page.locator('[data-c-cancel]').click();
    await page.locator('[data-c-confirm-cancel]').click();
    await expect(page.locator('#modal')).toBeHidden();
    await page.locator('.c-nav [data-c-page=orders]').click();
    await page.locator('[data-c-filter=cancelled]').click();
    await page.locator('.c-order-row').click();
    await expect(page.locator('.c-drawer')).toContainText('Отменён:');
    await page.locator('[data-c-repeat]').click();
    await page.locator('[data-c-next]').click();
    await page.locator('[data-c-next]').click();
    await page.locator('#modal .close').click();
    await operator.locator('[data-w-refresh]').click();
    await operator.locator('[data-w-checked]').check();
    await operator.locator('[data-w-next=work]').click();
    await page.reload();
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await page.locator('.c-live [data-c-order]').first().click();
    await page.locator('[data-c-cancel]').click();
    await operator.locator('[data-w-start-printing]').click();
    await expect(operator.locator('.w-inspector')).toContainText('Печать начата:');
    await page.locator('[data-c-confirm-cancel]').click();
    await expect(page.locator('#modal')).toBeHidden();
    await page.reload();
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await page.locator('.c-live [data-c-order]').first().click();
    await expect(page.locator('.c-drawer')).toContainText('Печать начата:');
    await expect(page.locator('[data-c-cancel]')).toHaveCount(0);
    await operator.setViewportSize({ width: 390, height: 844 });
    await expect(operator.locator('.w-inspector')).toHaveAttribute('role', 'dialog');
    expect(
      await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await operator.screenshot({
      path: info.outputPath('multiple-pdf-staff-mobile.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  } finally {
    await customer.close();
    await staff.close();
  }
});

test('Server: merch production files and polling preserve customer/staff drafts and focus', async ({
  browser,
}, info) => {
  test.setTimeout(75000); // Two roles, three PNG downloads and several controlled polling cycles.
  const customer = await browser.newContext(),
    staff = await browser.newContext(),
    page = await customer.newPage(),
    operator = await staff.newPage();
  const errors = [];
  for (const p of [page, operator]) p.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.clock.install();
    await operator.clock.install();
    await register(page, 'browser_merch_poll');
    await page.locator('.c-nav [data-c-page=merch]').click();
    await page.locator('[data-c-preset=ahead]').first().click();
    await expect(page.locator('#s-canvas')).toBeVisible();
    await page.locator('#s-title').fill('Polling merch');
    await page.locator('#s-count').fill('2');
    await page.locator('#s-count').press('Tab');
    await page.locator('[data-s-order]').click();
    await page.locator('#s-confirm-order').click();
    await expect(page.locator('#modalContent')).toContainText('1 900 ₽');
    await page.locator('[data-c-success-order]').click();
    await page.locator('.c-drawer-tabs [data-c-drawer-tab=chat]').click();
    await page.locator('#c-message').fill('Черновик заказчика');
    await page.locator('#c-message').evaluate((node) => {
      node.focus();
      node.setSelectionRange(3, 7);
      window.__chatNode = node;
    });
    await login(operator, 'browser_operator');
    await operator.locator('#w-search').fill('Polling merch');
    await operator.locator('.w-order').click();
    await expect(operator.locator('.w-merch-preview img')).toBeVisible();
    await expect
      .poll(() => operator.locator('.w-merch-preview img').evaluate((node) => node.naturalWidth))
      .toBeGreaterThan(0);
    const downloading = operator.waitForEvent('download');
    await operator.locator('[data-w-design]').click();
    const json = await downloading;
    const design = JSON.parse(
      await require('node:fs/promises').readFile(await json.path(), 'utf8'),
    );
    expect(design.title).toBe('Polling merch');
    expect(design.count).toBe(2);
    expect(design.back.length).toBeGreaterThan(0);
    for (const kind of ['preview', 'front', 'back']) {
      const download = operator.waitForEvent('download');
      await operator
        .locator('.w-file-actions a[download]')
        .filter({
          hasText:
            kind === 'preview'
              ? 'Скачать превью'
              : kind === 'front'
                ? 'Принт спереди'
                : 'Принт сзади',
        })
        .click();
      const file = await download;
      const bytes = await require('node:fs/promises').readFile(await file.path());
      const { PNG } = require('../node_modules/playwright-core/lib/utilsBundle.js'),
        png = PNG.sync.read(bytes);
      expect([png.width, png.height]).toEqual(kind === 'preview' ? [1440, 1000] : [2400, 3368]);
      if (kind !== 'preview') {
        expect(png.data[3]).toBe(0);
        expect(png.data.some((v, i) => i % 4 === 3 && v > 0)).toBeTruthy();
      }
    }
    await operator.screenshot({
      path: info.outputPath('server-merch-staff.png'),
      animations: 'disabled',
    });
    await operator.locator('[data-w-tab=chat]').first().click();
    await operator.locator('#w-message').fill('Уточнение по мерчу');
    await operator.locator('#w-chat-form button[type=submit]').click();
    await expect(operator.locator('.w-messages')).toContainText('Уточнение по мерчу');
    await page.clock.fastForward(27000);
    await expect(page.locator('#c-chat-log')).toContainText('Уточнение по мерчу');
    await expect(page.locator('#c-message')).toHaveValue('Черновик заказчика');
    expect(
      await page
        .locator('#c-message')
        .evaluate(
          (node) =>
            node === window.__chatNode &&
            document.activeElement === node &&
            node.selectionStart === 3 &&
            node.selectionEnd === 7,
        ),
    ).toBeTruthy();
    await operator.locator('#w-message').fill('Черновик сотрудника');
    await operator.locator('#w-message').evaluate((node) => {
      node.focus();
      node.setSelectionRange(2, 5);
      window.__staffChatNode = node;
    });
    await page.locator('#c-chat-form button[type=submit]').click();
    await expect(page.locator('#c-chat-log')).toContainText('Черновик заказчика');
    await operator.clock.fastForward(27000);
    await expect(operator.locator('.w-messages')).toContainText('Черновик заказчика');
    await expect(operator.locator('#w-message')).toHaveValue('Черновик сотрудника');
    expect(
      await operator
        .locator('#w-message')
        .evaluate(
          (node) =>
            node === window.__staffChatNode &&
            document.activeElement === node &&
            node.selectionStart === 2,
        ),
    ).toBeTruthy();
    await operator.locator('[data-w-tab=info]').click();
    await operator.locator('[data-w-checked]').check();
    await operator.locator('[data-w-next=work]').click();
    await expect(operator.locator('[data-w-start-printing]')).toHaveText(/Начать изготовление/);
    await operator.locator('[data-w-start-printing]').click();
    await expect(operator.locator('.w-inspector')).toContainText('Изготовление начато:');
    await page.clock.fastForward(27000);
    await page.locator('[data-c-drawer-tab=info]').click();
    await expect(page.locator('.c-drawer')).toContainText('Изготовление начато:');
    await expect(page.locator('[data-c-cancel]')).toHaveCount(0);
    await page.locator('[data-c-close]').click();
    await page.locator('.c-nav [data-c-page=profile]').click();
    await page.locator('#c-profile-name').fill('Несохранённое имя');
    await page.locator('#c-profile-name').evaluate((node) => {
      window.__profileNode = node;
      node.focus();
      node.setSelectionRange(1, 4);
    });
    const scroll = await page.evaluate(() => scrollY);
    let failed = false;
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'GET' && !failed) {
        failed = true;
        await route.abort();
      } else await route.continue();
    });
    await page.clock.fastForward(27000);
    await expect.poll(() => failed).toBeTruthy();
    await page.clock.fastForward(27000);
    await page.unroute('**/api/orders');
    await expect(page.locator('#c-profile-name')).toHaveValue('Несохранённое имя');
    expect(
      await page
        .locator('#c-profile-name')
        .evaluate(
          (node) =>
            node === window.__profileNode &&
            document.activeElement === node &&
            node.selectionStart === 1,
        ),
    ).toBeTruthy();
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    let reads = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/orders') && request.method() === 'GET') reads++;
    });
    await page.locator('[data-action=logout]').click();
    await expect(page.locator('#authForm')).toBeVisible();
    const before = reads;
    await page.clock.fastForward(54000);
    expect(reads).toBe(before);
    expect(errors).toEqual([]);
  } finally {
    await customer.close();
    await staff.close();
  }
});

test('Server: root forces server authentication and all resources work without external network', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://**', (route) => route.abort());
    await page.goto('http://127.0.0.1:18088/?mode=demo');
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'server');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('650 16px Manrope'))).toBeTruthy();
    const fonts = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((x) => x.name.endsWith('.woff2'))
        .map((x) => ({ url: x.name, bytes: x.decodedBodySize })),
    );
    expect(fonts.length).toBeGreaterThan(0);
    expect(
      fonts.every((x) => x.url.startsWith('http://127.0.0.1:18088/assets/fonts/') && x.bytes > 0),
    ).toBeTruthy();
    await page.locator('#accountButton').click();
    await page.locator('#login').fill('student_23');
    await page.locator('#password').fill('okei2026');
    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
    await page.locator('#authForm button[type=submit]').click();
    expect((await response).status()).toBe(401);
    await expect(page.locator('#formError')).toContainText('Логин или пароль не совпали.');
    await expect(page.locator('.customer-space')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('Personnel: real logins, admin tab, add/rename/reset/disable, staff isolation and mobile themes', async ({
  browser,
}, info) => {
  const context = await browser.newContext(),
    other = await browser.newContext();
  try {
    const page = await context.newPage(),
      employee = await other.newPage(),
      errors = [];
    for (const p of [page, employee]) p.on('pageerror', (e) => errors.push(e.message));
    await login(employee, 'browser_operator');
    await expect(employee.locator('.w-identity')).toContainText('browser_operator');
    await expect(employee.locator('[data-w-page=personnel]')).toHaveCount(0);
    expect((await other.request.get('http://127.0.0.1:18088/api/staff')).status()).toBe(403);
    await login(page, 'browser_admin');
    await page.locator('[data-w-page=personnel]').click();
    await expect(page.locator('.w-heading h1')).toHaveText('Сотрудники.');
    const loginName = 'edge_employee_' + Date.now();
    const openAdd = page.locator('[data-w-personnel-add]');
    const form = page.locator('.w-personnel-form');
    await expect(form).toHaveCount(0);
    await expect(page.locator('.w-personnel input')).toHaveCount(0);
    await openAdd.focus();
    await page.keyboard.press('Enter');
    await expect(form.locator('[name=login]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(form.locator('[name=name]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(form.locator('[name=login]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);
    await expect(openAdd).toBeFocused();
    await page.keyboard.press('Enter');
    await form.locator('[name=login]').fill('browser_operator');
    await form.locator('[name=name]').fill('Новый сотрудник');
    await form.locator('[name=password]').fill('browser-password-2026');
    await form.getByRole('button', { name: 'Добавить сотрудника' }).click();
    await expect(page.locator('#toast')).toContainText('Этот логин уже занят');
    await expect(form.locator('[name=name]')).toHaveValue('Новый сотрудник');
    await expect(form.locator('[name=password]')).toHaveValue('browser-password-2026');
    await expect(form.locator('[name=login]')).toBeFocused();
    await form.locator('[name=login]').fill(loginName);
    await form.getByRole('button', { name: 'Добавить сотрудника' }).click();
    const row = page.locator('.w-personnel-row').filter({ hasText: loginName });
    const edit = row.locator('[data-w-personnel-edit]');
    await expect(row).toContainText('Активен');
    await expect(form).toHaveCount(0);
    await expect(edit).toBeFocused();
    expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(95);
    await page.keyboard.press('Enter');
    await expect(form.locator('[name=name]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(edit).toBeFocused();
    await expect(form).toHaveCount(0);
    await edit.click();
    await form.locator('[name=name]').fill('Изменённое имя');
    await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(row).toContainText('Изменённое имя');
    await expect(form).toHaveCount(0);
    await employee.locator('[data-action=logout]').click();
    await login(employee, loginName);
    await expect(employee.locator('.w-identity')).toContainText(loginName);
    await edit.click();
    await form.locator('[name=password]').fill('edge-reset-password-2026');
    await form.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect((await other.request.get('http://127.0.0.1:18088/api/orders')).status()).toBe(401);
    await employee.reload();
    await employee.waitForFunction(() => typeof window.entryToast === 'function');
    await expect(employee.locator('body')).not.toHaveClass(/is-signedin/);
    await employee.locator('#accountButton').click();
    await expect(employee.locator('#authForm')).toBeVisible();
    await employee.locator('#login').fill(loginName);
    await employee.locator('#password').fill('edge-reset-password-2026');
    await employee.locator('#authForm button[type=submit]').click();
    await expect(employee.locator('.w-app')).toBeVisible();
    await edit.click();
    await form.getByRole('button', { name: 'Отключить доступ' }).click();
    await expect(row).toContainText('Отключён');
    await expect(edit).toBeFocused();
    expect((await other.request.get('http://127.0.0.1:18088/api/orders')).status()).toBe(401);
    await edit.click();
    await form.getByRole('button', { name: 'Включить доступ' }).click();
    await expect(row).toContainText('Активен');
    expect((await other.request.get('http://127.0.0.1:18088/api/orders')).status()).toBe(401);
    await page
      .locator('.w-personnel-row')
      .filter({ has: page.getByText('browser_admin', { exact: true }) })
      .locator('[data-w-personnel-edit]')
      .click();
    await expect(form.getByRole('button', { name: 'Отключить доступ' })).toBeDisabled();
    await expect(form).toContainText('Единственный активный администратор');
    await page.keyboard.press('Escape');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const theme of ['sky', 'glass']) {
        await page.locator('[data-theme-choice=' + theme + ']').click();
        await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('[data-w-page=personnel]')).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        expect(
          await page
            .locator('.w-personnel-list')
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBeTruthy();
        await page.screenshot({
          path: info.outputPath('personnel-' + width + '-' + theme + '.png'),
          animations: 'disabled',
        });
        await edit.click();
        await expect(form.locator('[name=name]')).toBeFocused();
        expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        await page.screenshot({
          path: info.outputPath('personnel-editor-' + width + '-' + theme + '.png'),
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
        await expect(form).toHaveCount(0);
        await expect(edit).toBeFocused();
      }
    }
    await page.locator('[data-action=logout]').click();
    await register(page, 'profile_login_' + Date.now());
    await page.locator('[data-c-page=profile]').click();
    const session = await (
      await context.request.get('http://127.0.0.1:18088/api/auth/session')
    ).json();
    await expect(page.locator('.c-profile-info').filter({ hasText: 'Логин' })).toContainText(
      session.login,
    );
    await page.reload();
    await page.waitForFunction(() => typeof window.entryToast === 'function');
    await expect(page.locator('.customer-space')).toBeVisible();
    await page.locator('[data-c-page=profile]').click();
    await expect(page.locator('.c-profile-info').filter({ hasText: 'Логин' })).toContainText(
      session.login,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await other.close();
  }
});

async function savePrices(page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/prices') && r.request().method() === 'PATCH',
  );
  await page.locator('#w-prices-form button[type=submit]').click();
  expect((await response).status()).toBe(200);
}

test('Prices: two administrators, stale PDF/merch confirmation, exact previews, themes and mobile', async ({
  browser,
}, info) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [admin, second, customer] = await Promise.all(contexts.map((c) => c.newPage()));
  let original, secondId;
  try {
    await login(admin, 'browser_admin');
    const staff = await (await contexts[0].request.get('http://127.0.0.1:18088/api/staff')).json();
    secondId = staff.find((u) => u.login === 'browser_admin_two').id;
    const enable = await contexts[0].request.patch('http://127.0.0.1:18088/api/staff/' + secondId, {
      data: { active: true },
      headers: { Origin: 'http://127.0.0.1:18088' },
    });
    expect(enable.status()).toBe(200);
    await login(second, 'browser_admin_two');
    original = await (await contexts[0].request.get('http://127.0.0.1:18088/api/prices')).json();
    for (const page of [admin, second]) await page.locator('[data-w-page=prices]').click();
    await register(customer, 'priced_browser_' + Date.now());
    await prepare(customer);
    await admin.locator('[name=A4_mono_one]').fill('5,01');
    await savePrices(admin);
    await second.locator('[name=merch]').fill('999');
    await second.locator('#w-prices-form button[type=submit]').click();
    await expect(second.locator('#toast')).toContainText('Прайс изменился');
    await expect(second.locator('[name=A4_mono_one]')).toHaveValue('5.01');
    await expect(second.locator('[name=merch]')).toHaveValue('950.00');
    await customer.locator('[data-c-next]').click();
    await expect(customer.locator('.c-error')).toContainText('Цена изменилась');
    await expect(customer.locator('.c-cost-card .c-total dd')).toHaveText('15,03 ₽');
    await expect(customer.locator('#modal')).toBeHidden();
    expect(
      (await (await contexts[2].request.get('http://127.0.0.1:18088/api/orders')).json()).length,
    ).toBe(0);
    await customer.locator('[data-c-next]').click();
    await expect(customer.locator('#modalContent h2')).toContainText('принят');
    await customer.locator('#modal .close').click();
    await customer.locator('[data-c-studio]').first().click();
    await expect(customer.locator('#s-canvas')).toBeVisible();
    await customer.locator('[data-s-order]').click();
    await expect(customer.locator('#s-review-total')).toHaveText('950 ₽');
    await admin.locator('[name=merch]').fill('1234,56');
    await savePrices(admin);
    await customer.locator('#s-confirm-order').click();
    await expect(customer.locator('#s-confirm-order')).toHaveText('Подтвердить новую цену');
    await expect(customer.locator('#s-review-total')).toHaveText('1 234,56 ₽', {
      useInnerText: true,
    });
    expect(
      (await (await contexts[2].request.get('http://127.0.0.1:18088/api/orders')).json()).length,
    ).toBe(1);
    await customer.locator('#s-confirm-order').click();
    await expect(customer.locator('#modal')).toBeVisible();
    await expect(customer.locator('#modalContent h2')).toContainText('принят');
    const orders = await (
      await contexts[2].request.get('http://127.0.0.1:18088/api/orders')
    ).json();
    expect(orders.map((o) => o.totalKopecks).sort((a, b) => a - b)).toEqual([1503, 123456]);
    await customer.locator('#modal .close').click();
    await customer.locator('[data-c-studio]').first().click();
    await customer.locator('#s-count').fill('2');
    await customer.locator('#s-count').press('Tab');
    await expect(customer.locator('#s-total')).toHaveText('2 469,12 ₽');
    await admin.locator('[name=A4_mono_one]').fill('7');
    await admin.locator('[data-w-price-cancel]').click();
    await expect(admin.locator('[name=A4_mono_one]')).toHaveValue('5.01');
    for (const width of [1440, 390, 320])
      for (const theme of ['sky', 'glass']) {
        await admin.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        await admin.locator('[data-theme-choice=' + theme + ']').click();
        expect(
          await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
        await admin.screenshot({
          path: info.outputPath('prices-' + width + '-' + theme + '.png'),
          animations: 'disabled',
        });
      }
  } finally {
    if (original) {
      const now = await (await contexts[0].request.get('http://127.0.0.1:18088/api/prices')).json();
      expect(
        (
          await contexts[0].request.patch('http://127.0.0.1:18088/api/prices', {
            data: { version: now.version, values: original.values },
            headers: { Origin: 'http://127.0.0.1:18088' },
          })
        ).status(),
      ).toBe(200);
    }
    if (secondId)
      await contexts[0].request.patch('http://127.0.0.1:18088/api/staff/' + secondId, {
        data: { active: false },
        headers: { Origin: 'http://127.0.0.1:18088' },
      });
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('Assignments: independent employee contexts race, polling, release and administrator reassignment preserve manufacture', async ({
  browser,
}, info) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [admin, a, b, customer] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await login(admin, 'browser_admin');
    const loginB = 'colleague_' + Date.now();
    expect(
      (
        await contexts[0].request.post('http://127.0.0.1:18088/api/staff', {
          data: { login: loginB, name: 'Второй сотрудник', password: 'browser-password-2026' },
          headers: { Origin: 'http://127.0.0.1:18088' },
        })
      ).status(),
    ).toBe(201);
    await register(customer, 'assigned_' + Date.now());
    await prepare(customer);
    await customer.locator('[data-c-next]').click();
    await expect(customer.locator('#modalContent h2')).toContainText('принят');
    const id = (
      await (await contexts[3].request.get('http://127.0.0.1:18088/api/orders')).json()
    )[0].id;
    await login(a, 'browser_operator');
    await login(b, loginB);
    for (const page of [a, b]) {
      await page.locator('[data-w-order="' + id + '"]').click();
      await page.locator('[data-w-checked]').check();
    }
    const responses = [a, b].map((page) =>
      page.waitForResponse(
        (r) => r.url().endsWith('/orders/' + id + '/status') && r.request().method() === 'PATCH',
      ),
    );
    await Promise.all([a, b].map((page) => page.locator('[data-w-next=work]').click()));
    const completed = await Promise.all(responses);
    expect(completed.map((r) => r.status()).sort()).toEqual([200, 409]);
    const winner = completed[0].status() === 200 ? a : b,
      loser = winner === a ? b : a;
    await expect(winner.locator('[data-w-start-printing]')).toBeVisible();
    await expect(loser.locator('.w-assignment')).toContainText('Ответственный');
    await expect(loser.locator('[data-w-start-printing]')).toHaveCount(0);
    await winner.locator('.w-detail-tabs [data-w-tab=chat]').click();
    await winner.locator('#w-message').fill('Набросок без отправки');
    await winner.locator('[data-w-release]').click();
    await expect(winner.locator('.w-assignment')).toContainText('Свободный заказ');
    await expect(winner.locator('#w-message')).toHaveValue('Набросок без отправки');
    await winner.locator('[data-w-tab=info]').click();
    await loser.bringToFront();
    await loser.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(loser.locator('[data-w-claim]')).toBeVisible();
    await loser.locator('[data-w-claim]').click();
    await loser.locator('[data-w-start-printing]').click();
    await expect(loser.locator('[data-w-release]')).toHaveCount(0);
    let order = await (
      await contexts[0].request.get('http://127.0.0.1:18088/api/orders/' + id)
    ).json();
    expect(order.printingStartedAt).toBeTruthy();
    const started = order.printingStartedAt;
    await admin.locator('[data-w-refresh]').click();
    await admin.locator('[data-w-order="' + id + '"]').click();
    const winnerContext = winner === a ? contexts[1] : contexts[2];
    const user = await (
      await winnerContext.request.get('http://127.0.0.1:18088/api/auth/session')
    ).json();
    await admin.getByRole('combobox', { name: 'Ответственный' }).click();
    await admin.locator('.ui-select-menu [role=option][data-value="' + user.id + '"]').click();
    await admin.locator('#w-assignment-form button[type=submit]').click();
    await expect(admin.locator('#toast')).toContainText('Изменения сохранены');
    await winner.bringToFront();
    await winner.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(winner.locator('[data-w-next=ready]')).toBeVisible();
    await expect(winner.locator('[data-w-start-printing]')).toHaveCount(0);
    order = await (await contexts[0].request.get('http://127.0.0.1:18088/api/orders/' + id)).json();
    expect(order.printingStartedAt).toBe(started);
    expect(order.assignedTo).toBe(user.id);
    for (const theme of ['sky', 'glass']) {
      await admin.locator('[data-theme-choice=' + theme + ']').click();
      await admin.screenshot({
        path: info.outputPath('assigned-' + theme + '.png'),
        animations: 'disabled',
      });
    }
    await admin.setViewportSize({ width: 390, height: 844 });
    await expect(admin.locator('.w-inspector')).toHaveClass(/is-open/);
    expect(
      await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await admin.screenshot({
      path: info.outputPath('assigned-mobile.png'),
      animations: 'disabled',
    });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
