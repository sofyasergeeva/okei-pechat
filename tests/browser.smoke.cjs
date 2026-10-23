const { test, expect } = require('@playwright/test');
const { join } = require('node:path');

async function openHome(page) {
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00.000Z'));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
}

async function login(page, account) {
  if (!(await page.locator('#authForm').isVisible())) await page.locator('#accountButton').click();
  await page.locator('#login').fill(account);
  await page.locator('#password').fill('okei2026');
  await page.locator('#authForm button[type="submit"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'account');
  await expect(page.locator(account === 'staff_01' ? '.w-app' : '.customer-space')).toBeVisible();
}

async function logout(page) {
  if (await page.locator('.customer-space').isVisible()) {
    await page.locator('.c-nav [data-c-page="profile"]').click();
  }
  await page.locator('[data-action="logout"]').click();
  await expect(page.locator('#authForm')).toBeVisible();
}

async function preparePDF(page) {
  await page.locator('.c-nav [data-c-page="print"]').click();
  await page.locator('#c-file-input').setInputFiles(join(__dirname, '../dist/assets/sample.pdf'));
  await expect(page.locator('.c-file-inline')).toContainText('3 страницы');
  await expect(page.locator('.c-cost-card .c-total dd')).toHaveText('12 ₽');
  await page.locator('[data-c-next]').click();
  await expect(page.locator('#c-comment')).toBeVisible();
}

async function capture(page, info, name) {
  await page.evaluate(() => document.fonts.ready);
  await info.attach(name, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test('Главная, обе темы и контрольные снимки без утверждения эталонов', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openHome(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Печать.');
  for (const theme of ['sky', 'glass']) {
    await page.locator(`[data-theme-choice="${theme}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', theme);
    await capture(page, info, `home-${theme}-1440x1000`);
  }
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'glass');
  expect(errors).toEqual([]);
});

test('Вход заказчика и сотрудника', async ({ page }) => {
  await openHome(page);
  await login(page, 'student_23');
  await expect(page.locator('.c-nav')).toBeVisible();
  await logout(page);
  await login(page, 'staff_01');
  await expect(page.locator('.w-heading')).toContainText('Очередь заказов.');
});

test('PDF и две вкладки: сотрудник меняет статус, заказчик сохраняет профиль', async ({
  page,
  context,
}) => {
  await openHome(page);
  await login(page, 'student_23');
  await preparePDF(page);
  await page.locator('[data-c-next]').click();
  const success = page.locator('[data-c-success-order]');
  await expect(success).toBeVisible();
  const id = await success.getAttribute('data-c-success-order');
  await success.click();
  await page.locator('[data-c-close]').click();

  const staff = await context.newPage();
  await openHome(staff);
  await login(staff, 'staff_01');
  await staff.locator(`[data-w-order="okei-customer-v1:student_23::${id}"]`).click();
  await staff.locator('[data-w-checked]').check();
  await staff.locator('[data-w-next="work"]').click();
  await expect(staff.locator('.w-inspector .w-status')).toHaveText('В работе');
  await staff.locator('[data-w-next="ready"]').click();
  await expect(staff.locator('.w-inspector .w-status')).toHaveText('К выдаче');
  await staff.locator('[data-w-tab="chat"]').click();
  await staff.locator('#w-message').fill('Готово к выдаче.');
  await staff.locator('#w-chat-form button[type="submit"]').click();

  await page.locator('.c-nav [data-c-page="profile"]').click();
  await page.locator('#c-profile-name').fill('Тестовый заказчик');
  await page.locator('#c-profile-form button[type="submit"]').click();
  await expect(page.locator(`.c-live-scroll [data-c-order="${id}"] b`)).toHaveText('Можно забрать');
  await page.locator(`.c-live-scroll [data-c-order="${id}"]`).click();
  await expect(page.locator('.c-drawer .c-badge')).toHaveText('Можно забрать');
  await page.locator('.c-drawer-tabs [data-c-drawer-tab="chat"]').click();
  await expect(page.locator('.c-message.staff')).toContainText('Готово к выдаче.');
});

test('Отказ записи PDF сохраняет черновик и позволяет повторить оформление', async ({ page }) => {
  await openHome(page);
  await login(page, 'student_23');
  await preparePDF(page);
  await page.locator('#c-comment').fill('Сохранить комментарий');
  await page.evaluate(() => {
    window.restoreStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('okei-customer-v1:'))
        throw new DOMException('Test quota', 'QuotaExceededError');
      return window.restoreStorageWrite.call(this, key, value);
    };
  });
  await page.locator('[data-c-next]').click();
  await expect(page.locator('#toast')).toContainText('Не удалось сохранить');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#c-comment')).toHaveValue('Сохранить комментарий');
  await page.locator('[data-c-step="1"]').click();
  await page.locator('#c-file-input').setInputFiles(join(__dirname, '../dist/assets/sample.pdf'));
  await expect(page.locator('.c-file-inline')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('Не удалось сохранить');
  await page.locator('[data-c-next]').click();
  await expect(page.locator('#c-comment')).toHaveValue('Сохранить комментарий');
  await page.evaluate(() => {
    Storage.prototype.setItem = window.restoreStorageWrite;
    delete window.restoreStorageWrite;
  });
  await page.locator('[data-c-next]').click();
  await expect(page.locator('[data-c-success-order]')).toBeVisible();
});

test('Конструктор: обе стороны, превью и оформление макета', async ({ page }, info) => {
  await openHome(page);
  await login(page, 'student_23');
  await page.locator('.c-nav [data-c-page="merch"]').click();
  await page.locator('[data-c-studio]').click();
  await expect(page.locator('#s-canvas')).toBeVisible();
  await page.locator('#s-layer-list button').filter({ hasText: 'СВОЯ КОМАНДА' }).click();
  await page.locator('#s-text').fill('QA FRONT');
  await page.locator('[data-s-side="back"]').click();
  await page.locator('[data-s-add-text]').click();
  await page.locator('#s-text').fill('QA BACK');
  await page.locator('[data-s-order]').click();
  await expect(page.locator('#s-confirm-order')).toBeVisible();
  await capture(page, info, 'studio-review-glass-1440x1000');
  await page.locator('#s-confirm-order').click();
  await expect(page.locator('[data-c-success-order]')).toBeVisible();
});

test('Мобильная ширина: главная, печать и диалог сотрудника', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await capture(page, info, 'home-glass-390x844');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await login(page, 'student_23');
  await page.locator('.c-nav [data-c-page="print"]').click();
  await expect(page.locator('#c-drop')).toBeVisible();
  await logout(page);
  await login(page, 'staff_01');
  await page.locator('[data-w-order]').first().click();
  await expect(page.locator('.w-inspector.is-open')).toBeVisible();
  await capture(page, info, 'staff-glass-390x844');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-w-close]').click();
  await expect(page.locator('.w-inspector')).toBeHidden();
});
