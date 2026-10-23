export function createPresentation(state, { document, storage, reduced }) {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  function changeTheme(t) {
    state.theme = t === 'sky' ? 'sky' : 'glass';
    document.body.dataset.theme = state.theme;
    try {
      storage.setItem('okei-preferred-theme', state.theme);
    } catch {}
    $$('[data-theme-choice]').forEach((b) => {
      b.classList.toggle('active', b.dataset.themeChoice === state.theme);
      b.setAttribute('aria-pressed', String(b.dataset.themeChoice === state.theme));
    });
    $('meta[name=theme-color]').content = state.theme === 'sky' ? '#ede9e4' : '#1b191b';
  }
  function bindMotion() {
    if (reduced) return;
    $$('.hero-visual,.auth-art').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const b = el.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width - 0.5,
          y = (e.clientY - b.top) / b.height - 0.5;
        const tilt = $('.tilt-space', el);
        if (tilt)
          tilt.style.transform = `rotateX(${-y * 9}deg) rotateY(${x * 13}deg) translate3d(${x * 7}px,${y * 7}px,0)`;
      });
      el.addEventListener('pointerleave', () => {
        const tilt = $('.tilt-space', el);
        if (tilt) tilt.style.transform = '';
      });
    });
  }
  function updateHours() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Yekaterinburg',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t) => parts.find((x) => x.type === t)?.value;
    const day = get('weekday'),
      minutes = Number(get('hour')) * 60 + Number(get('minute')),
      weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(day),
      end = day === 'Fri' ? 1000 : 1020;
    const open = weekday && minutes >= 540 && minutes < end && !(minutes >= 780 && minutes < 825);
    let label = open
      ? 'Открыто · до ' + (day === 'Fri' ? '16:40' : '17:00')
      : weekday && minutes >= 780 && minutes < 825
        ? 'Обед · откроемся в 13:45'
        : weekday && minutes < 540
          ? 'Закрыто · откроемся в 09:00'
          : day === 'Fri' || day === 'Sat' || day === 'Sun'
            ? 'Закрыто · в понедельник с 09:00'
            : 'Закрыто · завтра с 09:00';
    $('#workingStatus').textContent = label;
    $('#dayHours').textContent = weekday
      ? 'Сегодня 09:00 — ' + (day === 'Fri' ? '16:40' : '17:00')
      : 'Пн — Пт · график';
    $('.hours-status').classList.toggle('is-open', open);
  }
  function applyInitialTheme() {
    try {
      const saved = storage.getItem('okei-preferred-theme');
      state.theme = saved === 'sky' ? 'sky' : 'glass';
    } catch {
      state.theme = 'glass';
    }
    changeTheme(state.theme);
  }
  return { changeTheme, bindMotion, updateHours, applyInitialTheme };
}
