/* GalleryPlus — SillyTavern extension
 * Final build with:
 * - Left controls (💾, 🔍, ⏯️, ⛶ + speed slider + transition select)
 * - Scroll-wheel zoom (hover-zoom optional) + click-to-drag panning when hover-zoom is OFF
 * - Slideshow (crossfade / spiral(SVG sweep) / push-horizontal / push-vertical)
 * - Preload next image, keyboard nav, theme glows, fullscreen toggle
 * - MovingUI drag/resize respected
 */

(() => {
  'use strict';

  const EXT_ID = 'GalleryPlus';

  // -------------------------------
  // Settings
  // -------------------------------
  const DEFAULTS = {
    enabled: true,
    diag: Date.now(),
    openHeight: 800,
    hoverZoom: false,          // false => scroll-zoom + click-drag pan
    hoverZoomScale: 1.08,      // used if hoverZoom:true
    viewerRect: null,
    masonryDense: false,
    showCaptions: true,
    webpOnly: false,
    slideshowSpeedSec: 3,
    slideshowTransition: 'crossfade', // 'crossfade' | 'spiral' | 'pushX' | 'pushY'
  };

  function ctx() {
    try {
      return window.SillyTavern?.getContext?.();
    } catch {
      return null;
    }
  }

  function _settingsBag() {
    const c = ctx();
    if (c?.extensionSettings) {
      if (!c.extensionSettings[EXT_ID]) {
        c.extensionSettings[EXT_ID] = { ...DEFAULTS };
      }
      return c.extensionSettings[EXT_ID];
    }
    const raw = localStorage.getItem('GP_SETTINGS');
    if (!raw) {
      const init = { ...DEFAULTS };
      localStorage.setItem('GP_SETTINGS', JSON.stringify(init));
      return init;
    }
    try {
      return JSON.parse(raw);
    } catch {
      const init = { ...DEFAULTS };
      localStorage.setItem('GP_SETTINGS', JSON.stringify(init));
      return init;
    }
  }

  function gpSettings() {
    return _settingsBag();
  }

  function gpSaveSettings(partial = {}) {
    const c = ctx();
    if (c?.extensionSettings) {
      c.extensionSettings[EXT_ID] = { ..._settingsBag(), ...partial };
    } else {
      const merged = { ..._settingsBag(), ...partial };
      localStorage.setItem('GP_SETTINGS', JSON.stringify(merged));
    }
  }

  // -------------------------------
  // Theme helpers
  // -------------------------------
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

  // -------------------------------
  // Gallery title → Image GalleryPlus
  // -------------------------------
  function applyGalleryTitle() {
    const t = document.querySelector('#gallery .dragTitle span');
    if (t && t.textContent && !/Image GalleryPlus/.test(t.textContent)) {
      t.textContent = 'Image GalleryPlus';
    }
  }
  const galleryObserver = new MutationObserver(applyGalleryTitle);
  galleryObserver.observe(document.body, { childList: true, subtree: true });
  applyGalleryTitle();

  // -------------------------------
  // Observe new viewer windows
  // -------------------------------
  const viewerObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches?.('.draggable.galleryImageDraggable')) wireViewer(n);
        n.querySelectorAll?.('.draggable.galleryImageDraggable')?.forEach(wireViewer);
      }
    }
  });
  viewerObserver.observe(document.body, { childList: true, subtree: true });

  // -------------------------------
  // Wire viewer
  // -------------------------------
  function wireViewer(root) {
    if (!root || root.dataset.gpWired === '1') return;
    root.dataset.gpWired = '1';

    const pcBar = root.querySelector('.panelControlBar');
    if (!pcBar) return;

    injectLeftControls(root, pcBar);
    wireZoomAndPan(root);
    wireKeyboardNav(root);
    applyDefaultRect(root);
    wireFullscreenStateSync(root);
  }

  // -------------------------------
  // Left controls (before panelControlBar)
  // -------------------------------
  function injectLeftControls(root, pcBar) {
    let left = root.querySelector(':scope > .gp-controls-left');
    if (!left) {
      left = document.createElement('div');
      left.className = 'gp-controls-left';
      root.insertBefore(left, pcBar);
    } else {
      left.innerHTML = '';
    }

    // 💾 save default size/pos
    const saveBtn = document.createElement('button');
    saveBtn.className = 'gp-btn gp-save';
    saveBtn.title = 'Save as default size and location';
    saveBtn.textContent = '💾';
    saveBtn.addEventListener('click', () => saveDefaultRect(root));

    // 🔍 toggle hover zoom
    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'gp-btn gp-zoom';
    zoomBtn.title = 'Toggle hover zoom (off = scroll zoom + pan)';
    zoomBtn.textContent = '🔍';
    zoomBtn.classList.toggle('active', !!gpSettings().hoverZoom);
    zoomBtn.addEventListener('click', () => {
      const ns = !gpSettings().hoverZoom;
      gpSaveSettings({ hoverZoom: ns });
      zoomBtn.classList.toggle('active', ns);
    });

    // ⏯️ start/pause slideshow
    const playBtn = document.createElement('button');
    playBtn.className = 'gp-btn gp-play';
    playBtn.title = 'Start / pause slideshow';
    playBtn.textContent = '⏯️';
    playBtn.addEventListener('click', () => {
      if (root.dataset.gpPlaying === '1') stopSlideshow(root);
      else startSlideshow(root);
    });

    // ⛶ fullscreen
    const fsBtn = document.createElement('button');
    fsBtn.className = 'gp-btn gp-fs';
    fsBtn.title = 'Fullscreen slideshow';
    fsBtn.textContent = '⛶';
    fsBtn.addEventListener('click', () => toggleFullscreen(root));

    // speed slider
    const speedWrap = document.createElement('div');
    speedWrap.className = 'gp-speed-wrap';
    const speed = document.createElement('input');
    speed.type = 'range';
    speed.min = '0.1';
    speed.max = '10';
    speed.step = '0.1';
    speed.className = 'gp-speed';
    speed.value = String(gpSettings().slideshowSpeedSec ?? 3);
    speed.title = 'Slideshow delay (seconds)';
    function refreshSpeedWarn() {
      const trans = root.dataset.gpTransition || gpSettings().slideshowTransition || 'crossfade';
      const delay = parseFloat(speed.value || '3');
      if (trans === 'spiral' && delay < 3) speed.classList.add('gp-warn'); else speed.classList.remove('gp-warn');
    }
    speed.addEventListener('input', refreshSpeedWarn);
    speed.addEventListener('change', () => {
      let v = parseFloat(speed.value);
      if (!Number.isFinite(v) || v < 0.1) v = 0.1;
      if (v > 10) v = 10;
      gpSaveSettings({ slideshowSpeedSec: v });
      refreshSpeedWarn();
      if (root.dataset.gpPlaying === '1') startSlideshow(root);
    });
    refreshSpeedWarn();
    speedWrap.appendChild(speed);

    // transition select
    const sel = document.createElement('select');
    sel.className = 'gp-transition';
    sel.title = 'Transition style';
    [
      ['crossfade', '😶‍🌫️'],
      ['spiral',    '😵‍💫'],
      ['pushX',     '➡️'],
      ['pushY',     '⬇️'],
    ].forEach(([v, lbl]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = lbl;
      if ((gpSettings().slideshowTransition || 'crossfade') === v) o.selected = true;
      sel.appendChild(o);
    });
    root.dataset.gpTransition = gpSettings().slideshowTransition || 'crossfade';
    sel.addEventListener('change', () => {
      const v = sel.value;
      root.dataset.gpTransition = v;
      gpSaveSettings({ slideshowTransition: v });
      refreshSpeedWarn();
    });

    left.appendChild(saveBtn);
    left.appendChild(zoomBtn);
    left.appendChild(playBtn);
    left.appendChild(fsBtn);
    left.appendChild(speedWrap);
    left.appendChild(sel);
  }

  // -------------------------------
  // Save/Apply rect
  // -------------------------------
  function saveDefaultRect(root) {
    const st = root.style;
    const rect = {
      top: st.top || (root.offsetTop + 'px'),
      left: st.left || (root.offsetLeft + 'px'),
      width: st.width || (root.clientWidth + 'px'),
      height: st.height || (root.clientHeight + 'px'),
    };
    gpSaveSettings({ viewerRect: rect });
    root.classList.add('gp-saved-pulse');
    setTimeout(() => root.classList.remove('gp-saved-pulse'), 350);
  }

  function applyDefaultRect(root) {
    const r = gpSettings().viewerRect;
    if (!r) return;
    const st = root.style;
    st.top = r.top; st.left = r.left; st.width = r.width; st.height = r.height;
  }

  // -------------------------------
  // Zoom + Click-Drag Pan (when hoverZoom = false)
  // -------------------------------
  function wireZoomAndPan(root) {
    const img = root.querySelector('img');
    if (!img) return;

    let scale = 1;
    let tx = 0, ty = 0;

    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let panBaseX = 0, panBaseY = 0;

    function applyTransform() {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.style.transformOrigin = 'center center';
      img.style.willChange = 'transform';
    }

    // Scroll zoom (only when hoverZoom is OFF)
    function onWheel(e) {
      if (gpSettings().hoverZoom) return;
      if (!e.ctrlKey) {
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.1;
        const newScale = Math.min(8, Math.max(0.1, scale + delta));
        if (newScale !== scale) {
          const rect = img.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const dx = (cx - rect.width / 2) / scale;
          const dy = (cy - rect.height / 2) / scale;
          tx -= dx * (newScale - scale);
          ty -= dy * (newScale - scale);
          scale = newScale;
          applyTransform();
        }
      }
    }

    // Hover-zoom (gentle inverse pan) – when ON
    function onMoveHover(e) {
      if (!gpSettings().hoverZoom) return;
      const rect = img.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * -1;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * -1;
      const z = gpSettings().hoverZoomScale || 1.08;
      scale = z;
      tx = nx * rect.width * 0.05;
      ty = ny * rect.height * 0.05;
      applyTransform();
    }
    function onLeaveHover() {
      if (!gpSettings().hoverZoom) return;
      scale = 1; tx = 0; ty = 0;
      applyTransform();
    }

    // Click-to-drag panning (only when hoverZoom is OFF)
    function onMouseDown(e) {
      if (gpSettings().hoverZoom) return;
      if (e.button !== 0) return;
      // Only pan if we are at least slightly zoomed
      if (scale <= 1.001) return;
      isPanning = true;
      root.classList.add('gp-panning');
      panStartX = e.clientX;
      panStartY = e.clientY;
      panBaseX = tx;
      panBaseY = ty;
      e.preventDefault();
      window.addEventListener('mousemove', onMouseMovePan);
      window.addEventListener('mouseup', onMouseUpPan, { once: true });
    }
    function onMouseMovePan(e) {
      if (!isPanning) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      tx = panBaseX + dx;
      ty = panBaseY + dy;
      applyTransform();
    }
    function onMouseUpPan() {
      isPanning = false;
      root.classList.remove('gp-panning');
      window.removeEventListener('mousemove', onMouseMovePan);
    }

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('mousemove', onMoveHover);
    root.addEventListener('mouseleave', onLeaveHover);
    img.addEventListener('mousedown', onMouseDown);

    applyTransform();
  }

  // -------------------------------
  // Keyboard nav
  // -------------------------------
  function wireKeyboardNav(root) {
    function handler(e) {
      if (!document.body.contains(root)) {
        document.removeEventListener('keydown', handler);
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(root); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(root); }
      else if (e.key === ' ') { e.preventDefault(); root.dataset.gpPlaying === '1' ? stopSlideshow(root) : startSlideshow(root); }
      else if (e.key === 'Escape') { root.querySelector('.dragClose')?.click(); }
    }
    document.addEventListener('keydown', handler);
  }

  // -------------------------------
  // Fullscreen
  // -------------------------------
  function toggleFullscreen(root) {
    const isFS = document.fullscreenElement === root;
    if (isFS) {
      document.exitFullscreen?.();
    } else {
      // make the window fill the screen but keep our transitions
      root.requestFullscreen?.({ navigationUI: 'hide' }).catch(()=>{});
    }
  }
  function wireFullscreenStateSync(root) {
    function onFSChange() {
      const isFS = document.fullscreenElement === root;
      root.classList.toggle('gp-fullscreen', isFS);
    }
    document.addEventListener('fullscreenchange', onFSChange);
    // clean up if node removed
    const obs = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        document.removeEventListener('fullscreenchange', onFSChange);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // -------------------------------
  // Slideshow core
  // -------------------------------
  function startSlideshow(root) {
    root.dataset.gpPlaying = '1';
    scheduleTick(root, gpSettings().slideshowSpeedSec || 3);
  }
  function stopSlideshow(root) {
    root.dataset.gpPlaying = '0';
    if (root._gpTimer) { clearTimeout(root._gpTimer); root._gpTimer = null; }
  }
  function scheduleTick(root, secs) {
    if (root._gpTimer) clearTimeout(root._gpTimer);
    root._gpTimer = setTimeout(() => {
      if (root.dataset.gpPlaying !== '1') return;
      goNext(root);
      scheduleTick(root, gpSettings().slideshowSpeedSec || 3);
    }, Math.max(100, secs * 1000));
  }

  function goNext(root) {
    const list = currentGalleryList();
    const img = root.querySelector('img');
    if (!img || !list.length) return;
    const i = indexInList(list, img.src);
    const nextIdx = (i + 1) % list.length;
    transitionTo(root, img, list[nextIdx]);
    preload(list[(nextIdx + 1) % list.length]);
  }
  function goPrev(root) {
    const list = currentGalleryList();
    const img = root.querySelector('img');
    if (!img || !list.length) return;
    const i = indexInList(list, img.src);
    const prevIdx = (i - 1 + list.length) % list.length;
    transitionTo(root, img, list[prevIdx]);
    preload(list[(prevIdx - 1 + list.length) % list.length]);
  }

  function currentGalleryList() {
    const thumbs = document.querySelectorAll('#dragGallery img.nGY2GThumbnailImg, #dragGallery .nGY2GThumbnailImage.nGY2TnImg');
    const out = [];
    thumbs.forEach(t => {
      if (t instanceof HTMLImageElement && t.src) out.push(t.src);
      else if (t instanceof HTMLElement) {
        const bg = t.style.backgroundImage || '';
        const m = bg.match(/url\(["']?(.+?)["']?\)/);
        if (m) out.push(new URL(m[1], location.href).href);
      }
    });
    return [...new Set(out)];
  }
  function indexInList(list, src) {
    const norm = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
    const target = norm(src);
    const idx = list.findIndex(u => norm(u) === target);
    return idx >= 0 ? idx : 0;
  }
  function preload(src) {
    if (!src) return;
    const i = new Image();
    i.decoding = 'async';
    i.loading = 'eager';
    i.src = src;
  }

  // -------------------------------
  // Transitions
  // -------------------------------
  function transitionTo(root, baseImg, nextSrc) {
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

  function transitionCrossfade(root, baseImg, nextSrc, done) {
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

  function transitionPush(root, baseImg, nextSrc, horizontal, done) {
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

  // --- OLD - Spiral (SVG mask sweep version; the “old” look you liked) ---
  // function transitionSpiralSVG(root, baseImg, nextSrc, done) {
  //   const wrap = ensureLayerWrap(root, baseImg);

  //   // Holder
  //   const holder = document.createElement('div');
  //   holder.className = 'gp-spiral-svg-holder';
  //   wrap.appendChild(holder);

  //   // SVG (1000x1000 viewBox for stable math)
  //   const SVG_NS = 'http://www.w3.org/2000/svg';
  //   const svg = document.createElementNS(SVG_NS, 'svg');
  //   svg.setAttribute('viewBox', '0 0 1000 1000');
  //   svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  //   svg.classList.add('gp-spiral-svg');

  //   // defs + mask
  //   const defs = document.createElementNS(SVG_NS, 'defs');
  //   const mask = document.createElementNS(SVG_NS, 'mask');
  //   const maskId =
  //     'gpMask_' +
  //     (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  //       ? crypto.randomUUID()
  //       : Date.now().toString(36));
  //   mask.setAttribute('id', maskId);

  //   const maskRect = document.createElementNS(SVG_NS, 'rect');
  //   maskRect.setAttribute('x', '0');
  //   maskRect.setAttribute('y', '0');
  //   maskRect.setAttribute('width', '1000');
  //   maskRect.setAttribute('height', '1000');
  //   maskRect.setAttribute('fill', 'black');

  //   // Spiral path (Archimedean) as polyline/path
  //   const path = document.createElementNS(SVG_NS, 'path');
  //   path.setAttribute('fill', 'none');
  //   path.setAttribute('stroke', 'white');
  //   path.setAttribute('stroke-linecap', 'round');

  //   const cX = 500, cY = 500;
  //   const turns = 4.25;        // a nice amount of swirl
  //   const a = 0;                // start radius
  //   const b = 14;               // step (larger => wider spacing)
  //   const step = 0.08;          // radian step
  //   let d = '';
  //   let started = false;
  //   for (let t = 0; t <= Math.PI * 2 * turns; t += step) {
  //     const r = a + b * t;
  //     const x = cX + r * Math.cos(t);
  //     const y = cY + r * Math.sin(t);
  //     d += (started ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
  //     started = true;
  //   }
  //   path.setAttribute('d', d);

  //   // White spiral in mask
  //   mask.appendChild(maskRect);
  //   mask.appendChild(path);
  //   defs.appendChild(mask);

  //   // Next image inside SVG
  //   const img = document.createElementNS(SVG_NS, 'image');
  //   img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', nextSrc);
  //   img.setAttribute('x', '0');
  //   img.setAttribute('y', '0');
  //   img.setAttribute('width', '1000');
  //   img.setAttribute('height', '1000');
  //   img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  //   img.setAttribute('mask', `url(#${maskId})`);

  //   // Colored outline (thin) to echo theme color (not part of mask)
  //   const colorPath = document.createElementNS(SVG_NS, 'path');
  //   colorPath.setAttribute('d', d);
  //   colorPath.setAttribute('fill', 'none');
  //   colorPath.setAttribute('stroke', themeQuoteColor());
  //   colorPath.setAttribute('stroke-linecap', 'round');
  //   colorPath.setAttribute('opacity', '0.65');

  //   // Group to rotate together
  //   const gMask = document.createElementNS(SVG_NS, 'g');
  //   gMask.setAttribute('transform-origin', '500 500');
  //   gMask.appendChild(path);

  //   const gColor = document.createElementNS(SVG_NS, 'g');
  //   gColor.setAttribute('transform-origin', '500 500');
  //   gColor.appendChild(colorPath);

  //   svg.appendChild(defs);
  //   svg.appendChild(img);
  //   svg.appendChild(gMask);
  //   svg.appendChild(gColor);
  //   holder.appendChild(svg);

  //   // Animate: dash sweep + stroke growth + rotation
  //   const ms = getTransitionMs();

  //   // We need total length to make a sweep
  //   requestAnimationFrame(() => {
  //     const len = path.getTotalLength?.() || 3000;
  //     // mask (white) spiral
  //     path.style.strokeDasharray = String(len);
  //     path.style.strokeDashoffset = String(len);
  //     path.style.strokeWidth = '2';

  //     // color spiral (thin outline)
  //     colorPath.style.strokeDasharray = String(len);
  //     colorPath.style.strokeDashoffset = String(len);
  //     colorPath.style.strokeWidth = '1.2';

  //     // transitions
  //     const trans = `stroke-dashoffset ${ms}ms ease, stroke-width ${ms}ms ease, opacity ${ms}ms ease`;
  //     path.style.transition = trans;
  //     colorPath.style.transition = trans;
  //     gMask.style.transition = `transform ${ms}ms ease`;
  //     gColor.style.transition = `transform ${ms}ms ease`;

  //     // kick
  //     // dashoffset  -> 0 (draws spiral)
  //     // strokeWidth -> big (fills area by end)
  //     const finalStroke = 900; // thick enough to cover
  //     requestAnimationFrame(() => {
  //       path.style.strokeDashoffset = '0';
  //       colorPath.style.strokeDashoffset = '0';
  //       path.style.strokeWidth = String(finalStroke);
  //       colorPath.style.strokeWidth = '3';
  //       colorPath.style.opacity = '0.15'; // fade the outline a bit by end
  //       gMask.style.transform = 'rotate(360deg)';
  //       gColor.style.transform = 'rotate(360deg)';
  //     });
  //   });

  //   setTimeout(() => {
  //     baseImg.src = nextSrc;
  //     holder.remove();
  //     done?.();
  //   }, ms + 40);
  // }

  // --- old new transtion code---
// function transitionSpiralRefined(root, baseImg, nextSrc, done) {
//   // Duration: ~1/6 of slideshow delay, but never under 1s
//   const delaySec = gpSettings().slideshowSpeedSec || 3;
//   let transMs = Math.max(1000, Math.round((delaySec * 1000) / 6));

//   // Helper to fetch a CSS var with a fallback
//   const cssVar = (name, fallback) => {
//     const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
//     return v || fallback;
//   };
//   const quoteColor = cssVar('--SmartThemeQuoteColor', '#7aa2f7');

//   // Size + geometry
//   const box = root.getBoundingClientRect();
//   const w = Math.max(1, box.width);
//   const h = Math.max(1, box.height);
//   const cx = w / 2;
//   const cy = h / 2;

//   // Spiral that comfortably reaches the corners (overscan so no edges show)
//   const maxR = Math.hypot(w, h) * 0.60;   // a bit beyond the corners
//   const turns = 3.0;                       // visual fullness
//   const samples = 900;                     // path resolution
//   const a = 0;                             // start radius
//   const b = maxR / (Math.PI * 2 * turns);

//   const ns = 'http://www.w3.org/2000/svg';
//   const uid = `gpSpiral_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e5)}`;

//   // Build SVG overlay with a blur-softened mask to reveal Image B along a spiral
//   const svg = document.createElementNS(ns, 'svg');
//   svg.setAttribute('class', 'gp-spiral-svg');
//   Object.assign(svg.style, {
//     position: 'absolute',
//     inset: 0,
//     width: '100%',
//     height: '100%',
//     pointerEvents: 'none',
//     overflow: 'visible',
//     zIndex: 2, // above the base image, below controls
//   });

//   const defs = document.createElementNS(ns, 'defs');

//   // Soft edge filter for a nicer look
//   const filter = document.createElementNS(ns, 'filter');
//   filter.setAttribute('id', `${uid}_blur`);
//   const fe = document.createElementNS(ns, 'feGaussianBlur');
//   fe.setAttribute('stdDeviation', '1.2');
//   filter.appendChild(fe);

//   // Mask: black background + white spiral stroke
//   const mask = document.createElementNS(ns, 'mask');
//   mask.setAttribute('id', `${uid}_mask`);

//   const maskBg = document.createElementNS(ns, 'rect');
//   maskBg.setAttribute('x', '-10%');
//   maskBg.setAttribute('y', '-10%');
//   maskBg.setAttribute('width', '120%');
//   maskBg.setAttribute('height', '120%');
//   maskBg.setAttribute('fill', 'black');

//   const path = document.createElementNS(ns, 'path');
//   path.setAttribute('fill', 'none');
//   path.setAttribute('stroke', 'white');
//   path.setAttribute('stroke-linecap', 'round');
//   path.setAttribute('stroke-linejoin', 'round');
//   path.setAttribute('filter', `url(#${uid}_blur)`);

//   // Compute spiral path
//   let d = `M ${cx.toFixed(2)} ${cy.toFixed(2)}`;
//   for (let i = 1; i <= samples; i++) {
//     const t = (i / samples) * (Math.PI * 2 * turns);
//     const r = a + b * t;
//     const x = cx + r * Math.cos(t);
//     const y = cy + r * Math.sin(t);
//     d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
//   }
//   path.setAttribute('d', d);

//   // Put it all together
//   defs.appendChild(filter);
//   mask.appendChild(maskBg);
//   mask.appendChild(path);
//   defs.appendChild(mask);
//   svg.appendChild(defs);

//   // Image B drawn *inside* the SVG with the mask, overscanned so edges never peek
//   const g = document.createElementNS(ns, 'g');
//   g.style.opacity = '0'; // fade in smoothly
//   const image = document.createElementNS(ns, 'image');
//   image.setAttribute('href', nextSrc);
//   image.setAttribute('x', '-5%');
//   image.setAttribute('y', '-5%');
//   image.setAttribute('width', '110%');
//   image.setAttribute('height', '110%');
//   image.setAttribute('preserveAspectRatio', 'xMidYMid slice'); // cover
//   image.setAttribute('mask', `url(#${uid}_mask)`);
//   g.appendChild(image);
//   svg.appendChild(g);

//   // Add a faint, themed glow trail behind the spiral stroke for style
//   const glow = document.createElementNS(ns, 'path');
//   glow.setAttribute('d', d);
//   glow.setAttribute('fill', 'none');
//   glow.setAttribute('stroke', quoteColor);
//   glow.setAttribute('stroke-linecap', 'round');
//   glow.setAttribute('stroke-linejoin', 'round');
//   glow.style.opacity = '0.25';
//   glow.setAttribute('filter', `url(#${uid}_blur)`);
//   svg.appendChild(glow);

//   // Mount
//   root.appendChild(svg);

//   // Prep animation state
//   const totalLen = path.getTotalLength();
//   path.style.strokeDasharray = totalLen;
//   path.style.strokeDashoffset = totalLen;

//   // Start/end widths scale with viewport for a consistent feel
//   const startW = Math.max(2, Math.min(w, h) * 0.010);
//   const endW   = Math.max(40, Math.min(w, h) * 0.060);

//   // Ease helpers tuned for a smooth back-half + graceful finish
//   const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
//   const easeOutQuad    = (t) => 1 - (1 - t) * (1 - t);

//   // Make sure base image is on the compositor (and fades out at the end)
//   baseImg.style.willChange = 'opacity, transform';

//   let start = null;
//   function frame(ts) {
//     if (!start) start = ts;
//     let p = (ts - start) / transMs;
//     if (p > 1) p = 1;

//     // A gentle front, fuller back
//     const e = easeInOutCubic(p);

//     // Rotate Image B a full 360° across the transition, so it ends aligned
//     const angle = 360 * e;
//     g.setAttribute('transform', `rotate(${angle.toFixed(3)} ${cx.toFixed(2)} ${cy.toFixed(2)})`);

//     // Spiral reveal along the path
//     const dash = (1 - e) * totalLen;
//     path.style.strokeDashoffset = dash;

//     // Grow stroke for fuller coverage towards the end
//     const sw = startW + (endW - startW) * e;
//     path.setAttribute('stroke-width', sw.toFixed(2));

//     // Slight glow trail follows the spiral width & progress
//     glow.setAttribute('stroke-width', Math.max(1, sw * 0.6).toFixed(2));
//     glow.style.strokeDasharray = totalLen;
//     glow.style.strokeDashoffset = dash + totalLen * 0.05; // offset for a trailing look
//     glow.style.stroke = quoteColor;

//     // Bring in Image B, then gently fade out Image A near the end
//     g.style.opacity = (0.15 + 0.85 * e).toFixed(3);
//     if (p > 0.6) {
//       // Crossfade the last 40% to avoid any abrupt ending
//       const k = easeOutQuad((p - 0.6) / 0.4); // 0..1
//       baseImg.style.opacity = (1 - k).toFixed(3);
//     }

//     if (p < 1) {
//       requestAnimationFrame(frame);
//     } else {
//       // Finish: set B as the new base, clear overlays
//       baseImg.src = nextSrc;
//       baseImg.style.opacity = '';
//       baseImg.style.transform = '';
//       svg.remove();
//       done && done();
//     }
//   }

//   // Colorize the spiral stroke itself right before we start (so it updates with themes)
//   path.setAttribute('stroke', quoteColor);

//   requestAnimationFrame(frame);
// }


// --- Spiral (SVG mask sweep; thicker themed outline + no visible white stroke) ---
function transitionSpiralSVG(root, baseImg, nextSrc, done) {
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
  const maskId =
    'gpMask_' +
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36));
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
  const b = 14;      // spacing between arms (bigger => wider spacing)
  const step = 0.08; // radians step

  const maskPath = document.createElementNS(SVG_NS, 'path');
  maskPath.setAttribute('fill', 'none');
  maskPath.setAttribute('stroke', 'white'); // white = reveal in mask
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

  // Themed spiral outline (visible) — separate path (clone the geometry)
  const outlinePath = document.createElementNS(SVG_NS, 'path');
  outlinePath.setAttribute('d', d);
  outlinePath.setAttribute('fill', 'none');
  outlinePath.setAttribute('stroke', themeQuoteColor());  // theme color
  outlinePath.setAttribute('stroke-linecap', 'round');
  outlinePath.setAttribute('opacity', '0.75');

  // Spin group (rotate image+mask for that subtle full 360° twist)
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

    // Prepare sweeping on both paths
    maskPath.style.strokeDasharray = String(len);
    maskPath.style.strokeDashoffset = String(len);
    // Start thin, end very thick so it "floods" into full reveal
    maskPath.style.strokeWidth = '2';

    outlinePath.style.strokeDasharray = String(len);
    outlinePath.style.strokeDashoffset = String(len);
    // Thicker themed outline (start 4 → end 12)
    outlinePath.style.strokeWidth = '4';

    const pathTrans = `stroke-dashoffset ${ms}ms ease, stroke-width ${ms}ms ease, opacity ${ms}ms ease`;
    maskPath.style.transition = pathTrans;
    outlinePath.style.transition = pathTrans;

    spin.style.transition = `transform ${ms}ms ease`;
    spinOutline.style.transition = `transform ${ms}ms ease, opacity ${ms}ms ease`;

    // Kick off the animation on the next frame
    requestAnimationFrame(() => {
      maskPath.style.strokeDashoffset = '0';
      maskPath.style.strokeWidth = '900';   // mask grows thick enough to reveal fully

      outlinePath.style.strokeDashoffset = '0';
      outlinePath.style.strokeWidth = '24'; // thicker themed line on top (default 12)
      outlinePath.style.opacity = '0';    // fade a bit by the end (default 0.3)

      // Full 360° so we end aligned
      spin.style.transform = 'rotate(360deg)';
      spinOutline.style.transform = 'rotate(360deg)';
    });
  });

  // Complete
  setTimeout(() => {
    baseImg.src = nextSrc;
    holder.remove();
    done?.();
  }, ms + 40);
}



})();
