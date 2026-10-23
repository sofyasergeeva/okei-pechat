import { escapeHTML as esc } from '../shared.mjs';
import { colors } from './model.mjs';
export function createStudioViews(state) {
  function view() {
    return (
      `<header class="c-page-heading s-heading">` +
      `<div>` +
      `<span class="c-kicker">Твоя футболка. Твои правила.</span>` +
      `<h1>Создай что-то своё<span class="v-red-dot">.</span>` +
      `</h1>` +
      `<p>Изображения, текст и цвет.</p>` +
      `</div>` +
      `<button class="c-text-btn" data-c-page="merch">← К коллекции</button>` +
      `</header>` +
      `<div id="studio-root" aria-busy="true">` +
      `<p class="c-hint">Открываем конструктор…</p>` +
      `</div>`
    );
  }
  function options() {
    const o = state.design[state.side].find((x) => x.id === state.selected);
    return (
      `<span class="c-kicker">${o ? 'Выбранный элемент' : 'Настройка макета'}</span>` +
      `<h3>${o ? esc(o.type === 'text' ? 'Текст' : 'Изображение') : 'Нажми на принт'}</h3>${
        o
          ? `${
              o.type === 'text'
                ? `<label class="c-field">` +
                  `<span>Текст</span>` +
                  `<textarea id="s-text" maxlength="100" rows="2">${esc(o.text)}</textarea>` +
                  `</label>` +
                  `<div class="s-field-pair">` +
                  `<label class="c-field">` +
                  `<span>Цвет</span>` +
                  `<input type="color" id="s-ink" value="${o.color}">` +
                  `</label>` +
                  `<label class="c-field">` +
                  `<span>Шрифт</span>` +
                  `<select id="s-font">` +
                  `<option value="Manrope" ${o.font === 'Manrope' ? 'selected' : ''}>Гротеск</option>` +
                  `<option value="Georgia" ${o.font === 'Georgia' ? 'selected' : ''}>Антиква</option>` +
                  `<option value="monospace" ${o.font === 'monospace' ? 'selected' : ''}>Моноширинный</option>` +
                  `</select>` +
                  `</label>` +
                  `</div>`
                : `<p class="c-hint s-file-name">${esc(o.label)}</p>`
            }${
              o.type === 'image'
                ? `<label class="s-ratio">` +
                  `<input type="checkbox" id="s-lock-ratio" ${state.lockRatio ? 'checked' : ''}>Сохранять пропорции</label>` +
                  `<p class="s-resize-help">Тяни за маркеры. Без пропорций ширина и высота меняются отдельно.</p>`
                : ''
            }<label class="c-field">` +
            `<span>Размер <b id="s-width-label">${Math.round(o.w * 100)}%</b>` +
            `</span>` +
            `<input id="s-width" type="range" min="15" max="100" value="${Math.round(o.w * 100)}">` +
            `</label>` +
            `<label class="c-field">` +
            `<span>Поворот <b id="s-rotation-label">${o.rotation || 0}°</b>` +
            `</span>` +
            `<input id="s-rotation" type="range" min="-45" max="45" value="${o.rotation || 0}">` +
            `</label>` +
            `<div class="s-align">` +
            `<button data-s-center>По центру</button>` +
            `<button data-s-layer>На передний план</button>` +
            `</div>` +
            `<button class="s-delete" data-s-delete>Удалить элемент ×</button>`
          : '<p class="c-hint">Выбери принт на футболке.</p>'
      }<div class="s-order-settings">` +
      `<label class="c-field">` +
      `<span>Название дизайна</span>` +
      `<input id="s-title" maxlength="40" value="${esc(state.design.title)}">` +
      `</label>` +
      `<div class="s-field-pair">` +
      `<label class="c-field">` +
      `<span>Размер футболки</span>` +
      `<select id="s-size">${['XS', 'S', 'M', 'L', 'XL'].map((v) => `<option ${v === state.design.size ? 'selected' : ''}>${v}</option>`).join('')}</select>` +
      `</label>` +
      `<label class="c-field">` +
      `<span>Количество</span>` +
      `<input type="number" id="s-count" min="1" max="30" value="${state.design.count}">` +
      `</label>` +
      `</div>` +
      `<div class="s-total">` +
      `<span>Футболка + принт</span>` +
      `<b id="s-total">${(state.design.count * 950).toLocaleString('ru-RU')} ₽</b>` +
      `</div>` +
      `<button class="btn primary s-order" data-s-order>Заказать свой принт <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M5 19 19 5M5 5h14v14"/>` +
      `</svg>` +
      `</button>` +
      `<p class="c-hint s-price-note">950 ₽ / шт. — пример цены, печать с двух сторон включена. Ткань, цвет и итог подтвердит сотрудник. Оплата при получении.</p>` +
      `</div>`
    );
  }
  function layersHTML() {
    return state.design[state.side].length
      ? state.design[state.side]
          .map(
            (o) =>
              `<button data-s-select="${o.id}" class="${o.id === state.selected ? 'active' : ''}">` +
              `<span>${o.type === 'text' ? 'T' : '▧'}</span>` +
              `<b>${esc(o.type === 'text' ? o.text : o.label)}</b>` +
              `<i>` +
              `<svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
              `<path d="M5 19 19 5M5 5h14v14"/>` +
              `</svg>` +
              `</i>` +
              `</button>`,
          )
          .join('')
      : '<p class="c-hint">Пока пусто. Добавь изображение или текст.</p>';
  }
  function layoutHTML() {
    return (
      `<div class="s-layout">` +
      `<aside class="s-tools">` +
      `<div class="s-tool-title">` +
      `<span class="c-kicker">Твой дизайн</span>` +
      `<span id="s-save-status">Сохранение в браузере</span>` +
      `</div>` +
      `<button class="s-add-image" data-s-upload>` +
      `<span>↥</span>` +
      `<b>Добавить изображение<small>PNG, JPG, WEBP · до 10 МБ</small>` +
      `</b>` +
      `<i>+</i>` +
      `</button>` +
      `<input type="file" id="s-image-input" accept="image/png,image/jpeg,image/webp" hidden>` +
      `<button class="s-tool-button" data-s-add-text>` +
      `<span>T</span>Добавить текст <i>+</i>` +
      `</button>` +
      `<button class="s-tool-button" data-s-add-logo>Добавить логотип ОКЭИ <i>` +
      `<svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M5 19 19 5M5 5h14v14"/>` +
      `</svg>` +
      `</i>` +
      `</button>` +
      `<div class="s-color-tools">` +
      `<h3>Цвет футболки</h3>` +
      `<div class="s-swatches">${colors.map(([c, n]) => `<button aria-label="${n}" aria-pressed="${state.design.shirtColor === c}" data-s-color="${c}" style="--swatch:${c}">${state.design.shirtColor === c ? '✓' : ''}</button>`).join('')}<label class="s-custom-color" title="Свой цвет">` +
      `<span>+</span>` +
      `<input type="color" id="s-shirt-color" value="${state.design.shirtColor}" aria-label="Свой цвет футболки">` +
      `</label>` +
      `</div>` +
      `<span id="s-color-name">${esc(state.design.shirtColorName)}</span>` +
      `</div>` +
      `<div class="s-layers">` +
      `<h3>Элементы <span id="s-layer-count">${state.design[state.side].length}</span>` +
      `</h3>` +
      `<div id="s-layer-list">${layersHTML()}</div>` +
      `</div>` +
      `<p class="s-help">Тяни принт и маркеры. Стрелки клавиатуры — для точного сдвига.</p>` +
      `<button class="c-text-btn s-clear" data-s-clear>Очистить эту сторону ↺</button>` +
      `</aside>` +
      `<section class="s-stage-panel">` +
      `<div class="s-stage-top">` +
      `<div class="s-side-switch" role="group" aria-label="Сторона футболки">` +
      `<button data-s-side="front" aria-pressed="${state.side === 'front'}" class="${state.side === 'front' ? 'active' : ''}">Спереди <small>${state.design.front.length}</small>` +
      `</button>` +
      `<button data-s-side="back" aria-pressed="${state.side === 'back'}" class="${state.side === 'back' ? 'active' : ''}">Сзади <small>${state.design.back.length}</small>` +
      `</button>` +
      `</div>` +
      `<span class="s-stage-index">СТУДИЯ ОКЭИ / 01</span>` +
      `</div>` +
      `<div class="s-canvas-wrap">` +
      `<canvas id="s-canvas" width="720" height="900" tabindex="0" aria-label="Макет футболки. Выбери элемент мышью, перемещай стрелками на клавиатуре.">` +
      `</canvas>` +
      `<span class="s-stage-sticker" aria-hidden="true">${state.side === 'front' ? 'ТВОЙ<br>ХАРАКТЕР' : 'ДРУГАЯ<br>СТОРОНА'}</span>` +
      `</div>` +
      `<div class="s-stage-bottom">` +
      `<span>` +
      `<i>` +
      `</i> Пунктир — область печати</span>` +
      `<button class="c-text-btn" data-s-export>Скачать принт PNG ↓</button>` +
      `</div>` +
      `<small class="s-preview-note">${state.side === 'back' ? 'Условный вид сзади: та же фотоподложка. ' : ''}Цвет на экране — ориентир. Реальный оттенок ткани может отличаться.</small>` +
      `</section>` +
      `<aside class="s-inspector" id="s-inspector">${options()}</aside>` +
      `</div>` +
      `<div class="s-review" id="s-review" hidden>` +
      `</div>`
    );
  }
  function reviewHTML(snapshot, url) {
    return (
      `<div class="s-review-box" role="dialog" aria-modal="true" aria-labelledby="s-review-title" tabindex="-1">` +
      `<button class="s-review-close" data-s-review-close aria-label="Закрыть проверку макета">×</button>` +
      `<span class="c-kicker">Проверь обе стороны</span>` +
      `<h2 id="s-review-title">Всё на своих местах?</h2>` +
      `<img src="${url}" alt="Макет передней и задней стороны футболки">` +
      `<p>${esc(snapshot.shirtColorName)} · ${snapshot.size} · ${snapshot.count} шт.</p>` +
      `<strong>${(snapshot.count * 950).toLocaleString('ru-RU')} ₽ <small>демонстрационная стоимость</small>` +
      `</strong>` +
      `<p class="c-hint">Макет сохранится вместе с заказом в этом браузере. Реальная отправка сотруднику пока не подключена.</p>` +
      `<button class="btn primary" id="s-confirm-order">Подтвердить заказ <svg class="ui-icon ui-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M5 19 19 5M5 5h14v14"/>` +
      `</svg>` +
      `</button>` +
      `</div>`
    );
  }
  return { view, options, layersHTML, layoutHTML, reviewHTML };
}
