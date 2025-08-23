import { gpSettings } from './settings.js';

function cssVar(name, fallback = '') {
  const r = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (r) return r;
  const b = getComputedStyle(document.body).getPropertyValue(name).trim();
  return b || fallback;
}
function themeUnderlineColor() {
  return cssVar('--SmartThemeUnderlineColor', '#7aa2f7');
}
function themeQuoteColor() {
  return cssVar('--SmartThemeQuoteColor', '#7aa2f7');
}

function getTransitionMs() {
  const d = gpSettings().slideshowSpeedSec || 3;
  let ms = Math.round((d * 1000) / 3);
  if (!Number.isFinite(ms) || ms < 450) ms = 450;
  if (ms < 1000) ms = 1000;
  return ms;
}

function ensureLayerWrap(root, baseImg) {
  let wrap = baseImg.parentElement;
  if (!wrap || !wrap.classList?.contains('gp-layer-wrap')) {
    const w = document.createElement('div');
    w.className = 'gp-layer-wrap';
    baseImg.replaceWith(w);
    w.appendChild(baseImg);
    wrap = w;
  }
  baseImg.classList.add('gp-layer', 'base');
  return wrap;
}

export function transitionTo(root, baseImg, nextSrc) {
  const mode = root.dataset.gpTransition || gpSettings().slideshowTransition || 'crossfade';
  switch (mode) {
    case 'spiral':
      transitionSpiralSVG(root, baseImg, nextSrc, () => { baseImg.src = nextSrc; });
      break;
    case 'pushX':
      transitionPush(root, baseImg, nextSrc, true, () => { baseImg.src = nextSrc; });
      break;
    case 'pushY':
      transitionPush(root, baseImg, nextSrc, false, () => { baseImg.src = nextSrc; });
      break;
    case 'crossfade':
    default:
      transitionCrossfade(root, baseImg, nextSrc, () => { baseImg.src = nextSrc; });
      break;
  }
}

export function transitionCrossfade(root, baseImg, nextSrc, done) {
  const wrap = ensureLayerWrap(root, baseImg);
  const next = document.createElement('img');
  next.className = 'gp-layer next';
  next.src = nextSrc;
  next.style.opacity = '0';
  wrap.appendChild(next);

  const ms = getTransitionMs();
  next.style.transition = `opacity ${ms}ms ease`;
  requestAnimationFrame(() => { next.style.opacity = '1'; });
  setTimeout(() => { baseImg.src = nextSrc; next.remove(); done?.(); }, ms + 30);
}

export function transitionPush(root, baseImg, nextSrc, horizontal, done) {
  const wrap = ensureLayerWrap(root, baseImg);
  const next = document.createElement('img');
  next.className = 'gp-layer next';
  next.src = nextSrc;
  wrap.appendChild(next);

  const ms = getTransitionMs();
  const axis = horizontal ? 'X' : 'Y';
  next.style.transform = `translate${axis}(100%)`;
  baseImg.style.transform = `translate${axis}(0%)`;
  next.style.transition = `transform ${ms}ms ease`;
  baseImg.style.transition = `transform ${ms}ms ease, opacity ${ms}ms ease`;

  requestAnimationFrame(() => {
    next.style.transform = `translate${axis}(0%)`;
    baseImg.style.transform = `translate${axis}(-100%)`;
  });

  setTimeout(() => {
    baseImg.style.transform = '';
    baseImg.src = nextSrc;
    next.remove();
    done?.();
  }, ms + 30);
}

