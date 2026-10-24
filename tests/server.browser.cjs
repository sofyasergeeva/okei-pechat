const { test, expect } = require('@playwright/test');
const { join } = require('node:path');
const url = 'http://127.0.0.1:18088/?mode=server';
async function login(page, login) {
  await page.goto(url);
  await page.locator('#accountButton').click();
  await page.locator('#login').fill(login);
  await page.locator('#password').fill('browser-password-2026');
  await page.locator('#authForm button[type=submit]').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'account');
}
async function register(page, login) {
  await page.goto(url);
  await page.locator('#accountButton').click();
  await page.locator('[data-go=register]').first().click();
  await page.locator('#name').fill('Тестовый заказчик');
  await page.locator('#group').fill('ИСП-24');
  await page.locator('#login').fill(login);
  await page.locator('#password').fill('browser-password-2026');
  await page.locator('#passwordConfirm').fill('browser-password-2026');
  await page.locator('#authForm button[type=submit]').click();
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
  await expect(page.locator('.c-prototype-note')).toContainText('Серверный режим');
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
    await page.locator('.c-live [data-c-order]').first().click();
    await page.locator('[data-c-cancel]').click();
    await operator.locator('[data-w-start-printing]').click();
    await expect(operator.locator('.w-inspector')).toContainText('Печать начата:');
    await page.locator('[data-c-confirm-cancel]').click();
    await expect(page.locator('#modal')).toBeHidden();
    await page.reload();
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
