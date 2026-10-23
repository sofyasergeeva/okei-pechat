const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createCustomerHarness, orderFixture } = require('./customer-harness.cjs');

// Captured from d0aab5b before extraction. Changes require reviewing the emitted HTML.
const fingerprints = {
  overview: '89c6d6e4cae5e9e2563ea78912870d4db88e09d9815fd893e62a3f4635b8aa3d',
  orders: '7473927c92ff5a03adb65c0a7df0fdee6719a84ab1a7a9de7f12536c26629b7c',
  profile: '59da8d5ac850d3fb30f71069edccc0cfe4d44dba17e109701eae56419f5518f8',
  merch: 'ea93d699e3de5be20d3a13ef6fb275e1e84f0cacd971f96ba3a1c5ab4cf67fb0',
  print: 'a3b4be601d1fc2bbe58f5b50175ec22564691eb34a5a09f0799c83ab5c27b05f',
  print2: '4c4d5de5ac784c328eba87f4e595fedc315b06cda7eae0d605f46e17542a0002',
  print3: '98f247ed637641280ca64f3b20e971eeb9a7ca50c857c92f07bbdb0f8f302a73',
  'drawer-info': '933ba4b28edd76866c363323a8f913434d82463ac5f76dddc1ae49ba78f5bbc7',
  'drawer-chat': '2b5fe12a9d1be28db25b66583d2fe4fc44a3428f59a0df4f220ecb85683de36b',
};
for (const [name, expected] of Object.entries(fingerprints)) {
  test('HTML remains unchanged: ' + name, async () => {
    const orders = ['new', 'work', 'ready', 'attention', 'issued', 'cancelled'].map(
      (status, index) => orderFixture(status, String(2001 + index)),
    );
    const draft =
      name === 'print2' || name === 'print3'
        ? {
            ...orderFixture().params,
            fileKey: 'pdf-reference',
            fileName: 'reference.pdf',
            fileSize: 12,
            step: Number(name.at(-1)),
            range: '1-2',
            useRange: true,
            comment: 'Test <comment>',
          }
        : undefined;
    const app = await createCustomerHarness({ orders, ...(draft ? { draft } : {}) });
    let html;
    if (name.startsWith('drawer-')) {
      await app.click({ cOrder: '2004', cTab: name.slice(7) });
      html = app.element('#c-order-layer').innerHTML;
    } else {
      await app.click({ cPage: name.startsWith('print') ? 'print' : name });
      html = app.element('#main').innerHTML;
    }
    assert.equal(
      createHash('sha256').update(html).digest('hex'),
      expected,
      'Rendered HTML differs from the original ' + name,
    );
  });
}
