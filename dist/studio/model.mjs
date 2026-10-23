import { createId as uid } from '../shared.mjs';
export const colors = [
  ['#f5f3ed', 'Молочный'],
  ['#243348', 'Графитовый'],
  ['#9f243b', 'Бордовый'],
  ['#d7c7c4', 'Пудровый'],
  ['#c4c0bd', 'Серый'],
];
export const area = { x: 246, y: 265, w: 228, h: 320 };
export const handles = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
export function createStudioState() {
  return {
    user: '',
    design: null,
    selected: null,
    canvas: null,
    ctx: null,
    side: 'front',
    drag: null,
    loading: null,
    revision: 0,
    saving: false,
    ready: false,
    pendingPreset: null,
    loadToken: 0,
    lockRatio: true,
    saveQueue: Promise.resolve(),
  };
}
export function fresh() {
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
export function confine(o) {
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
export function localPoint(o, p) {
  const a = (-(o.rotation || 0) * Math.PI) / 180,
    dx = p.x - (area.x + o.x * area.w),
    dy = p.y - (area.y + o.y * area.h);
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}
export function point(e, r) {
  return { x: ((e.clientX - r.left) * 720) / r.width, y: ((e.clientY - r.top) * 900) / r.height };
}
export function hitHandle(o, p, width) {
  if (!o) return null;
  const q = localPoint(o, p),
    radius = Math.max(11, (9 * 720) / width);
  return handles.find(
    ([sx, sy]) =>
      Math.abs(q.x - (sx * o.w * area.w) / 2) < radius &&
      Math.abs(q.y - (sy * o.h * area.h) / 2) < radius,
  );
}
export function moveObject(o, drag, p, lockRatio) {
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
        sx && sy ? 1 + (sx * lx * ow + sy * ly * oh) / (ow * ow + oh * oh) : sx ? w / ow : h / oh;
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
}
