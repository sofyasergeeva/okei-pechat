(function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('pointermove', (e) => {
    if (reduced.matches || e.pointerType === 'touch') return;
    const el = e.target.closest('[data-v-tilt]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--tilt-x', (0.5 - (e.clientY - r.top) / r.height) * 7 + 'deg');
    el.style.setProperty('--tilt-y', ((e.clientX - r.left) / r.width - 0.5) * 9 + 'deg');
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-v-tilt]');
    if (el && !el.contains(e.relatedTarget)) {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    }
  });
})();
