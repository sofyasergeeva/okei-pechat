(function () {
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const colors = [
    ['#f5f3ed', 'Молочный'],
    ['#243348', 'Графитовый'],
    ['#9f243b', 'Бордовый'],
    ['#d7c7c4', 'Пудровый'],
    ['#c4c0bd', 'Серый'],
  ];
  const area = { x: 246, y: 265, w: 228, h: 320 };
  let user = '',
    design = null,
    selected = null,
    canvas = null,
    ctx = null,
    side = 'front',
    drag = null,
    loading = null,
    revision = 0,
    saving = false,
    ready = false,
    pendingPreset = null,
    loadToken = 0,
    lockRatio = true;
  const cache = new Map();
  function fresh() {
    return {
      version: 1,
      title: 'Мой дизайн',
      shirtColor: colors[0][0],
      shirtColorName: colors[0][1],
      size: 'M',
      count: 1,
      front: [
        {
          id: uid(),
          type: 'image',
          src: '/assets/college-red.svg',
          label: 'Логотип ОКЭИ',
          x: 0.5,
          y: 0.34,
          w: 0.68,
          h: 0.3,
          rotation: 0,
        },
        {
          id: uid(),
          type: 'text',
          text: 'СВОЯ КОМАНДА',
          color: '#8b1634',
          font: 'Manrope',
          weight: 800,
          x: 0.5,
          y: 0.58,
          w: 0.9,
          h: 0.1,
          rotation: 0,
        },
      ],
      back: [],
    };
  }
  function db() {
    return new Promise((r, j) => {
      let q = indexedDB.open('okei-studio', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('designs');
      q.onsuccess = () => r(q.result);
      q.onerror = () => j(q.error);
    });
  }
  async function read(owner = user) {
    let d = await db();
    try {
      return await new Promise((r, j) => {
        let q = d.transaction('designs').objectStore('designs').get(owner);
        q.onsuccess = () => r(q.result);
        q.onerror = () => j(q.error);
      });
    } finally {
      d.close();
    }
  }
  async function write(value, owner) {
    let d = await db();
    try {
      await new Promise((r, j) => {
        const t = d.transaction('designs', 'readwrite');
        t.objectStore('designs').put(value, owner);
        t.oncomplete = r;
        t.onerror = () => j(t.error);
      });
    } finally {
      d.close();
    }
  }
  function toast(s) {
    window.entryToast?.(s);
  }
  let saveQueue = Promise.resolve();
  function save() {
    revision++;
    const value = structuredClone(design),
      owner = user;
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => write(value, owner))
      .then(() => {
        if ($('#s-save-status')) $('#s-save-status').textContent = 'Черновик сохранён';
      })
      .catch(() => {
        toast('Не удалось сохранить черновик. Скачай макет перед выходом.');
        if ($('#s-save-status')) $('#s-save-status').textContent = 'Не сохранено';
      });
  }
  function image(src) {
    if (!cache.has(src)) {
      cache.set(
        src,
        new Promise((r, j) => {
          let i = new Image();
          i.onload = () => r(i);
          i.onerror = () => {
            cache.delete(src);
            j(Error('Изображение не загрузилось'));
          };
          i.src = src;
        }),
      );
    }
    return cache.get(src);
  }
  function view() {
    return `<header class="c-page-heading s-heading"><div><span class="c-kicker">Твоя футболка. Твои правила.</span><h1>Создай что-то своё<span class="v-red-dot">.</span></h1><p>Изображения, текст и цвет.</p></div><button class="c-text-btn" data-c-page="merch">← К коллекции</button></header><div id="studio-root" aria-busy="true"><p class="c-hint">Открываем конструктор…</p></div>`;
  }
  async function mount(id) {
    if (!$('#studio-root')) return;
    if (user !== id || !design) {
      user = id;
      ready = false;
      revision = 0;
      selected = null;
      side = 'front';
      loading = read(id)
        .then((v) => {
          if (user !== id) return;
          design = v?.version === 1 ? v : fresh();
          ready = true;
        })
        .catch(() => {
          if (user !== id) return;
          design = fresh();
          ready = true;
          toast('Черновик недоступен. Открыт новый макет.');
        });
    }
    if (loading) await loading;
    if (!$('#studio-root') || user !== id) return;
    $('#studio-root').setAttribute('aria-busy', 'false');
    render();
    if (pendingPreset) {
      const p = pendingPreset;
      pendingPreset = null;
      preset(p);
    }
  }
  function options() {
    const o = design[side].find((x) => x.id === selected);
    return `<span class="c-kicker">${o ? 'Выбранный элемент' : 'Настройка макета'}</span><h3>${o ? esc(o.type === 'text' ? 'Текст' : 'Изображение') : 'Нажми на принт'}</h3>${o ? `${o.type === 'text' ? `<label class="c-field"><span>Текст</span><textarea id="s-text" maxlength="100" rows="2">${esc(o.text)}</textarea></label><div class="s-field-pair"><label class="c-field"><span>Цвет</span><input type="color" id="s-ink" value="${o.color}"></label><label class="c-field"><span>Шрифт</span><select id="s-font"><option value="Manrope" ${o.font === 'Manrope' ? 'selected' : ''}>Гротеск</option><option value="Georgia" ${o.font === 'Georgia' ? 'selected' : ''}>Антиква</option><option value="monospace" ${o.font === 'monospace' ? 'selected' : ''}>Моноширинный</option></select></label></div>` : `<p class="c-hint s-file-name">${esc(o.label)}</p>`}${o.type === 'image' ? `<label class="s-ratio"><input type="checkbox" id="s-lock-ratio" ${lockRatio ? 'checked' : ''}>Сохранять пропорции</label><p class="s-resize-help">Тяни за маркеры. Без пропорций ширина и высота меняются отдельно.</p>` : ''}<label class="c-field"><span>Размер <b id="s-width-label">${Math.round(o.w * 100)}%</b></span><input id="s-width" type="range" min="15" max="100" value="${Math.round(o.w * 100)}"></label><label class="c-field"><span>Поворот <b id="s-rotation-label">${o.rotation || 0}°</b></span><input id="s-rotation" type="range" min="-45" max="45" value="${o.rotation || 0}"></label><div class="s-align"><button data-s-center>По центру</button><button data-s-layer>На передний план</button></div><button class="s-delete" data-s-delete>Удалить элемент ×</button>` : '<p class="c-hint">Выбери принт на футболке.</p>'}<div class="s-order-settings"><label class="c-field"><span>Название дизайна</span><input id="s-title" maxlength="40" value="${esc(design.title)}"></label><div class="s-field-pair"><label class="c-field"><span>Размер футболки</span><select id="s-size">${['XS', 'S', 'M', 'L', 'XL'].map((v) => `<option ${v === design.size ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="c-field"><span>Количество</span><input type="number" id="s-count" min="1" max="30" value="${design.count}"></label></div><div class="s-total"><span>Футболка + принт</span><b id="s-total">${(design.count * 950).toLocaleString('ru-RU')} ₽</b></div><button class="btn primary s-order" data-s-order>Заказать свой принт <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button><p class="c-hint s-price-note">950 ₽ / шт. — пример цены, печать с двух сторон включена. Ткань, цвет и итог подтвердит сотрудник. Оплата при получении.</p></div>`;
  }
  function render() {
    const root = $('#studio-root');
    if (!root || !design) return;
    root.innerHTML = `<div class="s-layout"><aside class="s-tools"><div class="s-tool-title"><span class="c-kicker">Твой дизайн</span><span id="s-save-status">Сохранение в браузере</span></div><button class="s-add-image" data-s-upload><span>↥</span><b>Добавить изображение<small>PNG, JPG, WEBP · до 10 МБ</small></b><i>+</i></button><input type="file" id="s-image-input" accept="image/png,image/jpeg,image/webp" hidden><button class="s-tool-button" data-s-add-text><span>T</span>Добавить текст <i>+</i></button><button class="s-tool-button" data-s-add-logo>Добавить логотип ОКЭИ <i><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></i></button><div class="s-color-tools"><h3>Цвет футболки</h3><div class="s-swatches">${colors.map(([c, n]) => `<button aria-label="${n}" aria-pressed="${design.shirtColor === c}" data-s-color="${c}" style="--swatch:${c}">${design.shirtColor === c ? '✓' : ''}</button>`).join('')}<label class="s-custom-color" title="Свой цвет"><span>+</span><input type="color" id="s-shirt-color" value="${design.shirtColor}" aria-label="Свой цвет футболки"></label></div><span id="s-color-name">${esc(design.shirtColorName)}</span></div><div class="s-layers"><h3>Элементы <span id="s-layer-count">${design[side].length}</span></h3><div id="s-layer-list">${layersHTML()}</div></div><p class="s-help">Тяни принт и маркеры. Стрелки клавиатуры — для точного сдвига.</p><button class="c-text-btn s-clear" data-s-clear>Очистить эту сторону ↺</button></aside><section class="s-stage-panel"><div class="s-stage-top"><div class="s-side-switch" role="group" aria-label="Сторона футболки"><button data-s-side="front" aria-pressed="${side === 'front'}" class="${side === 'front' ? 'active' : ''}">Спереди <small>${design.front.length}</small></button><button data-s-side="back" aria-pressed="${side === 'back'}" class="${side === 'back' ? 'active' : ''}">Сзади <small>${design.back.length}</small></button></div><span class="s-stage-index">СТУДИЯ ОКЭИ / 01</span></div><div class="s-canvas-wrap"><canvas id="s-canvas" width="720" height="900" tabindex="0" aria-label="Макет футболки. Выбери элемент мышью, перемещай стрелками на клавиатуре."></canvas><span class="s-stage-sticker" aria-hidden="true">${side === 'front' ? 'ТВОЙ<br>ХАРАКТЕР' : 'ДРУГАЯ<br>СТОРОНА'}</span></div><div class="s-stage-bottom"><span><i></i> Пунктир — область печати</span><button class="c-text-btn" data-s-export>Скачать принт PNG ↓</button></div><small class="s-preview-note">${side === 'back' ? 'Условный вид сзади: та же фотоподложка. ' : ''}Цвет на экране — ориентир. Реальный оттенок ткани может отличаться.</small></section><aside class="s-inspector" id="s-inspector">${options()}</aside></div><div class="s-review" id="s-review" hidden></div>`;
    canvas = $('#s-canvas');
    ctx = canvas.getContext('2d');
    bindCanvas();
    paint();
  }
  function layersHTML() {
    return design[side].length
      ? design[side]
          .map(
            (o) =>
              `<button data-s-select="${o.id}" class="${o.id === selected ? 'active' : ''}"><span>${o.type === 'text' ? 'T' : '▧'}</span><b>${esc(o.type === 'text' ? o.text : o.label)}</b><i><svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></i></button>`,
          )
          .join('')
      : '<p class="c-hint">Пока пусто. Добавь изображение или текст.</p>';
  }
  function syncCounts() {
    const el = $('#s-layer-count');
    if (el) el.textContent = design[side].length;
    for (const key of ['front', 'back']) {
      const n = $('[data-s-side="' + key + '"] small');
      if (n) n.textContent = design[key].length;
    }
  }
  function inspect() {
    syncCounts();
    if ($('#s-inspector')) $('#s-inspector').innerHTML = options();
    if ($('#s-layer-list')) $('#s-layer-list').innerHTML = layersHTML();
  }
  function shirtPath(c) {
    c.beginPath();
    c.moveTo(296, 128);
    c.quadraticCurveTo(360, 160, 443, 126);
    c.lineTo(511, 159);
    c.quadraticCurveTo(550, 180, 590, 247);
    c.lineTo(663, 408);
    c.lineTo(564, 455);
    c.lineTo(548, 394);
    c.lineTo(555, 748);
    c.quadraticCurveTo(400, 766, 165, 749);
    c.lineTo(169, 394);
    c.lineTo(137, 457);
    c.lineTo(55, 406);
    c.quadraticCurveTo(112, 302, 157, 226);
    c.quadraticCurveTo(182, 181, 212, 159);
    c.closePath();
  }
  let paints = 0;
  async function paint() {
    if (!canvas?.isConnected || !design) return;
    const token = ++paints,
      current = canvas,
      d = structuredClone(design),
      objects = d[side];
    try {
      const assets = await Promise.all([
        image('/assets/college-shirt.png'),
        ...objects.filter((o) => o.type === 'image').map((o) => image(o.src)),
      ]);
      if (token !== paints || current !== canvas || !current.isConnected) return;
      ctx.clearRect(0, 0, 720, 900);
      ctx.drawImage(assets[0], 0, 0, 720, 900);
      if (d.shirtColor !== colors[0][0]) {
        ctx.save();
        shirtPath(ctx);
        ctx.clip();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = d.shirtColor;
        ctx.fillRect(0, 0, 720, 900);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = '#36577c66';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1;
      ctx.strokeRect(area.x, area.y, area.w, area.h);
      ctx.restore();
      for (const o of objects) {
        await drawObject(ctx, o, area);
        if (o.id === selected) {
          ctx.save();
          ctx.translate(area.x + o.x * area.w, area.y + o.y * area.h);
          ctx.rotate(((o.rotation || 0) * Math.PI) / 180);
          ctx.strokeStyle = '#7c293f';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect((-o.w * area.w) / 2, (-o.h * area.h) / 2, o.w * area.w, o.h * area.h);
          ctx.setLineDash([]);
          for (const [sx, sy] of handles) {
            ctx.fillStyle = '#fffaf6';
            ctx.fillRect((sx * o.w * area.w) / 2 - 5, (sy * o.h * area.h) / 2 - 5, 10, 10);
            ctx.strokeRect((sx * o.w * area.w) / 2 - 5, (sy * o.h * area.h) / 2 - 5, 10, 10);
          }
          ctx.restore();
        }
      }
    } catch {
      toast('Не удалось показать изображение. Добавь его ещё раз.');
    }
  }
  async function drawObject(c, o, a) {
    c.save();
    c.beginPath();
    c.rect(a.x, a.y, a.w, a.h);
    c.clip();
    c.translate(a.x + o.x * a.w, a.y + o.y * a.h);
    c.rotate(((o.rotation || 0) * Math.PI) / 180);
    if (o.type === 'image') {
      c.drawImage(await image(o.src), (-o.w * a.w) / 2, (-o.h * a.h) / 2, o.w * a.w, o.h * a.h);
    } else {
      const lines = o.text.split('\n'),
        fontSize = (o.h * a.h) / Math.max(1, lines.length) / 1.25;
      c.fillStyle = o.color;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `${o.weight || 800} ${fontSize}px ${o.font || 'Manrope'}`;
      lines.forEach((line, i) =>
        c.fillText(line, 0, (i - (lines.length - 1) / 2) * fontSize * 1.25, o.w * a.w),
      );
    }
    c.restore();
  }
  function selectedObject() {
    return design?.[side].find((x) => x.id === selected);
  }
  function confine(o) {
    const r = ((o.rotation || 0) * Math.PI) / 180,
      co = Math.abs(Math.cos(r)),
      si = Math.abs(Math.sin(r)),
      bw = co * o.w + (si * o.h * area.h) / area.w,
      bh = co * o.h + (si * o.w * area.w) / area.h,
      fit = Math.min(1, 1 / bw, 1 / bh);
    o.w *= fit;
    o.h *= fit;
    const hw = (co * o.w + (si * o.h * area.h) / area.w) / 2,
      hh = (co * o.h + (si * o.w * area.w) / area.h) / 2;
    o.x = Math.max(hw, Math.min(1 - hw, o.x));
    o.y = Math.max(hh, Math.min(1 - hh, o.y));
  }
  const handles = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * 720) / r.width, y: ((e.clientY - r.top) * 900) / r.height };
  }
  function localPoint(o, p) {
    const a = (-(o.rotation || 0) * Math.PI) / 180,
      dx = p.x - (area.x + o.x * area.w),
      dy = p.y - (area.y + o.y * area.h);
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function hitHandle(o, p) {
    if (!o) return null;
    const q = localPoint(o, p),
      radius = Math.max(11, (9 * 720) / canvas.getBoundingClientRect().width);
    return handles.find(
      ([sx, sy]) =>
        Math.abs(q.x - (sx * o.w * area.w) / 2) < radius &&
        Math.abs(q.y - (sy * o.h * area.h) / 2) < radius,
    );
  }
  function resizeInspector() {
    const o = selectedObject();
    if (!o) return;
    const el = $('#s-width');
    if (el) el.value = Math.round(o.w * 100);
    if ($('#s-width-label')) $('#s-width-label').textContent = Math.round(o.w * 100) + '%';
  }
  function bindCanvas() {
    canvas.addEventListener('pointerdown', (e) => {
      const p = point(e),
        chosen = selectedObject(),
        handle = hitHandle(chosen, p);
      let o = handle
        ? chosen
        : [...design[side]].reverse().find((o) => {
            const q = localPoint(o, p);
            return Math.abs(q.x) < (o.w * area.w) / 2 + 5 && Math.abs(q.y) < (o.h * area.h) / 2 + 5;
          });
      selected = o?.id || null;
      inspect();
      paint();
      canvas.focus({ preventScroll: true });
      if (o) {
        e.preventDefault();
        drag = { id: o.id, point: p, original: structuredClone(o), handle };
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = point(e);
      if (!drag) {
        const h = hitHandle(selectedObject(), p);
        canvas.style.cursor = h
          ? h[0] === 0
            ? 'ns-resize'
            : h[1] === 0
              ? 'ew-resize'
              : h[0] === h[1]
                ? 'nwse-resize'
                : 'nesw-resize'
          : 'grab';
        return;
      }
      const o = selectedObject();
      if (!o) return;
      const d = drag.original,
        dx = p.x - drag.point.x,
        dy = p.y - drag.point.y;
      if (drag.handle) {
        const [sx, sy] = drag.handle,
          r = ((d.rotation || 0) * Math.PI) / 180,
          co = Math.cos(r),
          si = Math.sin(r),
          lx = dx * co + dy * si,
          ly = -dx * si + dy * co,
          ow = d.w * area.w,
          oh = d.h * area.h;
        let w = sx ? Math.max(22, ow + sx * lx) : ow,
          h = sy ? Math.max(18, oh + sy * ly) : oh;
        if (lockRatio) {
          let factor =
            sx && sy
              ? 1 + (sx * lx * ow + sy * ly * oh) / (ow * ow + oh * oh)
              : sx
                ? w / ow
                : h / oh;
          factor = Math.max(0.08, factor);
          w = ow * factor;
          h = oh * factor;
        }
        const cx = (sx * (w - ow)) / 2,
          cy = (sy * (h - oh)) / 2;
        o.w = w / area.w;
        o.h = h / area.h;
        o.x = d.x + (cx * co - cy * si) / area.w;
        o.y = d.y + (cx * si + cy * co) / area.h;
      } else {
        o.x = d.x + dx / area.w;
        o.y = d.y + dy / area.h;
      }
      confine(o);
      resizeInspector();
      paint();
    });
    function end() {
      if (drag) {
        drag = null;
        save();
      }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', (e) => {
      const o = selectedObject();
      if (!o) return;
      const n = e.shiftKey ? 0.025 : 0.005;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        o.x += e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
        o.y += e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
        confine(o);
        paint();
        save();
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        remove();
      }
    });
  }

  function remove() {
    design[side] = design[side].filter((o) => o.id !== selected);
    selected = null;
    save();
    inspect();
    paint();
  }
  async function addImage(file) {
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ) {
      toast('Выбери PNG, JPG или WEBP до 10 МБ.');
      return;
    }
    if (design[side].length >= 12) {
      toast('На одной стороне можно разместить до 12 элементов.');
      return;
    }
    const originalSide = side,
      originalUser = user;
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > 60000000)
        throw Error();
      const c = document.createElement('canvas'),
        scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      c.width = Math.round(bitmap.width * scale);
      c.height = Math.round(bitmap.height * scale);
      c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
      bitmap.close();
      if (user !== originalUser) return;
      const ratio = c.height / c.width;
      let w = 0.75,
        h = (w * area.w * ratio) / area.h;
      if (h > 0.8) {
        h = 0.8;
        w = (h * area.h) / ratio / area.w;
      }
      const o = {
        id: uid(),
        type: 'image',
        src: c.toDataURL('image/png'),
        label: file.name,
        x: 0.5,
        y: 0.46,
        w,
        h,
        rotation: 0,
      };
      design[originalSide].push(o);
      side = originalSide;
      selected = o.id;
      save();
      render();
      toast('Изображение добавлено. Перетащи его на футболке.');
    } catch {
      toast('Не удалось прочитать изображение. Попробуй другой файл.');
    }
  }
  async function exportSide() {
    if (!design[side].length) {
      toast('На этой стороне пока нет принта. Добавь элемент или выбери другую сторону.');
      return;
    }
    try {
      const c = document.createElement('canvas');
      c.width = 2400;
      c.height = 3368;
      for (const o of design[side])
        await drawObject(c.getContext('2d'), o, { x: 0, y: 0, w: c.width, h: c.height });
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      download(blob, 'okei-print-' + side + '.png');
      toast('Скачан принт текущей стороны на прозрачном фоне.');
    } catch {
      toast('Не удалось экспортировать принт. Попробуй снова.');
    }
  }
  function download(blob, name) {
    const a = document.createElement('a'),
      url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  async function previewBlob(d) {
    const c = document.createElement('canvas');
    c.width = 1440;
    c.height = 1000;
    const x = c.getContext('2d');
    x.fillStyle = '#e6eaf0';
    x.fillRect(0, 0, 1440, 1000);
    x.fillStyle = '#273047';
    x.font = '700 24px Arial';
    x.fillText('ОКЭИ / ' + d.title, 36, 42);
    for (const [i, key] of ['front', 'back'].entries()) {
      x.save();
      x.translate(i * 720, 70);
      x.drawImage(await image('/assets/college-shirt.png'), 0, 0, 720, 900);
      if (d.shirtColor !== colors[0][0]) {
        x.save();
        shirtPath(x);
        x.clip();
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = d.shirtColor;
        x.fillRect(0, 0, 720, 900);
        x.restore();
      }
      for (const o of d[key]) await drawObject(x, o, area);
      x.restore();
      x.fillStyle = '#273047';
      x.font = '18px Arial';
      x.fillText(key === 'front' ? 'Спереди' : 'Сзади · условный вид', i * 720 + 35, 985);
    }
    return await new Promise((r) => c.toBlob(r, 'image/png'));
  }
  async function review() {
    if (!design.front.length && !design.back.length) {
      toast('Добавь изображение или текст хотя бы на одну сторону.');
      return;
    }
    if (!Number.isInteger(design.count) || design.count < 1 || design.count > 30) {
      toast('Укажи количество от 1 до 30.');
      return;
    }
    const snapshot = structuredClone(design),
      version = revision,
      targetUser = user,
      reviewToken = ++loadToken;
    const root = $('#s-review');
    root.hidden = false;
    root.innerHTML = '<p>Готовим макет…</p>';
    const blob = await previewBlob(snapshot);
    if (!root.isConnected || user !== targetUser || loadToken !== reviewToken) return;
    const url = URL.createObjectURL(blob);
    root.innerHTML = `<div class="s-review-box" role="dialog" aria-modal="true" aria-labelledby="s-review-title" tabindex="-1"><button class="s-review-close" data-s-review-close aria-label="Закрыть проверку макета">×</button><span class="c-kicker">Проверь обе стороны</span><h2 id="s-review-title">Всё на своих местах?</h2><img src="${url}" alt="Макет передней и задней стороны футболки"><p>${esc(snapshot.shirtColorName)} · ${snapshot.size} · ${snapshot.count} шт.</p><strong>${(snapshot.count * 950).toLocaleString('ru-RU')} ₽ <small>демонстрационная стоимость</small></strong><p class="c-hint">Макет сохранится вместе с заказом в этом браузере. Реальная отправка сотруднику пока не подключена.</p><button class="btn primary" id="s-confirm-order">Подтвердить заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div>`;
    const box = $('.s-review-box');
    box.focus();
    root.onclick = async (e) => {
      if (e.target === root || e.target.closest('[data-s-review-close]')) {
        root.hidden = true;
        URL.revokeObjectURL(url);
        $('[data-s-order]')?.focus();
        return;
      }
      if (e.target.closest('#s-confirm-order') && !saving) {
        if (user !== targetUser || revision !== version) {
          toast('Макет изменён. Проверь его ещё раз.');
          root.hidden = true;
          URL.revokeObjectURL(url);
          return;
        }
        saving = true;
        const b = $('#s-confirm-order');
        b.disabled = true;
        b.textContent = 'Сохраняем макет…';
        try {
          await window.Customer.createStudioOrder(snapshot, blob);
          URL.revokeObjectURL(url);
        } catch {
          toast('Заказ не сохранился. Попробуй ещё раз.');
          b.disabled = false;
          b.textContent = 'Подтвердить заказ';
        } finally {
          saving = false;
        }
      }
    };
    root.onkeydown = (e) => {
      if (e.key === 'Escape') {
        root.hidden = true;
        URL.revokeObjectURL(url);
        $('[data-s-order]')?.focus();
      }
      if (e.key === 'Tab') {
        const items = [...root.querySelectorAll('button')].filter((x) => !x.disabled),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
  }
  function preset(id) {
    if (!ready || !$('#studio-root')) {
      pendingPreset = id;
      return;
    }
    const start = () => {
      design = fresh();
      if (id === 'ahead') {
        design.front[1].text = 'НА ШАГ ВПЕРЕДИ';
        design.front[1].h = 0.1;
        design.back = [
          {
            id: uid(),
            type: 'text',
            text: 'ОКЭИ /\nСВОЯ КОМАНДА',
            color: '#8b1634',
            font: 'Manrope',
            weight: 800,
            x: 0.5,
            y: 0.35,
            w: 0.9,
            h: 0.2,
            rotation: 0,
          },
        ];
        design.title = 'На шаг впереди';
      }
      side = 'front';
      selected = null;
      save();
      render();
    };
    if (
      revision > 0 &&
      !confirm('Заменить текущий черновик выбранным принтом? Скачай важный макет перед заменой.')
    )
      return;
    start();
  }
  async function loadDesign(d) {
    const owner = user;
    if (loading) await loading;
    if (user !== owner) throw Error('Пользователь изменился. Открытие макета отменено.');
    design = structuredClone(d);
    side = 'front';
    selected = null;
    save();
    render();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !$('#studio-root') || !ready) return;
    if (b.hasAttribute('data-s-upload')) {
      $('#s-image-input').click();
      return;
    }
    if (b.hasAttribute('data-s-add-text') || b.hasAttribute('data-s-add-logo')) {
      if (design[side].length >= 12) {
        toast('До 12 элементов на одной стороне.');
        return;
      }
      let o = b.hasAttribute('data-s-add-text')
        ? {
            id: uid(),
            type: 'text',
            text: 'ТВОЯ ИДЕЯ',
            color: '#8b1634',
            font: 'Manrope',
            weight: 800,
            x: 0.5,
            y: 0.5,
            w: 0.85,
            h: 0.1,
            rotation: 0,
          }
        : { ...fresh().front[0], id: uid() };
      design[side].push(o);
      selected = o.id;
      save();
      inspect();
      paint();
      return;
    }
    if (b.dataset.sSide) {
      side = b.dataset.sSide;
      selected = null;
      render();
      return;
    }
    if (b.dataset.sSelect) {
      selected = b.dataset.sSelect;
      inspect();
      paint();
      return;
    }
    if (b.dataset.sColor) {
      design.shirtColor = b.dataset.sColor;
      design.shirtColorName = colors.find((v) => v[0] === design.shirtColor)[1];
      save();
      render();
      return;
    }
    if (b.hasAttribute('data-s-delete')) {
      remove();
      return;
    }
    if (b.hasAttribute('data-s-center')) {
      const o = selectedObject();
      if (o) {
        o.x = 0.5;
        confine(o);
        save();
        paint();
      }
      return;
    }
    if (b.hasAttribute('data-s-layer')) {
      const o = selectedObject();
      if (o) {
        design[side] = design[side].filter((x) => x.id !== o.id).concat(o);
        save();
        inspect();
        paint();
      }
      return;
    }
    if (b.hasAttribute('data-s-clear')) {
      if (confirm('Удалить все элементы с этой стороны?')) {
        design[side] = [];
        selected = null;
        save();
        render();
      }
      return;
    }
    if (b.hasAttribute('data-s-export')) {
      exportSide();
      return;
    }
    if (b.hasAttribute('data-s-order'))
      review().catch(() => toast('Не удалось подготовить макет. Попробуй снова.'));
  });
  document.addEventListener('input', (e) => {
    if (!$('#studio-root') || !ready) return;
    const el = e.target,
      o = selectedObject();
    if (el.id === 's-text' && o) {
      const oldLines = Math.max(1, o.text.split('\n').length),
        newLines = Math.max(1, el.value.split('\n').length);
      o.h = Math.min(0.95, (o.h / oldLines) * newLines);
      o.text = el.value;
      confine(o);
      inspectLayers();
      save();
      paint();
    }
    if (el.id === 's-ink' && o) {
      o.color = el.value;
      save();
      paint();
    }
    if (el.id === 's-width' && o) {
      const old = o.w;
      o.w = Number(el.value) / 100;
      if (lockRatio || o.type === 'text') o.h = Math.min(0.95, (o.h * o.w) / old);
      confine(o);
      el.value = Math.round(o.w * 100);
      $('#s-width-label').textContent = el.value + '%';
      save();
      paint();
    }
    if (el.id === 's-rotation' && o) {
      o.rotation = Number(el.value);
      confine(o);
      $('#s-rotation-label').textContent = el.value + '°';
      $('#s-width').value = Math.round(o.w * 100);
      $('#s-width-label').textContent = Math.round(o.w * 100) + '%';
      save();
      paint();
    }
    if (el.id === 's-shirt-color') {
      design.shirtColor = el.value;
      design.shirtColorName = 'Свой цвет ' + el.value;
      $('#s-color-name').textContent = design.shirtColorName;
      save();
      paint();
    }
    if (el.id === 's-title') {
      design.title = el.value || 'Мой дизайн';
      save();
    }
    if (el.id === 's-count') {
      design.count = Number(el.value);
      $('#s-total').textContent = (design.count * 950).toLocaleString('ru-RU') + ' ₽';
      save();
    }
  });
  function inspectLayers() {
    if ($('#s-layer-list')) $('#s-layer-list').innerHTML = layersHTML();
  }
  document.addEventListener('change', (e) => {
    if (!$('#studio-root') || !ready) return;
    const el = e.target;
    if (el.id === 's-lock-ratio') {
      lockRatio = el.checked;
      return;
    }
    if (el.id === 's-image-input') addImage(el.files[0]);
    if (el.id === 's-font') {
      const o = selectedObject();
      if (o) {
        o.font = el.value;
        save();
        paint();
      }
    }
    if (el.id === 's-size') {
      design.size = el.value;
      save();
    }
    if (el.id === 's-count') {
      design.count = Math.min(30, Math.max(1, Math.round(Number(el.value) || 1)));
      el.value = design.count;
      $('#s-total').textContent = (design.count * 950).toLocaleString('ru-RU') + ' ₽';
      save();
    }
  });
  window.Studio = { view, mount, preset, loadDesign };
})();
