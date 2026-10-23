import { createId as uid } from '../shared.mjs';
import { colors, fresh, confine } from './model.mjs';
export function bindStudioActions(state, { document, controller }) {
  const $ = (s) => document.querySelector(s);
  const selectedObject = () => state.design?.[state.side].find((x) => x.id === state.selected);
  const {
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
  } = controller;
  function chooseImage() {
    $('#s-image-input').click();
  }
  function addElement(b) {
    if (state.design[state.side].length >= 12) {
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
    state.design[state.side].push(o);
    state.selected = o.id;
    save();
    inspect();
    paint();
  }
  function switchSide(b) {
    state.side = b.dataset.sSide;
    state.selected = null;
    render();
  }
  function selectLayer(b) {
    state.selected = b.dataset.sSelect;
    inspect();
    paint();
  }
  function chooseColor(b) {
    state.design.shirtColor = b.dataset.sColor;
    state.design.shirtColorName = colors.find((v) => v[0] === state.design.shirtColor)[1];
    save();
    render();
  }
  function deleteElement() {
    remove();
  }
  function centerElement() {
    const o = selectedObject();
    if (o) {
      o.x = 0.5;
      confine(o);
      save();
      paint();
    }
  }
  function raiseLayer() {
    const o = selectedObject();
    if (o) {
      state.design[state.side] = state.design[state.side].filter((x) => x.id !== o.id).concat(o);
      save();
      inspect();
      paint();
    }
  }
  function clearSide() {
    if (confirm('Удалить все элементы с этой стороны?')) {
      state.design[state.side] = [];
      state.selected = null;
      save();
      render();
    }
  }
  function downloadPrint() {
    exportSide();
  }
  function editText(el, o) {
    const oldLines = Math.max(1, o.text.split('\n').length),
      newLines = Math.max(1, el.value.split('\n').length);
    o.h = Math.min(0.95, (o.h / oldLines) * newLines);
    o.text = el.value;
    confine(o);
    inspectLayers();
    save();
    paint();
  }
  function changeInk(el, o) {
    o.color = el.value;
    save();
    paint();
  }
  function resizeElement(el, o) {
    const old = o.w;
    o.w = Number(el.value) / 100;
    if (state.lockRatio || o.type === 'text') o.h = Math.min(0.95, (o.h * o.w) / old);
    confine(o);
    el.value = Math.round(o.w * 100);
    $('#s-width-label').textContent = el.value + '%';
    save();
    paint();
  }
  function rotateElement(el, o) {
    o.rotation = Number(el.value);
    confine(o);
    $('#s-rotation-label').textContent = el.value + '°';
    $('#s-width').value = Math.round(o.w * 100);
    $('#s-width-label').textContent = Math.round(o.w * 100) + '%';
    save();
    paint();
  }
  function changeShirtColor(el) {
    state.design.shirtColor = el.value;
    state.design.shirtColorName = 'Свой цвет ' + el.value;
    $('#s-color-name').textContent = state.design.shirtColorName;
    save();
    paint();
  }
  function renameDesign(el) {
    state.design.title = el.value || 'Мой дизайн';
    save();
  }
  function editCount(el) {
    state.design.count = Number(el.value);
    $('#s-total').textContent = (state.design.count * 950).toLocaleString('ru-RU') + ' ₽';
    save();
  }
  function setRatioLock(el) {
    state.lockRatio = el.checked;
  }
  function changeFont(el) {
    const o = selectedObject();
    if (o) {
      o.font = el.value;
      save();
      paint();
    }
  }
  function changeSize(el) {
    state.design.size = el.value;
    save();
  }
  function commitCount(el) {
    state.design.count = Math.min(30, Math.max(1, Math.round(Number(el.value) || 1)));
    el.value = state.design.count;
    $('#s-total').textContent = (state.design.count * 950).toLocaleString('ru-RU') + ' ₽';
    save();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !$('#studio-root') || !state.ready) return;
    if (b.hasAttribute('data-s-upload')) {
      return chooseImage();
    }
    if (b.hasAttribute('data-s-add-text') || b.hasAttribute('data-s-add-logo')) {
      return addElement(b);
    }
    if (b.dataset.sSide) {
      return switchSide(b);
    }
    if (b.dataset.sSelect) {
      return selectLayer(b);
    }
    if (b.dataset.sColor) {
      return chooseColor(b);
    }
    if (b.hasAttribute('data-s-delete')) {
      return deleteElement();
    }
    if (b.hasAttribute('data-s-center')) {
      return centerElement();
    }
    if (b.hasAttribute('data-s-layer')) {
      return raiseLayer();
    }
    if (b.hasAttribute('data-s-clear')) {
      return clearSide();
    }
    if (b.hasAttribute('data-s-export')) {
      return downloadPrint();
    }
    if (b.hasAttribute('data-s-order'))
      review().catch(() => toast('Не удалось подготовить макет. Попробуй снова.'));
  });
  document.addEventListener('input', (e) => {
    if (!$('#studio-root') || !state.ready) return;
    const el = e.target,
      o = selectedObject();
    if (el.id === 's-text' && o) {
      editText(el, o);
    }
    if (el.id === 's-ink' && o) {
      changeInk(el, o);
    }
    if (el.id === 's-width' && o) {
      resizeElement(el, o);
    }
    if (el.id === 's-rotation' && o) {
      rotateElement(el, o);
    }
    if (el.id === 's-shirt-color') {
      changeShirtColor(el);
    }
    if (el.id === 's-title') {
      renameDesign(el);
    }
    if (el.id === 's-count') {
      editCount(el);
    }
  });
  document.addEventListener('change', (e) => {
    if (!$('#studio-root') || !state.ready) return;
    const el = e.target;
    if (el.id === 's-lock-ratio') {
      setRatioLock(el);
    }
    if (el.id === 's-image-input') addImage(el.files[0]);
    if (el.id === 's-font') {
      changeFont(el);
    }
    if (el.id === 's-size') {
      changeSize(el);
    }
    if (el.id === 's-count') {
      commitCount(el);
    }
  });
}
