import {
  area,
  colors,
  handles,
  confine,
  localPoint,
  moveObject,
  point as canvasPoint,
  hitHandle as findHandle,
} from './model.mjs';
export function createStudioCanvas(state, { toast, inspect, save, remove, resizeInspector }) {
  const cache = new Map();
  let paints = 0;
  const selectedObject = () => state.design?.[state.side].find((x) => x.id === state.selected);
  const point = (e) => canvasPoint(e, state.canvas.getBoundingClientRect());
  const hitHandle = (o, p) => findHandle(o, p, state.canvas.getBoundingClientRect().width);
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
  async function paint() {
    if (!state.canvas?.isConnected || !state.design) return;
    const token = ++paints,
      current = state.canvas,
      d = structuredClone(state.design),
      objects = d[state.side];
    try {
      const assets = await Promise.all([
        image('/assets/college-shirt.png'),
        ...objects.filter((o) => o.type === 'image').map((o) => image(o.src)),
      ]);
      if (token !== paints || current !== state.canvas || !current.isConnected) return;
      state.ctx.clearRect(0, 0, 720, 900);
      state.ctx.drawImage(assets[0], 0, 0, 720, 900);
      if (d.shirtColor !== colors[0][0]) {
        state.ctx.save();
        shirtPath(state.ctx);
        state.ctx.clip();
        state.ctx.globalCompositeOperation = 'multiply';
        state.ctx.fillStyle = d.shirtColor;
        state.ctx.fillRect(0, 0, 720, 900);
        state.ctx.restore();
      }
      state.ctx.save();
      state.ctx.strokeStyle = '#36577c66';
      state.ctx.setLineDash([4, 5]);
      state.ctx.lineWidth = 1;
      state.ctx.strokeRect(area.x, area.y, area.w, area.h);
      state.ctx.restore();
      for (const o of objects) {
        await drawObject(state.ctx, o, area);
        if (o.id === state.selected) {
          state.ctx.save();
          state.ctx.translate(area.x + o.x * area.w, area.y + o.y * area.h);
          state.ctx.rotate(((o.rotation || 0) * Math.PI) / 180);
          state.ctx.strokeStyle = '#7c293f';
          state.ctx.lineWidth = 1.5;
          state.ctx.setLineDash([4, 3]);
          state.ctx.strokeRect(
            (-o.w * area.w) / 2,
            (-o.h * area.h) / 2,
            o.w * area.w,
            o.h * area.h,
          );
          state.ctx.setLineDash([]);
          for (const [sx, sy] of handles) {
            state.ctx.fillStyle = '#fffaf6';
            state.ctx.fillRect((sx * o.w * area.w) / 2 - 5, (sy * o.h * area.h) / 2 - 5, 10, 10);
            state.ctx.strokeRect((sx * o.w * area.w) / 2 - 5, (sy * o.h * area.h) / 2 - 5, 10, 10);
          }
          state.ctx.restore();
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
  function startDrag(e) {
    const p = point(e),
      chosen = selectedObject(),
      handle = hitHandle(chosen, p);
    let o = handle
      ? chosen
      : [...state.design[state.side]].reverse().find((o) => {
          const q = localPoint(o, p);
          return Math.abs(q.x) < (o.w * area.w) / 2 + 5 && Math.abs(q.y) < (o.h * area.h) / 2 + 5;
        });
    state.selected = o?.id || null;
    inspect();
    paint();
    state.canvas.focus({ preventScroll: true });
    if (o) {
      e.preventDefault();
      state.drag = { id: o.id, point: p, original: structuredClone(o), handle };
      state.canvas.setPointerCapture(e.pointerId);
    }
  }
  function movePointer(e) {
    const p = point(e);
    if (!state.drag) {
      const h = hitHandle(selectedObject(), p);
      state.canvas.style.cursor = h
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
    moveObject(o, state.drag, p, state.lockRatio);
    confine(o);
    resizeInspector();
    paint();
  }
  function moveWithKeyboard(e) {
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
  }
  function bindCanvas() {
    state.canvas.addEventListener('pointerdown', startDrag);
    state.canvas.addEventListener('pointermove', movePointer);
    function end() {
      if (state.drag) {
        state.drag = null;
        save();
      }
    }
    state.canvas.addEventListener('pointerup', end);
    state.canvas.addEventListener('pointercancel', end);
    state.canvas.addEventListener('keydown', moveWithKeyboard);
  }
  return { image, shirtPath, paint, drawObject, bindCanvas };
}
