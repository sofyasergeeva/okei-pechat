(function () {
  const $ = (s, r = document) => r.querySelector(s);
  let popup = null,
    anchor = null,
    source = null,
    activeIndex = 0,
    items = [],
    typed = '',
    typeTimer,
    seq = 0,
    hoursPanel = null;
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  function focusReplacement(select) {
    const sel = select.id
      ? '#' + select.id
      : select.dataset.cSelect
        ? 'select[data-c-select="' + select.dataset.cSelect + '"]'
        : null;
    queueMicrotask(() => {
      enhance();
      const s = select.isConnected ? select : sel ? $(sel) : null;
      if (s) {
        syncSelected(s);
        s.nextElementSibling
          ?.querySelector('[aria-pressed="true"],button')
          ?.focus({ preventScroll: true });
      }
    });
  }
  function syncSelected(select) {
    const wrap = select.nextElementSibling;
    if (!wrap) return;
    if (wrap.classList.contains('ui-inline-options'))
      wrap
        .querySelectorAll('button')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.uiValue === select.value)));
    else if (wrap.classList.contains('ui-select')) {
      const span = wrap.querySelector('.ui-select-trigger>span');
      if (span) span.textContent = select.selectedOptions[0]?.text || 'Выбрать';
    }
  }
  function choose(select, value) {
    close();
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (select.isConnected) syncSelected(select);
    focusReplacement(select);
  }
  function close(restore = false) {
    const a = anchor;
    if (popup) popup.remove();
    if (anchor?.isConnected) {
      anchor.setAttribute('aria-expanded', 'false');
      anchor.removeAttribute('aria-activedescendant');
    }
    popup = null;
    anchor = null;
    source = null;
    items = [];
    typed = '';
    if (restore && a?.isConnected) a.focus({ preventScroll: true });
  }
  function position() {
    if (!popup || !anchor?.isConnected) {
      close();
      return;
    }
    const r = anchor.getBoundingClientRect(),
      height = Math.min(280, popup.scrollHeight),
      spaceBelow = innerHeight - r.bottom - 12,
      up = spaceBelow < height && r.top > spaceBelow;
    popup.style.width = Math.max(r.width, 190) + 'px';
    popup.style.left =
      Math.max(12, Math.min(r.left, innerWidth - Math.max(r.width, 190) - 12)) + 'px';
    popup.style.maxHeight = Math.max(110, Math.min(280, up ? r.top - 20 : spaceBelow)) + 'px';
    popup.style.top = (up ? Math.max(10, r.top - height - 7) : r.bottom + 7) + 'px';
    popup.classList.toggle('opens-up', up);
  }
  function highlight(index) {
    activeIndex = (index + items.length) % items.length;
    items.forEach((x, i) => x.classList.toggle('is-highlighted', i === activeIndex));
    anchor?.setAttribute('aria-activedescendant', items[activeIndex]?.id || '');
    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }
  function open(select, button, atEnd = false) {
    close();
    closeHours();
    source = select;
    anchor = button;
    popup = document.createElement('div');
    popup.id = button.getAttribute('aria-controls');
    popup.className = 'ui-select-menu';
    popup.setAttribute('role', 'listbox');
    popup.setAttribute('aria-label', button.dataset.label);
    popup.innerHTML = [...select.options]
      .map(
        (o, i) =>
          `<div role="option" tabindex="-1" id="${popup.id}-${i}" data-value="${esc(o.value)}" aria-selected="${o.selected}" aria-disabled="${o.disabled}"><span>${esc(o.text)}</span><i>${o.selected ? '✓' : ''}</i></div>`,
      )
      .join('');
    document.body.append(popup);
    button.setAttribute('aria-expanded', 'true');
    items = [...popup.querySelectorAll('[role=option]:not([aria-disabled=true])')];
    activeIndex = atEnd
      ? items.length - 1
      : Math.max(
          0,
          items.findIndex((x) => x.getAttribute('aria-selected') === 'true'),
        );
    position();
    highlight(activeIndex);
    popup.addEventListener('pointermove', (e) => {
      const el = e.target.closest('[role=option]');
      if (el && items.includes(el)) highlight(items.indexOf(el));
    });
    popup.addEventListener('click', (e) => {
      const el = e.target.closest('[role=option]');
      if (el && el.getAttribute('aria-disabled') !== 'true') choose(select, el.dataset.value);
    });
  }
  function keydown(e, select, button) {
    if (!popup || anchor !== button) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        open(select, button, e.key === 'ArrowUp');
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(e.key))
      e.preventDefault();
    if (e.key === 'ArrowDown') highlight(activeIndex + 1);
    else if (e.key === 'ArrowUp') highlight(activeIndex - 1);
    else if (e.key === 'Home') highlight(0);
    else if (e.key === 'End') highlight(items.length - 1);
    else if (['Enter', ' '].includes(e.key)) {
      if (items[activeIndex]) choose(select, items[activeIndex].dataset.value);
    } else if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      clearTimeout(typeTimer);
      typed += e.key.toLowerCase();
      const index = items.findIndex((x) => x.textContent.trim().toLowerCase().startsWith(typed));
      if (index >= 0) highlight(index);
      typeTimer = setTimeout(() => (typed = ''), 600);
    }
  }
  function enhance() {
    document.querySelectorAll('select:not([data-ui-ready])').forEach((select) => {
      select.dataset.uiReady = 'true';
      const label = select.closest('label'),
        title =
          label?.querySelector(':scope > span')?.textContent ||
          select.getAttribute('aria-label') ||
          'Выбор',
        inline =
          select.dataset.cSelect === 'format' ||
          select.dataset.cSelect === 'paper' ||
          select.id === 's-size',
        wrap = document.createElement('div');
      select.hidden = true;
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');
      wrap.className = inline ? 'ui-inline-options' : 'ui-select';
      if (inline) {
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', title);
        for (const option of select.options) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = option.text;
          b.dataset.uiValue = option.value;
          b.disabled = option.disabled || select.disabled;
          b.setAttribute('aria-pressed', String(option.selected));
          b.addEventListener('click', (e) => {
            e.preventDefault();
            choose(select, option.value);
          });
          wrap.append(b);
        }
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ui-select-trigger';
        b.setAttribute('role', 'combobox');
        b.setAttribute('aria-label', title);
        b.setAttribute('aria-haspopup', 'listbox');
        b.setAttribute('aria-expanded', 'false');
        b.setAttribute('aria-controls', 'ui-menu-' + ++seq);
        b.dataset.label = title;
        b.disabled = select.disabled;
        b.innerHTML =
          '<span>' +
          esc(select.selectedOptions[0]?.text || 'Выбрать') +
          '</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
        b.addEventListener('click', (e) => {
          e.preventDefault();
          if (anchor === b) close();
          else open(select, b);
        });
        b.addEventListener('keydown', (e) => keydown(e, select, b));
        wrap.append(b);
      }
      select.after(wrap);
    });
  }
  function closeHours() {
    if (hoursPanel) {
      hoursPanel.remove();
      hoursPanel = null;
    }
    const d = $('.hours-details');
    if (d?.open) d.open = false;
  }
  function positionHours() {
    if (!hoursPanel) return;
    const r = $('.hours-details summary').getBoundingClientRect(),
      w = Math.min(330, innerWidth - 24),
      h = hoursPanel.offsetHeight;
    hoursPanel.style.width = w + 'px';
    hoursPanel.style.left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + 'px';
    hoursPanel.style.top =
      (innerHeight - r.bottom > h + 18 ? r.bottom + 10 : Math.max(12, r.top - h - 10)) + 'px';
  }
  document.addEventListener(
    'toggle',
    (e) => {
      if (!e.target.matches?.('.hours-details')) return;
      if (e.target.open) {
        close();
        if (hoursPanel) hoursPanel.remove();
        hoursPanel = document.createElement('section');
        hoursPanel.className = 'ui-hours-panel';
        hoursPanel.setAttribute('aria-label', 'График типографии');
        hoursPanel.innerHTML = e.target.querySelector('.hours-popover').innerHTML;
        document.body.append(hoursPanel);
        positionHours();
      } else if (hoursPanel) {
        hoursPanel.remove();
        hoursPanel = null;
      }
    },
    true,
  );
  document.addEventListener('click', (e) => {
    if (popup && !popup.contains(e.target) && !anchor?.contains(e.target)) close();
    if (hoursPanel && !hoursPanel.contains(e.target) && !e.target.closest('.hours-details'))
      closeHours();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hoursPanel) {
      closeHours();
      $('.hours-details summary')?.focus();
    }
  });
  addEventListener('resize', () => {
    position();
    positionHours();
  });
  addEventListener(
    'scroll',
    (e) => {
      if (popup && !popup.contains(e.target)) position();
      positionHours();
    },
    true,
  );
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhance();
      if (anchor && !anchor.isConnected) close();
      document.body.classList.toggle('has-studio', !!$('#studio-root'));
      const active = $('.c-nav [aria-current="page"]');
      if (active) document.body.dataset.section = active.dataset.cPage;
    });
  }).observe(document.body, { childList: true, subtree: true });
  enhance();
})();
