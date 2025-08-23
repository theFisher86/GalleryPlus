// GalleryPlus — SillyTavern extension
// index.js — drag-safe + no-crop wheel-zoom + slideshow, etc.

(() => {
  const EXT = 'GalleryPlus';

  // ---------- helpers ----------
  const ctx = () => window.SillyTavern?.getContext?.() || {};
  function settings() {
    const c = ctx();
    if (!c.extensionSettings) c.extensionSettings = {};
    if (!c.extensionSettings[EXT]) c.extensionSettings[EXT] = {};
    const s = c.extensionSettings[EXT];
    if (s.hoverZoomScale == null) s.hoverZoomScale = 1.08;
    if (s.hoverZoom == null) s.hoverZoom = true;
    if (s.slideshowMs == null) s.slideshowMs = 3000;
    if (s.masonryDense == null) s.masonryDense = false;
    if (s.showCaptions == null) s.showCaptions = true;
    if (s.webpOnly == null) s.webpOnly = false;
    return s;
  }
  const save = () =>
    (window.saveSettingsDebounced || window.SillyTavern?.saveSettingsDebounced || (()=>{})).call(null);
  const ready = (fn) =>
    (document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', fn, { once: true })
      : fn());
  const log = (...a) => console.log(`[${EXT}]`, ...a);

  // ---------- minimal CSS (no #gallery inset overrides) ----------
  function injectBaseCSS() {
    if (document.getElementById('gp-base-css')) return;
    const st = document.createElement('style');
    st.id = 'gp-base-css';
    st.textContent = `
/* Controls block, left of the toolbar */
.galleryImageDraggable .gp-controls,
#gallery .gp-controls {
  position: absolute;
  top: 6px;
  left: 8px;
  z-index: 5;
  display: flex;
  gap: 6px;
  align-items: center;
}

/* Buttons */
.gp-btn {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  filter: drop-shadow(0 0 0 var(--SmartThemeQuoteTextColor, #9cf));
  transition: filter 140ms ease, transform 120ms ease;
}
.gp-btn:hover {
  filter: drop-shadow(0 0 6px var(--SmartThemeQuoteTextColor, #9cf));
  transform: translateY(-1px);
}

/* Slideshow controls */
.gp-slide-controls { display: none; gap:8px; align-items:center; }
.gp-slideshow-on .gp-slide-controls { display: inline-flex; }
.gp-delay { width: 120px; }
.gp-slide-label { font-size: 12px; opacity: .85; }

/* Dissolve on image swap */
.galleryImageDraggable img { transition: opacity 220ms ease; }

/* Theme glow for windows */
#gallery, .galleryImageDraggable {
  box-shadow: 0 8px 32px -8px rgba(0,0,0,.45),
              0 0 12px -2px var(--SmartThemeQuoteTextColor, rgba(160,200,255,.35));
}
    `;
    document.head.appendChild(st);
  }

  // ---------- gallery title + resize unlock (single-shot, drag-safe) ----------
  function retitleGallery() {
    const span = document.querySelector('#gallery .dragTitle span');
    if (span && span.textContent !== 'Image GalleryPlus') {
      span.textContent = 'Image GalleryPlus';
    }
  }
  function unlockGalleryResizeOnce() {
    const g = document.getElementById('gallery');
    if (!g || g.__gpResizeUnlocked) return;
    g.__gpResizeUnlocked = true;

    // Clear bottom/right/inset ONCE so width/height matter for resize.
    // Do NOT force them via CSS; let MovingUI handle drag positioning.
    g.style.right = '';
    g.style.bottom = '';
    g.style.inset = '';

    const r = g.getBoundingClientRect();
    if (!g.style.width)  g.style.width  = r.width  + 'px';
    if (!g.style.height) g.style.height = r.height + 'px';
    g.style.resize = 'both';
    g.style.overflow = 'auto';
  }

  // ---------- gallery detection ----------
  function observeGallery() {
    const init = () => {
      const g = document.getElementById('gallery');
      if (!g) return;
      retitleGallery();
      unlockGalleryResizeOnce();
    };
    init();
    const mo = new MutationObserver(init);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- thumbnail helpers ----------
  function galleryThumbs() {
    const nodes = document.querySelectorAll('#dragGallery .nGY2GThumbnailImg');
    return Array.from(nodes).map(n => n.getAttribute('src') || n.src).filter(Boolean);
  }
  const baseName = (p='') => p.split('/').pop();
  const preload = (src) => { const i = new Image(); i.src = src; return i; };

  // ---------- per-viewer state ----------
  const VIEW_STATE = new WeakMap();
  function state(root) {
    let st = VIEW_STATE.get(root);
    if (!st) {
      st = { timer: null, interval: settings().slideshowMs, zoom: 1, hoverOn: !!settings().hoverZoom };
      VIEW_STATE.set(root, st);
    }
    return st;
  }

  // ---------- controls ----------
  function ensureControls(root) {
    let ctrls = root.querySelector(':scope > .gp-controls');
    if (!ctrls) {
      ctrls = document.createElement('div');
      ctrls.className = 'gp-controls';
      root.insertBefore(ctrls, root.firstChild); // left of the toolbar
    }
    return ctrls;
  }

  // ---------- hover-zoom (inverse, micro) ----------
  function attachHoverZoom(root, img) {
    const s = state(root);
    const scale = settings().hoverZoomScale || 1.08;
    const onMove = (e) => {
      const rect = img.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width - 0.5;
      const cy = (e.clientY - rect.top) / rect.height - 0.5;
      const tx = (-cx * 16).toFixed(2);
      const ty = (-cy * 16).toFixed(2);
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const onLeave = () => { img.style.transform = 'none'; };
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    s.hoverHandlers = { onMove, onLeave };
  }
  function detachHoverZoom(root, img) {
    const s = state(root);
    if (s.hoverHandlers) {
      root.removeEventListener('mousemove', s.hoverHandlers.onMove);
      root.removeEventListener('mouseleave', s.hoverHandlers.onLeave);
      s.hoverHandlers = null;
    }
    img.style.transform = 'none';
  }

  // ---------- wheel zoom (layout-based, no cropping) ----------
  function fitScale(root, img) {
    const nW = img.naturalWidth || img.width || 1;
    const nH = img.naturalHeight || img.height || 1;
    const cw = Math.max(1, root.clientWidth);
    const ch = Math.max(1, root.clientHeight);
    // "Contain" without upscaling at baseline (zoom=1)
    return Math.min(1, cw / nW, ch / nH);
  }
  function applyLayoutZoom(root, img) {
    const st = state(root);
    const nW = img.naturalWidth || img.width || 1;
    const nH = img.naturalHeight || img.height || 1;
    const f  = fitScale(root, img); // baseline fit
    const z  = Math.max(0.1, Math.min(6, st.zoom || 1));
    const w  = Math.max(1, Math.round(nW * f * z));
    const h  = Math.max(1, Math.round(nH * f * z));
    // Layout sizing => allows scrollbars, never visual cropping
    img.style.transform = 'none';
    img.style.objectFit = 'contain';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.width  = w + 'px';
    img.style.height = h + 'px';
    root.style.overflow = 'auto';
  }
  function resetToFit(root, img) {
    // Back to baseline "contain" fit
    img.style.transform = 'none';
    img.style.objectFit = 'contain';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.width = '';
    img.style.height = '';
    root.style.overflow = 'auto';
    state(root).zoom = 1;
  }
  function attachWheelZoom(root, img) {
    const s = state(root);
    const onWheel = (e) => {
      if (e.ctrlKey) return; // don't fight system zoom
      e.preventDefault();
      // multiplicative zoom feels nicer than additive
      const factor = 1.08;
      s.zoom = e.deltaY < 0 ? Math.min(6, (s.zoom || 1) * factor)
                            : Math.max(0.1, (s.zoom || 1) / factor);
      applyLayoutZoom(root, img);
    };
    // initialize layout zoom at current size
    applyLayoutZoom(root, img);
    root.addEventListener('wheel', onWheel, { passive: false });
    s.wheelHandler = onWheel;
  }
  function detachWheelZoom(root) {
    const s = state(root);
    if (s.wheelHandler) {
      root.removeEventListener('wheel', s.wheelHandler);
      s.wheelHandler = null;
    }
  }

  // ---------- dissolve swap ----------
  function swapWithFade(root, img, nextSrc) {
    img.style.opacity = '0';
    const on = () => {
      // On each image load, keep current zoom regime
      if (settings().hoverZoom) resetToFit(root, img);
      else applyLayoutZoom(root, img);
      img.style.opacity = '1';
      img.removeEventListener('load', on);
    };
    img.addEventListener('load', on, { once: true });
    preload(nextSrc);
    img.src = nextSrc;
  }

  // ---------- enhance viewer ----------
  function enhanceViewer(root) {
    if (root.__gpEnhanced) return;
    root.__gpEnhanced = true;

    const ctrls = ensureControls(root);
    const img = root.querySelector('img');
    if (!img) return;

    // apply persisted rect once
    const s = settings();
    if (s.viewerRect && !root.__gpRectApplied) {
      const r = s.viewerRect;
      root.style.top = r.top + 'px';
      root.style.left = r.left + 'px';
      root.style.width = r.width + 'px';
      root.style.height = r.height + 'px';
      root.__gpRectApplied = true;
    }

    // 💾
    const btnSave = document.createElement('button');
    btnSave.className = 'gp-btn gp-save';
    btnSave.title = 'Save as default size and location';
    btnSave.textContent = '💾';
    btnSave.addEventListener('click', () => {
      const r = root.getBoundingClientRect();
      settings().viewerRect = { top: r.top, left: r.left, width: r.width, height: r.height };
      save();
      log('Saved default viewer rect', settings().viewerRect);
    });

    // 🔍
    const btnZoom = document.createElement('button');
    btnZoom.className = 'gp-btn gp-zoom';
    btnZoom.title = 'Toggle hover zoom';
    btnZoom.textContent = '🔍';

    const applyZoomMode = () => {
      if (settings().hoverZoom) {
        detachWheelZoom(root);
        resetToFit(root, img);
        attachHoverZoom(root, img);
      } else {
        detachHoverZoom(root, img);
        attachWheelZoom(root, img);
      }
    };
    btnZoom.addEventListener('click', () => {
      settings().hoverZoom = !settings().hoverZoom;
      save();
      applyZoomMode();
    });

    ctrls.append(btnSave, btnZoom);

    // ⏯️ + delay (0.1–10s)
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gp-btn gp-slide';
    btnPlay.title = 'Start/stop slideshow';
    btnPlay.textContent = '⏯️';

    const wrap = document.createElement('div');
    wrap.className = 'gp-slide-controls';

    const rng = document.createElement('input');
    rng.type = 'range'; rng.min = '100'; rng.max = '10000'; rng.step = '100';
    rng.className = 'gp-delay';

    const lbl = document.createElement('span');
    lbl.className = 'gp-slide-label';

    wrap.append(rng, lbl);
    ctrls.append(btnPlay, wrap);

    const st = state(root);
    rng.value = String(st.interval);
    lbl.textContent = (Math.round(st.interval / 100) / 10).toFixed(1) + 's';

    function tick() {
      const L = galleryThumbs(); if (!L.length) return;
      const cur = baseName(img.getAttribute('src') || img.src);
      let i = L.findIndex(x => baseName(x) === cur); i = (i + 1) % L.length;
      swapWithFade(root, img, L[i]);
      preload(L[(i + 1) % L.length]);
    }

    btnPlay.addEventListener('click', () => {
      const st = state(root);
      if (st.timer) {
        clearInterval(st.timer); st.timer = null;
        root.classList.remove('gp-slideshow-on');
      } else {
        st.timer = setInterval(tick, st.interval);
        root.classList.add('gp-slideshow-on');
      }
    });

    rng.addEventListener('input', () => {
      const ms = +rng.value;
      const st = state(root);
      st.interval = ms;
      settings().slideshowMs = ms; save();
      lbl.textContent = (Math.round(ms / 100) / 10).toFixed(1) + 's';
      if (st.timer) { clearInterval(st.timer); st.timer = setInterval(tick, st.interval); }
    });

    // Stop slideshow on close
    root.querySelector('.dragClose')?.addEventListener('click', () => {
      const st = state(root);
      if (st.timer) clearInterval(st.timer);
    }, { once: true });

    // Keyboard nav while hovered
    const onKey = (e) => {
      const tag = e.target?.tagName || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      const L = galleryThumbs(); if (!L.length) return;
      const cur = baseName(img.getAttribute('src') || img.src);
      let i = L.findIndex(x => baseName(x) === cur);
      if (e.key === 'ArrowRight') { e.preventDefault(); i = (i + 1) % L.length; swapWithFade(root, img, L[i]); preload(L[(i + 1) % L.length]); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); i = (i - 1 + L.length) % L.length; swapWithFade(root, img, L[i]); preload(L[(i - 1 + L.length) % L.length]); }
      if (e.key === ' ')          { e.preventDefault(); btnPlay.click(); }
      if (e.key === 'Escape')     { root.querySelector('.dragClose')?.click(); }
    };
    root.addEventListener('mouseenter', () => document.addEventListener('keydown', onKey));
    root.addEventListener('mouseleave', () => document.removeEventListener('keydown', onKey));

    // Start in persisted mode
    applyZoomMode();

    // Re-apply layout sizes after window resize (to keep no-crop behavior)
    const onResize = () => { if (!settings().hoverZoom) applyLayoutZoom(root, img); };
    const ro = new ResizeObserver(onResize);
    ro.observe(root);
    root.__gpResizeObs = ro;
  }

  // ---------- observe new viewers ----------
  function observeViewers() {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes || []) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.classList?.contains('galleryImageDraggable')) {
            enhanceViewer(n);
          }
          n.querySelectorAll?.('.galleryImageDraggable')?.forEach(enhanceViewer);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- bootstrap ----------
  ready(() => {
    injectBaseCSS();
    observeGallery();
    observeViewers();
    log('ready');
  });
})();
