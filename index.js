// GalleryPlus — SillyTavern extension
// Full index.js drop-in

(() => {
  const EXT = 'GalleryPlus';

  // ------------- ST helpers -------------
  function ctx() { return window.SillyTavern?.getContext?.() || {}; }
  function settings() {
    const c = ctx();
    if (!c.extensionSettings) c.extensionSettings = {};
    if (!c.extensionSettings[EXT]) c.extensionSettings[EXT] = {};
    const s = c.extensionSettings[EXT];
    // sensible defaults
    if (s.hoverZoomScale == null) s.hoverZoomScale = 1.08;
    if (s.hoverZoom == null) s.hoverZoom = true;
    if (s.slideshowMs == null) s.slideshowMs = 3000;
    if (s.masonryDense == null) s.masonryDense = false;
    if (s.showCaptions == null) s.showCaptions = true;
    if (s.webpOnly == null) s.webpOnly = false;
    return s;
  }
  function save() {
    (window.saveSettingsDebounced || window.SillyTavern?.saveSettingsDebounced || (()=>{})).call(null);
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once:true });
    else fn();
  }

  // ------------- Diagnostics -------------
  function log(...a) { console.log(`[${EXT}]`, ...a); }

  // ------------- Theme-aware CSS (once) -------------
  function injectBaseCSS() {
    if (document.getElementById('gp-base-css')) return;
    const st = document.createElement('style');
    st.id = 'gp-base-css';
    st.textContent = `
/* Ensure gallery can be resized even if inline anchors appear */
#gallery { right:auto !important; bottom:auto !important; inset:auto !important; }
/* If ST adds .no-scrollbar, keep resize functional */
#gallery.no-scrollbar { overflow:auto !important; }

/* Controls container (left of window toolbar) */
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
.gp-slide-controls { display: none; gap:8px; align-items: center; }
.gp-slideshow-on .gp-slide-controls { display: inline-flex; }
.gp-delay { width: 120px; }
.gp-slide-label { font-size: 12px; opacity: .85; }

/* Dissolve transition on images */
.galleryImageDraggable img { transition: opacity 220ms ease; }

/* Soft theme glow around windows */
#gallery, .galleryImageDraggable {
  box-shadow: 0 0 0 rgba(0,0,0,0), 0 8px 32px -8px rgba(0,0,0,.45),
              0 0 12px -2px var(--SmartThemeQuoteTextColor, rgba(160,200,255,.35));
}
    `;
    document.head.appendChild(st);
  }

  // ------------- Gallery Resize guard -------------
  function unlockGalleryResize() {
    const g = document.getElementById('gallery');
    if (!g) return;
    // Clear anchors once; CSS above keeps them cleared henceforth
    g.style.right = '';
    g.style.bottom = '';
    g.style.inset = '';
    // Ensure width/height are explicit or resize has nothing to change
    const r = g.getBoundingClientRect();
    if (!g.style.width)  g.style.width  = r.width  + 'px';
    if (!g.style.height) g.style.height = r.height + 'px';
    g.style.resize = 'both';
    g.style.overflow = 'auto';
  }

  // ------------- Rename Gallery title -------------
  function retitleGallery() {
    const span = document.querySelector('#gallery .dragTitle span');
    if (span && span.textContent !== 'Image GalleryPlus') {
      span.textContent = 'Image GalleryPlus';
    }
  }

  // ------------- NanoGallery helpers -------------
  function galleryThumbs() {
    const nodes = document.querySelectorAll('#dragGallery .nGY2GThumbnailImg');
    return Array.from(nodes).map(n => n.getAttribute('src') || n.src).filter(Boolean);
  }
  const baseName = (p='') => p.split('/').pop();
  const preload = (src) => { const i = new Image(); i.src = src; return i; };

  // ------------- Per-viewer state -------------
  const VIEW_STATE = new WeakMap();
  function state(root) {
    let st = VIEW_STATE.get(root);
    if (!st) {
      st = { timer: null, interval: settings().slideshowMs, zoom: 1, hoverOn: !!settings().hoverZoom };
      VIEW_STATE.set(root, st);
    }
    return st;
  }

  // ------------- Controls (left of toolbar) -------------
  function ensureControls(root) {
    let ctrls = root.querySelector(':scope > .gp-controls');
    if (!ctrls) {
      ctrls = document.createElement('div');
      ctrls.className = 'gp-controls';
      // Put it before the toolbar so it's visually left of it
      const first = root.firstChild;
      root.insertBefore(ctrls, first);
    }
    return ctrls;
  }

  // ------------- Hover-zoom (inverse pan micro-zoom) -------------
  function attachHoverZoom(root, img) {
    const s = state(root);
    const onMove = (e) => {
      const rect = img.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width - 0.5;
      const cy = (e.clientY - rect.top) / rect.height - 0.5;
      const scale = settings().hoverZoomScale || 1.08;
      // inverse motion (small translate)
      const tx = (-cx * 16).toFixed(2);
      const ty = (-cy * 16).toFixed(2);
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const onLeave = () => { img.style.transform = 'none'; };
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    // store to clean up
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

  // ------------- Wheel zoom (when hover-zoom is OFF) -------------
  function attachWheelZoom(root, img) {
    const s = state(root);
    const onWheel = (e) => {
      if (e.ctrlKey) return; // let system zoom happen if user insists
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      s.zoom = Math.min(5, Math.max(0.1, (s.zoom || 1) + step));
      img.style.transformOrigin = 'center center';
      img.style.transform = `scale(${s.zoom})`;
    };
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

  // ------------- Dissolve swap -------------
  function swapWithFade(img, nextSrc) {
    img.style.opacity = '0';
    const on = () => { img.style.opacity = '1'; img.removeEventListener('load', on); };
    img.addEventListener('load', on, { once: true });
    preload(nextSrc);
    img.src = nextSrc;
  }

  // ------------- Enhance viewer window -------------
  function enhanceViewer(root) {
    if (root.__gpEnhanced) return;
    root.__gpEnhanced = true;

    const ctrls = ensureControls(root);
    const img = root.querySelector('img');
    if (!img) return;

    // Apply persisted rect once (optional)
    const s = settings();
    if (s.viewerRect && !root.__gpRectApplied) {
      const r = s.viewerRect;
      root.style.top = r.top + 'px';
      root.style.left = r.left + 'px';
      root.style.width = r.width + 'px';
      root.style.height = r.height + 'px';
      root.__gpRectApplied = true;
    }

    // --- 💾 Save default size/position
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

    // --- 🔍 Toggle hover-zoom
    const btnZoom = document.createElement('button');
    btnZoom.className = 'gp-btn gp-zoom';
    btnZoom.title = 'Toggle hover zoom';
    btnZoom.textContent = '🔍';
    const applyZoomMode = () => {
      const on = !!settings().hoverZoom;
      if (on) { detachWheelZoom(root); attachHoverZoom(root, img); }
      else    { detachHoverZoom(root, img); attachWheelZoom(root, img); }
    };
    btnZoom.addEventListener('click', () => {
      settings().hoverZoom = !settings().hoverZoom;
      save();
      applyZoomMode();
    });

    ctrls.append(btnSave, btnZoom);

    // --- ⏯️ Slideshow + delay slider (0.1–10s)
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gp-btn gp-slide';
    btnPlay.title = 'Start/stop slideshow';
    btnPlay.textContent = '⏯️';

    const slideWrap = document.createElement('div');
    slideWrap.className = 'gp-slide-controls';

    const rng = document.createElement('input');
    rng.type = 'range'; rng.min = '100'; rng.max = '10000'; rng.step = '100';
    rng.className = 'gp-delay';

    const lbl = document.createElement('span');
    lbl.className = 'gp-slide-label';

    slideWrap.append(rng, lbl);
    ctrls.append(btnPlay, slideWrap);

    // init delay
    const st = state(root);
    rng.value = String(st.interval);
    lbl.textContent = (Math.round(st.interval / 100) / 10).toFixed(1) + 's';

    function tick() {
      const L = galleryThumbs(); if (!L.length) return;
      const cur = baseName(img.getAttribute('src') || img.src);
      let i = L.findIndex(x => baseName(x) === cur); i = (i + 1) % L.length;
      swapWithFade(img, L[i]);
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
      if (e.key === 'ArrowRight') { e.preventDefault(); i = (i + 1) % L.length; swapWithFade(img, L[i]); preload(L[(i + 1) % L.length]); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); i = (i - 1 + L.length) % L.length; swapWithFade(img, L[i]); preload(L[(i - 1 + L.length) % L.length]); }
      if (e.key === ' ')          { e.preventDefault(); btnPlay.click(); }
      if (e.key === 'Escape')     { root.querySelector('.dragClose')?.click(); }
    };
    root.addEventListener('mouseenter', () => document.addEventListener('keydown', onKey));
    root.addEventListener('mouseleave', () => document.removeEventListener('keydown', onKey));

    // Start with current zoom mode
    applyZoomMode();
  }

  // ------------- Observe added viewer windows -------------
  function observeViewers() {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes || []) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.classList?.contains('galleryImageDraggable')) {
            enhanceViewer(n);
          }
          // Also catch nested
          const nodes = n.querySelectorAll?.('.galleryImageDraggable');
          nodes && nodes.forEach(enhanceViewer);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ------------- Watch gallery panel -------------
  function observeGallery() {
    let initialized = false;
    const initGallery = () => {
      const g = document.getElementById('gallery');
      if (!g || initialized) return;
      initialized = true;
      retitleGallery();
      unlockGalleryResize();
    };
    // run once now + watch body for when #gallery appears
    initGallery();
    const mo = new MutationObserver(initGallery);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ------------- Bootstrap -------------
  ready(() => {
    injectBaseCSS();
    observeViewers();
    observeGallery();
    log('ready');
  });
})();
