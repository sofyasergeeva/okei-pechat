import { hash, findAccount, registrationError } from './auth.mjs';
export function createAuthForms(state, { document, storage, reduced, go, toast, api }) {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const main = $('#main');
  function signal(text) {
    const el = $('.art-signal');
    if (el) el.textContent = text;
  }
  function formError(message) {
    $('#formError').textContent = message;
    $('#formError').classList.add('show');
    document.body.classList.remove('form-error');
    void main.offsetWidth;
    document.body.classList.add('form-error');
    signal('Проверим ещё раз');
    setTimeout(() => document.body.classList.remove('form-error'), 600);
  }
  function bindForm() {
    function focusField(e) {
      if (e.target.tagName !== 'INPUT') return;
      state.lastFocus = e.target.id;
      document.body.classList.toggle('focus-password', e.target.id.startsWith('password'));
      document.body.classList.toggle('focus-login', !e.target.id.startsWith('password'));
      signal(
        e.target.id.startsWith('password')
          ? 'Пароль скрыт'
          : e.target.id === 'login'
            ? 'Введи свой логин'
            : 'Знакомимся',
      );
    }
    function blurField() {
      return setTimeout(() => {
        if (!form.contains(document.activeElement)) {
          document.body.classList.remove('focus-login', 'focus-password');
          signal('Готов к работе');
        }
      }, 0);
    }
    function changePassword(e) {
      if (state.screen === 'register') {
        const p = e.target.value;
        const strength =
          Number(p.length >= 8) +
          Number(/[a-zа-я]/i.test(p)) +
          Number(/\d/.test(p)) +
          Number(/[^a-zа-я0-9]/i.test(p));
        $$('.password-meter i').forEach((el, i) =>
          el.classList.toggle('on', p.length > 0 && i < strength),
        );
        $('#meterLabel').textContent =
          p.length < 8
            ? 'Ещё ' + (8 - p.length) + ' символов до минимума'
            : strength < 3
              ? 'Добавь цифры или специальный символ'
              : 'Хороший тестовый пароль';
      }
      $('#formError').classList.remove('show');
    }
    function matchPasswords() {
      $('#formError').classList.remove('show');
      if (state.screen === 'register') {
        const p = $('#password').value,
          c = $('#passwordConfirm').value,
          h = $('#matchHint');
        $('#passwordConfirm').removeAttribute('aria-invalid');
        if (!c) {
          h.textContent = '';
          h.className = 'match-hint';
          return;
        }
        const matches = p === c;
        h.textContent = matches ? '✓ Пароли совпадают' : 'Пароли пока не совпадают';
        h.className = 'match-hint ' + (matches ? 'matches' : 'differs');
      }
    }
    async function submitAuth(e) {
      e.preventDefault();
      if (state.busy) return;
      const login = $('#login').value.trim(),
        password = $('#password').value;
      if (!login) {
        formError('Введи логин.');
        $('#login').focus();
        return;
      }
      if (!password) {
        formError('Введи пароль.');
        $('#password').focus();
        return;
      }
      if (api) {
        const registered = state.screen === 'register';
        const body = { login, password };
        if (registered) {
          body.name = $('#name').value.trim();
          body.group = $('#group').value.trim();
          const error = registrationError({
            ...body,
            passwordConfirm: $('#passwordConfirm').value,
          });
          if (error) {
            formError(error.message);
            return;
          }
        }
        if (!registered) {
          try {
            if ($('#remember')?.checked) storage.setItem('okei-api-login', login);
            else storage.removeItem('okei-api-login');
          } catch {}
        }
        state.busy = true;
        $('.auth-submit').textContent = registered ? 'Создаём…' : 'Входим…';
        try {
          const user = await api.request('/auth/' + (registered ? 'register' : 'login'), {
            method: 'POST',
            body,
          });
          await api.prepare(user);
          finishAuth(user, registered);
        } catch (error) {
          state.busy = false;
          $('.auth-submit').textContent = registered ? 'Создать аккаунт' : 'Войти';
          formError(error.message);
        }
        return;
      }
      if (state.screen === 'register') {
        const name = $('#name').value.trim(),
          group = $('#group').value.trim();
        const error = registrationError({
          name,
          group,
          login,
          password,
          passwordConfirm: $('#passwordConfirm').value,
        });
        if (error) {
          if (error.confirmation) $('#passwordConfirm').setAttribute('aria-invalid', 'true');
          formError(error.message);
          if (error.confirmation) $('#passwordConfirm').focus();
          return;
        }
        state.busy = true;
        const submit = $('.auth-submit');
        submit.textContent = 'Создаём…';
        signal('Почти готово');
        const digest = await hash(password);
        state.ephemeralAccount = {
          login: login.toLowerCase(),
          digest,
          name,
          group,
          role: 'student',
        };
        finishAuth(state.ephemeralAccount, true);
        return;
      }
      try {
        if ($('#remember')?.checked) storage.setItem('okei-concept-login', login);
        else storage.removeItem('okei-concept-login');
      } catch {}
      const found = await findAccount(login, password, state.ephemeralAccount);
      if (!found) {
        formError(
          'Логин или пароль не совпали. Для примера используй student_23 или staff_01 и okei2026.',
        );
        return;
      }
      state.busy = true;
      $('.auth-submit').textContent = 'Входим…';
      signal('Всё верно');
      finishAuth(found, false);
    }
    const form = $('#authForm');
    if (!form) return;
    if (api) {
      const demo = $('.demo-box');
      if (demo)
        demo.innerHTML =
          '<summary>Серверный режим</summary><div class="demo-caption">Создай аккаунт заказчика. Учётную запись сотрудника создаёт администратор сервера.</div>';
      const terms = $('.terms');
      if (terms)
        terms.textContent =
          'Аккаунт сохраняется на сервере. Для учебной проверки используй тестовые данные.';
    }
    if (state.screen === 'login') {
      try {
        const saved = storage.getItem(api ? 'okei-api-login' : 'okei-concept-login');
        if (saved) {
          $('#login').value = saved;
          $('#remember').checked = true;
        }
      } catch {}
    }
    form.addEventListener('focusin', focusField);
    form.addEventListener('focusout', blurField);
    $('#password').addEventListener('input', changePassword);
    form.addEventListener('input', matchPasswords);
    form.addEventListener('submit', submitAuth);
  }
  function finishAuth(found, registered) {
    document.body.classList.add('success-art');
    $('.auth-submit').textContent = 'Готово ✓';
    $('#password').value = '';
    if ($('#passwordConfirm')) $('#passwordConfirm').value = '';
    setTimeout(
      () => {
        state.busy = false;
        state.account = {
          id: found.id || found.login || $('#login').value.trim().toLowerCase(),
          name: found.name,
          group: found.group,
          role: found.role,
        };
        if (registered)
          toast(
            api
              ? 'Аккаунт сохранён на сервере.'
              : 'Тестовый аккаунт создан. Он действует только в этой вкладке.',
          );
        go('account');
      },
      reduced ? 0 : 850,
    );
  }
  return { bindForm, signal };
}
