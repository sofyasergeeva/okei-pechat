const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('Auth: SHA-256, demo roles and ephemeral account matching', async () => {
  const { hash, findAccount } = await import('../dist/app/auth.mjs');
  assert.equal(
    await hash('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal((await findAccount('STAFF_01', 'okei2026', null)).role, 'staff');
  assert.equal((await findAccount('student_23', 'okei2026', null)).role, 'student');
  assert.equal(await findAccount('staff_01', 'wrong', null), null);
  const account = {
    login: 'qa_user',
    name: 'QA',
    group: 'ИСП-23',
    digest: await hash('test2026'),
    role: 'student',
  };
  assert.deepEqual(await findAccount('QA_USER', 'test2026', account), account);
  assert.equal(await findAccount('qa_user', 'wrong', account), null);
});
test('Auth: registration retains reserved logins and validation order', async () => {
  const { registrationError } = await import('../dist/app/auth.mjs');
  const valid = {
    name: 'QA',
    group: 'ИСП-23',
    login: 'qa_user',
    password: 'test2026',
    passwordConfirm: 'test2026',
  };
  assert.equal(registrationError(valid), null);
  assert.match(
    registrationError({ ...valid, name: '', login: '!' }).message,
    /имя и учебную группу/,
  );
  assert.match(registrationError({ ...valid, login: '!' }).message, /3–30/);
  assert.match(registrationError({ ...valid, login: 'STAFF_01' }).message, /уже занят/);
  assert.match(registrationError({ ...valid, password: 'short' }).message, /не менее 8/);
  assert.deepEqual(registrationError({ ...valid, passwordConfirm: 'different' }), {
    message: 'Пароли не совпадают. Повтори пароль ещё раз.',
    confirmation: true,
  });
});
