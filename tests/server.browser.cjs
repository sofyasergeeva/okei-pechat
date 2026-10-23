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
test('Server: failed order request preserves draft; local merch remains separate', async ({
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
      Object.keys(localStorage)
        .filter((k) => k.startsWith('okei-customer-v1:server-merch:'))
        .map((k) => JSON.parse(localStorage.getItem(k)).orders.length),
    ),
  ).toEqual([1]);
  await page.locator('.c-nav [data-c-page=orders]').click();
  await expect(page.locator('.c-order-row')).toHaveCount(1);
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
