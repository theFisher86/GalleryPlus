/* GalleryPlus — SillyTavern extension
 * Final cleaned build: transitions, slideshow, zoom, theme glow
 * Author: you + buddy copilot 😉
 *
 * Major features:
 * - Viewer controls on the LEFT of the top bar (💾, 🔍, ⏯️ + speed slider + transition select)
 * - Scroll-wheel zoom (with optional hover-pan zoom mode)
 * - Slideshow with crossfade / spiral / push-horizontal / push-vertical transitions
 * - Preloading of next image(s)
 * - Keyboard nav (Left/Right arrows to switch, Space to toggle slideshow, Esc to close)
 * - Theme-aware glows via SillyTavern CSS variables (Underline + Quote colors)
 * - Respects MovingUI drag/resize (we don’t hijack)
 *
 * Implementation notes:
 * - We wire up new viewer windows via a MutationObserver.
 * - We leave gallery pagination alone (your CSS fix handles it).
 * - We never crop the image; zoom/pan uses transforms only.
 */

(() => {
  'use strict';

  const EXT_ID = 'GalleryPlus';

  // -------------------------------
  // Settings (persisted)
  // -------------------------------
  const DEFAULTS = {
    enabled: true,
    diag: Date.now(),
    openHeight: 800,
    hoverZoom: false,         // false = scroll zoom only; true = slight hover-pan zoom
    hoverZoomScale: 1.08,
    viewerRect: null,         // { top, left, width, height } (applied to new viewers)
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
    // Fallback to localStorage if ST context is unavailable
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
  function cssVar(varName, fallback = '') {
    const root = document.documentElement;
    const v = getComputedStyle(root).getPropertyValue(varName).trim();
    if (v) return v;
    // ST sometimes places theme vars on body as inline style
    const vb = getComputedStyle(document.body).getPropertyValue(varName).trim();
    return vb || fallback;
  }

  function themeUnderlineColor() {
    // used for button/slider hover glow
    return cssVar('--SmartThemeUnderlineColor', '#7aa2f7');
  }

  function themeQuoteColor() {
    // used for window glow, spiral accent
    return cssVar('--SmartThemeQuoteColor', '#7aa2f7');
  }

  // -------------------------------
  // Gallery title tweak
  // -------------------------------
  function applyGalleryTitle() {
    const t = document.querySelector('#gallery .dragTitle span');
    if (t && t.textContent && !/Image GalleryPlus/.test(t.textContent)) {
      t.textContent = 'Image GalleryPlus';
    }
  }

  // Re-apply title when gallery opens
  const galleryObserver = new MutationObserver(() => {
    applyGalleryTitle();
  });
  galleryObserver.observe(document.body, { childList: true, subtree: true });

  // -------------------------------
  // Wire up new viewer windows
  // -------------------------------
  const viewerObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        // Viewer markup looks like: <div class="draggable galleryImageDraggable" id="draggable_*"><div class="dragTitle">...</div><div class="panelControlBar">...</div><img ...></div>
        if (n.matches?.('.draggable.galleryImageDraggable')) {
          wireViewer(n);
        }
        // Also if the viewer is nested later
        const sub = n.querySelectorAll?.('.draggable.galleryImageDraggable');
        if (sub && sub.length) sub.forEach(wireViewer);
      }
    }
  });
  viewerObserver.observe(document.body, { childList: true, subtree: true });

  // -------------------------------
  // Viewer wiring
  // -------------------------------
  function wireViewer(root) {
    if (!root || root.dataset.gpWired === '1') return;
    root.dataset.gpWired = '1';

    // Ensure title strip exists (SillyTavern markup has .panelControlBar already)
    const pcBar = root.querySelector('.panelControlBar');
    if (!pcBar) return;

    injectLeftControls(root, pcBar);
    wireZoom(root);
    wireKeyboardNav(root);
    applyDefaultRect(root);
  }

  // -------------------------------
  // Control injection (left of panelControlBar)
  // -------------------------------
  function injectLeftControls(root, pcBar) {
    // Container to sit BEFORE the panelControlBar (left side)
    let left = root.querySelector(':scope > .gp-controls-left');
    if (!left) {
      left = document.createElement('div');
      left.className = 'gp-controls-left';
      // place before panelControlBar to ensure "left of entire bar"
      root.insertBefore(left, pcBar);
    } else {
      left.innerHTML = '';
    }

    // Controls: 💾 (save pos/size), 🔍 (toggle zoom), ⏯️ (slideshow)
    const saveBtn = document.createElement('button');
    saveBtn.className = 'gp-btn gp-save';
    saveBtn.title = 'Save as default size and location';
    saveBtn.textContent = '💾';
    saveBtn.addEventListener('click', () => saveDefaultRect(root));

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'gp-btn gp-zoom';
    zoomBtn.title = 'Toggle hover zoom (off = scroll zoom)';
    zoomBtn.textContent = '🔍';
    const s = gpSettings();
    if (s.hoverZoom) zoomBtn.classList.add('active');
    zoomBtn.addEventListener('click', () => {
      const ns = !gpSettings().hoverZoom;
      gpSaveSettings({ hoverZoom: ns });
      zoomBtn.classList.toggle('active', ns);
      // No need to rewire; wireZoom checks flag on wheel/move
    });

    const playBtn = document.createElement('button');
    playBtn.className = 'gp-btn gp-play';
    playBtn.title = 'Start / pause slideshow';
    playBtn.textContent = '⏯️';

    // Speed slider
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
    speed.addEventListener('input', () => {
      // For spiral we warn visually if below 3s
      const trans = root.dataset.gpTransition || gpSettings().slideshowTransition || 'crossfade';
      if (trans === 'spiral' && parseFloat(speed.value) < 3) {
        speed.classList.add('gp-warn');
      } else {
        speed.classList.remove('gp-warn');
      }
    });
    speed.addEventListener('change', () => {
      let v = parseFloat(speed.value);
      if (!Number.isFinite(v) || v < 0.1) v = 0.1;
      if (v > 10) v = 10;
      gpSaveSettings({ slideshowSpeedSec: v });
      const trans = root.dataset.gpTransition || gpSettings().slideshowTransition || 'crossfade';
      if (trans === 'spiral' && v < 3) speed.classList.add('gp-warn'); else speed.classList.remove('gp-warn');
      // If already running, restart with new timing
      if (root.dataset.gpPlaying === '1') startSlideshow(root);
    });
    speedWrap.appendChild(speed);

    // Transition select (emoji-only + narrow)
    const sel = document.createElement('select');
    sel.className = 'gp-transition';
    sel.title = 'Transition style';
    // emoji label map
    const opts = [
      ['crossfade', '😶‍🌫️'],
      ['spiral', '😵‍💫'],
      ['pushX', '➡️'],
      ['pushY', '⬇️'],
    ];
    const current = gpSettings().slideshowTransition || 'crossfade';
    opts.forEach(([v, lbl]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = lbl;
      if (v === current) o.selected = true;
      sel.appendChild(o);
    });
    root.dataset.gpTransition = current;

    sel.addEventListener('change', () => {
      const v = sel.value;
      root.dataset.gpTransition = v;
      gpSaveSettings({ slideshowTransition: v });
      // Spiral warning for too-fast speed
      const delay = parseFloat(speed.value || '3');
      if (v === 'spiral' && delay < 3) speed.classList.add('gp-warn'); else speed.classList.remove('gp-warn');
    });

    playBtn.addEventListener('click', () => {
      if (root.dataset.gpPlaying === '1') {
        stopSlideshow(root);
      } else {
        startSlideshow(root);
      }
    });

    left.appendChild(saveBtn);
    left.appendChild(zoomBtn);
    left.appendChild(playBtn);
    left.appendChild(speedWrap);
    left.appendChild(sel);
  }

  // -------------------------------
  // Apply / Save default rect
  // -------------------------------
  function saveDefaultRect(root) {
    const style = root.style;
    const rect = {
      top: style.top || (root.offsetTop + 'px'),
      left: style.left || (root.offsetLeft + 'px'),
      width: style.width || (root.clientWidth + 'px'),
      height: style.height || (root.clientHeight + 'px'),
    };
    gpSaveSettings({ viewerRect: rect });
    // small visual nudge
    root.classList.add('gp-saved-pulse');
    setTimeout(() => root.classList.remove('gp-saved-pulse'), 400);
  }

  function applyDefaultRect(root) {
    const r = gpSettings().viewerRect;
    if (!r) return;
    const style = root.style;
    style.top = r.top;
    style.left = r.left;
    style.width = r.width;
    style.height = r.height;
  }

  // -------------------------------
  // Zoom handling
  // -------------------------------
  function wireZoom(root) {
    const img = root.querySelector('img');
    if (!img) return;

    let scale = 1;
    let translateX = 0;
    let translateY = 0;

    function applyTransform() {
      img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      img.style.transformOrigin = 'center center';
      img.style.willChange = 'transform';
    }

    function onWheel(e) {
      // hoverZoom=false => scroll zoom
      if (gpSettings().hoverZoom) return; // when hoverZoom is ON, we don't intercept wheel
      if (!e.ctrlKey) {
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.1;
        const newScale = Math.min(8, Math.max(0.1, scale + delta));
        if (newScale !== scale) {
          // zoom to cursor
          const rect = img.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const dx = (cx - rect.width / 2) / scale;
          const dy = (cy - rect.height / 2) / scale;
          translateX -= dx * (newScale - scale);
          translateY -= dy * (newScale - scale);
          scale = newScale;
          applyTransform();
        }
      }
    }

    function onMouseMove(e) {
      // hover-pan zoom mode
      if (!gpSettings().hoverZoom) return;
      const rect = img.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * -1; // inverse move
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * -1;
      const z = gpSettings().hoverZoomScale || 1.08;
      scale = z;
      translateX = nx * rect.width * 0.05;
      translateY = ny * rect.height * 0.05;
      applyTransform();
    }

    function onMouseLeave() {
      if (!gpSettings().hoverZoom) return;
      scale = 1; translateX = 0; translateY = 0;
      applyTransform();
    }

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('mousemove', onMouseMove);
    root.addEventListener('mouseleave', onMouseLeave);

    // Initial reset
    applyTransform();
  }

  // -------------------------------
  // Keyboard navigation
  // -------------------------------
  function wireKeyboardNav(root) {
    function handler(e) {
      if (!document.body.contains(root)) {
        document.removeEventListener('keydown', handler);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext(root);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev(root);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (root.dataset.gpPlaying === '1') stopSlideshow(root); else startSlideshow(root);
      } else if (e.key === 'Escape') {
        // close viewer
        root.querySelector('.dragClose')?.click();
      }
    }
    document.addEventListener('keydown', handler);
  }

  // -------------------------------
  // Slideshow
  // -------------------------------
  function startSlideshow(root) {
    root.dataset.gpPlaying = '1';
    const speed = gpSettings().slideshowSpeedSec || 3;
    scheduleTick(root, speed);
  }

  function stopSlideshow(root) {
    root.dataset.gpPlaying = '0';
    if (root._gpTimer) {
      clearTimeout(root._gpTimer);
      root._gpTimer = null;
    }
  }

  function scheduleTick(root, secs) {
    if (root._gpTimer) clearTimeout(root._gpTimer);
    root._gpTimer = setTimeout(() => {
      if (root.dataset.gpPlaying !== '1') return;
      goNext(root, true);
      // reschedule with possibly updated speed
      const s = gpSettings().slideshowSpeedSec || 3;
      scheduleTick(root, s);
    }, Math.max(100, secs * 1000));
  }

  function goNext(root, fromSlide = false) {
    const list = currentGalleryList();
    const img = root.querySelector('img');
    if (!img || !list.length) return;

    const i = indexInList(list, img.src);
    const nextIdx = (i + 1) % list.length;
    transitionTo(root, img, list[nextIdx]);
    // Preload ahead
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

  // Collect sources from the visible gallery (#dragGallery)
  function currentGalleryList() {
    const thumbs = document.querySelectorAll('#dragGallery img.nGY2GThumbnailImg, #dragGallery .nGY2GThumbnailImage.nGY2TnImg[data-ngsrc], #dragGallery .nGY2GThumbnailImage.nGY2TnImg');
    const out = [];
    thumbs.forEach(t => {
      // Prefer <img src>, fallback to background-image url
      if (t instanceof HTMLImageElement && t.src) {
        out.push(t.src);
      } else if (t instanceof HTMLElement) {
        const bg = t.style.backgroundImage || '';
        const m = bg.match(/url\(["']?(.+?)["']?\)/);
        if (m) out.push(new URL(m[1], location.href).href);
      }
    });
    // Uniquify in order
    return [...new Set(out)];
  }

  function indexInList(list, src) {
    const norm = (u) => {
      try { return new URL(u, location.href).href; } catch { return u; }
    };
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
        transitionSpiralRefined(root, baseImg, nextSrc, () => { baseImg.src = nextSrc; });
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
    const delaySec = gpSettings().slideshowSpeedSec || 3;
    let ms = Math.round((delaySec * 1000) / 3);  // ~1/3 of delay
    if (!Number.isFinite(ms) || ms < 450) ms = 450;
    if (ms < 1000) ms = 1000; // smooth minimum
    return ms;
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
    // start
    requestAnimationFrame(() => { next.style.opacity = '1'; });
    setTimeout(() => {
      // finalize
      baseImg.src = nextSrc;
      next.remove();
      done?.();
    }, ms + 30);
  }

  function transitionPush(root, baseImg, nextSrc, horizontal, done) {
    const wrap = ensureLayerWrap(root, baseImg);
    const next = document.createElement('img');
    next.className = 'gp-layer next';
    next.src = nextSrc;
    wrap.appendChild(next);

    const ms = getTransitionMs();
    const axis = horizontal ? 'X' : 'Y';

    // Setup positions
    next.style.transform = `translate${axis}(100%)`;
    next.style.opacity = '1';
    baseImg.style.transform = `translate${axis}(0%)`;
    next.style.transition = `transform ${ms}ms ease`;
    baseImg.style.transition = `transform ${ms}ms ease, opacity ${ms}ms ease`;

    // start
    requestAnimationFrame(() => {
      next.style.transform = `translate${axis}(0%)`;
      baseImg.style.transform = `translate${axis}(-100%)`;
      baseImg.style.opacity = '1';
    });

    setTimeout(() => {
      baseImg.style.transform = '';
      baseImg.style.opacity = '';
      baseImg.src = nextSrc;
      next.remove();
      done?.();
    }, ms + 30);
  }

  // Spiral refined: smooth build + complete 360° alignment
  function transitionSpiralRefined(root, baseImg, nextSrc, done) {
    const wrap = ensureLayerWrap(root, baseImg);
    const holder = document.createElement('div');
    holder.className = 'gp-spiral-holder';
    // next image sits above base but under the mask
    const next = document.createElement('img');
    next.className = 'gp-layer next';
    next.src = nextSrc;
    holder.appendChild(next);

    const ring = document.createElement('div');
    ring.className = 'gp-spiral-mask'; // CSS animates conic mask + rotation
    holder.appendChild(ring);

    wrap.appendChild(holder);

    const ms = getTransitionMs();
    const quote = themeQuoteColor();

    // CSS custom props to steer animation
    holder.style.setProperty('--gp-spiral-ms', `${ms}ms`);
    holder.style.setProperty('--gp-spiral-color', quote);
    // width factor makes stroke thicker
    holder.style.setProperty('--gp-spiral-width', '0.18'); // tuned thicker
    holder.style.setProperty('--gp-spiral-rot', '1turn');  // full 360°

    // Kick
    holder.classList.add('play');

    setTimeout(() => {
      baseImg.src = nextSrc;
      holder.remove();
      done?.();
    }, ms + 40);
  }

  // Wrap the <img> in a positioned container if not yet present
  function ensureLayerWrap(root, baseImg) {
    let wrap = baseImg.parentElement;
    // If parent is the viewer root, we add a wrapper so layers stack properly
    if (wrap === root || !wrap.classList.contains('gp-layer-wrap')) {
      const w = document.createElement('div');
      w.className = 'gp-layer-wrap';
      baseImg.replaceWith(w);
      w.appendChild(baseImg);
      wrap = w;
    }
    baseImg.classList.add('gp-layer', 'base');
    return wrap;
  }

  // -------------------------------
  // Kick things off
  // -------------------------------
  // Make sure the gallery title reads "Image GalleryPlus"
  applyGalleryTitle();

  // Nothing else to do here — MutationObservers do the rest.

})();