export function transitionSpiralSVG(root, baseImg, nextSrc, done) {
  const wrap = ensureLayerWrap(root, baseImg);

  // Holder
  const holder = document.createElement('div');
  holder.className = 'gp-spiral-svg-holder';
  wrap.appendChild(holder);

  // SVG (fixed 1000x1000 space for stable geometry)
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('gp-spiral-svg');

  // defs + mask (keep the white stroke ONLY inside this mask)
  const defs = document.createElementNS(SVG_NS, 'defs');
  const mask = document.createElementNS(SVG_NS, 'mask');
  const maskId = 'gpMask_' + Math.random().toString(36).slice(2);
  mask.setAttribute('id', maskId);
  mask.setAttribute('maskUnits', 'userSpaceOnUse');

  const maskRect = document.createElementNS(SVG_NS, 'rect');
  maskRect.setAttribute('x', '0');
  maskRect.setAttribute('y', '0');
  maskRect.setAttribute('width', '1000');
  maskRect.setAttribute('height', '1000');
  maskRect.setAttribute('fill', 'black');

  // Build an Archimedean spiral path in user-space
  const cX = 500, cY = 500;
  const turns = 4.25;
  const a = 0;
  const b = 14;
  const step = 0.08;

  const maskPath = document.createElementNS(SVG_NS, 'path');
  maskPath.setAttribute('fill', 'none');
  maskPath.setAttribute('stroke', 'white');
  maskPath.setAttribute('stroke-linecap', 'round');

  let d = '';
  let started = false;
  for (let t = 0; t <= Math.PI * 2 * turns; t += step) {
    const r = a + b * t;
    const x = cX + r * Math.cos(t);
    const y = cY + r * Math.sin(t);
    d += (started ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
    started = true;
  }
  maskPath.setAttribute('d', d);

  // Assemble defs/mask
  mask.appendChild(maskRect);
  mask.appendChild(maskPath);
  defs.appendChild(mask);
  svg.appendChild(defs);

  // Next image, revealed by the mask
  const img = document.createElementNS(SVG_NS, 'image');
  img.setAttributeNS(XLINK_NS, 'href', nextSrc);
  img.setAttribute('x', '0');
  img.setAttribute('y', '0');
  img.setAttribute('width', '1000');
  img.setAttribute('height', '1000');
  img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  img.setAttribute('mask', `url(#${maskId})`);

  // Themed spiral outline (visible)
  const outlinePath = document.createElementNS(SVG_NS, 'path');
  outlinePath.setAttribute('d', d);
  outlinePath.setAttribute('fill', 'none');
  outlinePath.setAttribute('stroke', themeQuoteColor());
  outlinePath.setAttribute('stroke-linecap', 'round');
  outlinePath.setAttribute('opacity', '0.75');

  // Spin group (rotate image+mask for subtle twist)
  const spin = document.createElementNS(SVG_NS, 'g');
  spin.setAttribute('transform-origin', '500 500');
  spin.appendChild(img);

  // Separate group for outline so it rotates in sync
  const spinOutline = document.createElementNS(SVG_NS, 'g');
  spinOutline.setAttribute('transform-origin', '500 500');
  spinOutline.appendChild(outlinePath);

  svg.appendChild(spin);
  svg.appendChild(spinOutline);
  holder.appendChild(svg);

  // Animate dash sweep + stroke growth + rotation
  const ms = getTransitionMs();

  requestAnimationFrame(() => {
    const len = (maskPath.getTotalLength?.() || 3000);

    maskPath.style.strokeDasharray = String(len);
    maskPath.style.strokeDashoffset = String(len);
    maskPath.style.strokeWidth = '2';

    outlinePath.style.strokeDasharray = String(len);
    outlinePath.style.strokeDashoffset = String(len);
    outlinePath.style.strokeWidth = '4';

    const pathTrans = `stroke-dashoffset ${ms}ms ease, stroke-width ${ms}ms ease, opacity ${ms}ms ease`;
    maskPath.style.transition = pathTrans;
    outlinePath.style.transition = pathTrans;

    spin.style.transition = `transform ${ms}ms ease`;
    spinOutline.style.transition = `transform ${ms}ms ease, opacity ${ms}ms ease`;

    requestAnimationFrame(() => {
      maskPath.style.strokeDashoffset = '0';
      maskPath.style.strokeWidth = '900';

      outlinePath.style.strokeDashoffset = '0';
      outlinePath.style.strokeWidth = '24';
      outlinePath.style.opacity = '0';

      spin.style.transform = 'rotate(360deg)';
      spinOutline.style.transform = 'rotate(360deg)';
    });
  });

  setTimeout(() => {
    baseImg.src = nextSrc;
    holder.remove();
    done?.();
  }, ms + 40);
}
