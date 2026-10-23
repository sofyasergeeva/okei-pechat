export async function hash(value) {
  if (crypto.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return value
    .split('')
    .reduce((s, c) => Math.imul(s ^ c.charCodeAt(0), 16777619), 2166136261)
    .toString(16);
}
export async function findAccount(login, password, ephemeralAccount) {
  let found = null;
  if (password === 'okei2026') {
    if (login.toLowerCase() === 'student_23')
      found = { name: 'Софья', group: 'ИСП-23', role: 'student' };
    if (login.toLowerCase() === 'staff_01') found = { name: 'Сотрудник', role: 'staff' };
  }
  if (
    !found &&
    ephemeralAccount &&
    ephemeralAccount.login === login.toLowerCase() &&
    ephemeralAccount.digest === (await hash(password))
  )
    found = ephemeralAccount;
  return found;
}
export function registrationError({ name, group, login, password, passwordConfirm }) {
  if (!name || !group) return { message: 'Укажи имя и учебную группу.' };
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(login))
    return { message: 'Логин: 3–30 латинских букв, цифр, точек, дефисов или _.' };
  if (['student_23', 'staff_01'].includes(login.toLowerCase()))
    return { message: 'Этот тестовый логин уже занят. Придумай другой.' };
  if (password.length < 8) return { message: 'В пароле должно быть не менее 8 символов.' };
  if (password !== passwordConfirm)
    return { message: 'Пароли не совпадают. Повтори пароль ещё раз.', confirmation: true };
  return null;
}
