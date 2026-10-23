const { test, expect } = require('@playwright/test');
const { join } = require('node:path');
const { orderFixture } = require('./customer-harness.cjs');

const browserErrors = new WeakMap();
test.beforeEach(async ({ context }) => {
  const errors = [];
  browserErrors.set(context, errors);
  function observe(page) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  context.pages().forEach(observe);
  context.on('page', observe);
});
test.afterEach(async ({ context }) => {
  expect(browserErrors.get(context)).toEqual([]);
});

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
  const path = info.outputPath(name + '.png');
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
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

test('Существующее хранилище: PDF, черновик, профиль и переписка после перезагрузки', async ({
  page,
}) => {
  await openHome(page);
  const order = {
    ...orderFixture('ready', '2177'),
    fileKey: 'legacy-pdf',
    customer: { name: 'Сохранённый профиль', group: 'ИСП-22' },
    messages: [
      {
        id: 'old-message',
        author: 'staff',
        text: 'Сохранённый ответ',
        time: '2026-01-15T05:00:00Z',
      },
    ],
  };
  await page.evaluate(async (order) => {
    const pdf = await (await fetch('/assets/sample.pdf')).blob();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('okei-customer-files', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('files', 'readwrite');
        transaction.objectStore('files').put(pdf, order.fileKey);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
    localStorage.setItem(
      'okei-customer-v1:student_23',
      JSON.stringify({
        orders: [order],
        profile: order.customer,
        draft: {
          ...order.params,
          fileKey: order.fileKey,
          fileName: order.title,
          fileSize: pdf.size,
          step: 2,
          copies: 2,
          range: '',
          useRange: false,
          comment: 'Сохранённый черновик',
        },
        extension: { preserved: true },
      }),
    );
  }, order);
  await login(page, 'student_23');
  await page.reload();
  // The existing app starts at home and keeps authentication only in memory.
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
  await login(page, 'student_23');
  await expect(page.locator('.v-greeting')).toContainText('Сохранённый профиль');
  await page.locator('[data-c-order="2177"]').first().click();
  await expect(page.locator('.c-drawer-status')).toContainText('Можно забрать');
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-c-open-file="2177"]').click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toMatch(/^blob:/);
  await popup.close();
  await page.locator('.c-drawer-tabs [data-c-drawer-tab="chat"]').click();
  await expect(page.locator('.c-message.staff')).toContainText('Сохранённый ответ');
  await page.locator('[data-c-close]').click();
  await page.locator('.c-nav [data-c-page="print"]').click();
  await expect(page.locator('#c-copies')).toHaveValue('2');
  await page.locator('[data-c-next]').click();
  await expect(page.locator('#c-comment')).toHaveValue('Сохранённый черновик');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('okei-customer-v1:student_23')).extension,
    ),
  ).toEqual({ preserved: true });
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

async function studioDraft(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('okei-studio', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('designs').objectStore('designs').get('student_23');
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
}

test('Canvas: drag, layers, saved draft and transparent PNG export', async ({ page }) => {
  await openHome(page);
  await login(page, 'student_23');
  await page.locator('.c-nav [data-c-page="merch"]').click();
  await page.locator('[data-c-studio]').click();
  await page.locator('#s-layer-list button').filter({ hasText: 'Логотип ОКЭИ' }).click();
  const canvas = page.locator('#s-canvas');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await studioDraft(page))?.front[0].x).toBeCloseTo(0.505, 8);
  const box = await canvas.boundingBox();
  const x = box.x + (361.14 * box.width) / 720,
    y = box.y + (373.8 * box.height) / 900;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (22.8 * box.width) / 720, y + (16 * box.height) / 900, { steps: 5 });
  await page.mouse.up();
  // Edge rounds pointer coordinates; the original commit produces the same ~5e-8 offset.
  await expect.poll(async () => (await studioDraft(page)).front[0].x).toBeCloseTo(0.605, 6);
  const moved = await studioDraft(page);
  expect(moved.front[0].y).toBeCloseTo(0.39, 6);
  const w = page.locator('#s-width');
  await w.evaluate((input) => {
    input.value = '70';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => (await studioDraft(page)).front[0].w).toBeCloseTo(0.7, 8);
  const resized = await studioDraft(page);
  expect(resized.front[0].w / resized.front[0].h).toBeCloseTo(
    moved.front[0].w / moved.front[0].h,
    8,
  );
  await page.locator('[data-s-layer]').click();
  await expect.poll(async () => (await studioDraft(page)).front.at(-1).type).toBe('image');
  const saved = await studioDraft(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-s-export]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('okei-print-front.png');
  const bytes = await require('node:fs/promises').readFile(await download.path());
  const png = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    image.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      width: canvas.width,
      height: canvas.height,
      cornerAlpha: data[3],
      hasInk: data.some((value, index) => index % 4 === 3 && value > 0),
    };
  }, Array.from(bytes));
  expect(png).toEqual({ width: 2400, height: 3368, cornerAlpha: 0, hasInk: true });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
  await login(page, 'student_23');
  await page.locator('.c-nav [data-c-page="merch"]').click();
  await page.locator('[data-c-studio]').click();
  await expect(page.locator('#s-canvas')).toBeVisible();
  expect(await studioDraft(page)).toEqual(saved);
});
