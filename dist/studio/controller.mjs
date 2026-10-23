import { createId as uid } from '../shared.mjs';
import { createStudioState, colors, area, fresh, confine } from './model.mjs';
import { createStudioStorage } from './storage.mjs';
import { createStudioViews } from './views.mjs';
import { createStudioCanvas } from './canvas.mjs';
import { bindStudioActions } from './actions.mjs';
export function createStudio({ document, indexedDB, notify, placeOrder }) {
  const state = createStudioState();
  const $ = (s) => document.querySelector(s);
  const { read, write } = createStudioStorage({ indexedDB });
  const views = createStudioViews(state);
  const { view, options, layersHTML } = views;
  const { image, shirtPath, paint, drawObject, bindCanvas } = createStudioCanvas(state, {
    document,
    toast,
    inspect,
    save,
    remove,
    resizeInspector,
  });
  const selectedObject = () => state.design?.[state.side].find((x) => x.id === state.selected);
  function toast(s) {
    notify(s);
  }
  function save() {
    state.revision++;
    const value = structuredClone(state.design),
      owner = state.user;
    state.saveQueue = state.saveQueue
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
  async function mount(id) {
    if (!$('#studio-root')) return;
    if (state.user !== id || !state.design) {
      state.user = id;
      state.ready = false;
      state.revision = 0;
      state.selected = null;
      state.side = 'front';
      state.loading = read(id)
        .then((v) => {
          if (state.user !== id) return;
          state.design = v?.version === 1 ? v : fresh();
          state.ready = true;
        })
        .catch(() => {
          if (state.user !== id) return;
          state.design = fresh();
          state.ready = true;
          toast('Черновик недоступен. Открыт новый макет.');
        });
    }
    if (state.loading) await state.loading;
    if (!$('#studio-root') || state.user !== id) return;
    $('#studio-root').setAttribute('aria-busy', 'false');
    render();
    if (state.pendingPreset) {
      const p = state.pendingPreset;
      state.pendingPreset = null;
      preset(p);
    }
  }
  function render() {
    const root = $('#studio-root');
    if (!root || !state.design) return;
    root.innerHTML = views.layoutHTML();
    state.canvas = $('#s-canvas');
    state.ctx = state.canvas.getContext('2d');
    bindCanvas();
    paint();
  }
  function syncCounts() {
    const el = $('#s-layer-count');
    if (el) el.textContent = state.design[state.side].length;
    for (const key of ['front', 'back']) {
      const n = $('[data-s-side="' + key + '"] small');
      if (n) n.textContent = state.design[key].length;
    }
  }
  function inspect() {
    syncCounts();
    if ($('#s-inspector')) $('#s-inspector').innerHTML = options();
    if ($('#s-layer-list')) $('#s-layer-list').innerHTML = layersHTML();
  }
  function resizeInspector() {
    const o = selectedObject();
    if (!o) return;
    const el = $('#s-width');
    if (el) el.value = Math.round(o.w * 100);
    if ($('#s-width-label')) $('#s-width-label').textContent = Math.round(o.w * 100) + '%';
  }
  function remove() {
    state.design[state.side] = state.design[state.side].filter((o) => o.id !== state.selected);
    state.selected = null;
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
    if (state.design[state.side].length >= 12) {
      toast('На одной стороне можно разместить до 12 элементов.');
      return;
    }
    const originalSide = state.side,
      originalUser = state.user;
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
      if (state.user !== originalUser) return;
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
      state.design[originalSide].push(o);
      state.side = originalSide;
      state.selected = o.id;
      save();
      render();
      toast('Изображение добавлено. Перетащи его на футболке.');
    } catch {
      toast('Не удалось прочитать изображение. Попробуй другой файл.');
    }
  }
  async function exportSide() {
    if (!state.design[state.side].length) {
      toast('На этой стороне пока нет принта. Добавь элемент или выбери другую сторону.');
      return;
    }
    try {
      const c = document.createElement('canvas');
      c.width = 2400;
      c.height = 3368;
      for (const o of state.design[state.side])
        await drawObject(c.getContext('2d'), o, { x: 0, y: 0, w: c.width, h: c.height });
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      download(blob, 'okei-print-' + state.side + '.png');
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
    if (!state.design.front.length && !state.design.back.length) {
      toast('Добавь изображение или текст хотя бы на одну сторону.');
      return;
    }
    if (
      !Number.isInteger(state.design.count) ||
      state.design.count < 1 ||
      state.design.count > 30
    ) {
      toast('Укажи количество от 1 до 30.');
      return;
    }
    const snapshot = structuredClone(state.design),
      version = state.revision,
      targetUser = state.user,
      reviewToken = ++state.loadToken;
    const root = $('#s-review');
    root.hidden = false;
    root.innerHTML = '<p>Готовим макет…</p>';
    const blob = await previewBlob(snapshot);
    if (!root.isConnected || state.user !== targetUser || state.loadToken !== reviewToken) return;
    const url = URL.createObjectURL(blob);
    root.innerHTML = views.reviewHTML(snapshot, url);
    const box = $('.s-review-box');
    box.focus();
    root.onclick = async (e) => {
      if (e.target === root || e.target.closest('[data-s-review-close]')) {
        root.hidden = true;
        URL.revokeObjectURL(url);
        $('[data-s-order]')?.focus();
        return;
      }
      if (e.target.closest('#s-confirm-order') && !state.saving) {
        if (state.user !== targetUser || state.revision !== version) {
          toast('Макет изменён. Проверь его ещё раз.');
          root.hidden = true;
          URL.revokeObjectURL(url);
          return;
        }
        state.saving = true;
        const b = $('#s-confirm-order');
        b.disabled = true;
        b.textContent = 'Сохраняем макет…';
        try {
          await placeOrder(snapshot, blob);
          URL.revokeObjectURL(url);
        } catch {
          toast('Заказ не сохранился. Попробуй ещё раз.');
          b.disabled = false;
          b.textContent = 'Подтвердить заказ';
        } finally {
          state.saving = false;
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
    if (!state.ready || !$('#studio-root')) {
      state.pendingPreset = id;
      return;
    }
    const start = () => {
      state.design = fresh();
      if (id === 'ahead') {
        state.design.front[1].text = 'НА ШАГ ВПЕРЕДИ';
        state.design.front[1].h = 0.1;
        state.design.back = [
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
        state.design.title = 'На шаг впереди';
      }
      state.side = 'front';
      state.selected = null;
      save();
      render();
    };
    if (
      state.revision > 0 &&
      !confirm('Заменить текущий черновик выбранным принтом? Скачай важный макет перед заменой.')
    )
      return;
    start();
  }
  async function loadDesign(d) {
    const owner = state.user;
    if (state.loading) await state.loading;
    if (state.user !== owner) throw Error('Пользователь изменился. Открытие макета отменено.');
    state.design = structuredClone(d);
    state.side = 'front';
    state.selected = null;
    save();
    render();
  }
  function inspectLayers() {
    if ($('#s-layer-list')) $('#s-layer-list').innerHTML = layersHTML();
  }
  bindStudioActions(state, {
    document,
    controller: {
      save,
      render,
      inspect,
      paint,
      remove,
      exportSide,
      review,
      addImage,
      inspectLayers,
      toast,
    },
  });
  return { view, mount, preset, loadDesign };
}
