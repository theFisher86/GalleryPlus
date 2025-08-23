/* GalleryPlus – index.js (drop-in)
 * Adds slideshow (⏯️ + speed slider), transition selector (😶‍🌫️ / 😵‍💫 / ➡️ / ⬇️),
 * themed glows, spiral overlay, push transitions, and preserves existing viewer UX.
 *
 * Safe to re-load. Refrains from double-binding if already initialized.
 */

(function () {
  // ---- Guard for double load ------------------------------------------------
  if (window.__GalleryPlusLoaded) return;
  window.__GalleryPlusLoaded = true;

  // ---- Constants / Helpers --------------------------------------------------
  const GP_NS = 'GalleryPlus';
  const GP_DEFAULTS = {
    enabled: true,
    openHeight: 800,
    hoverZoom: true,
    hoverZoomScale: 1.08,
    viewerRect: null,
    masonryDense: false,
    showCaptions: true,
    webpOnly: false,
    slideshowSpeedSec: 3.0,
    slideshowTransition: 'crossfade', // 'crossfade' | 'spiral' | 'pushH' | 'pushV'
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Convenience: read ST extension settings bag
  function gpSettings() {
    try {
      const ctx = SillyTavern.getContext();
      const bag = ctx.extensionSettings || (ctx.extensionSettings = {});
      bag[GP_NS] = { ...GP_DEFAULTS, ...(bag[GP_NS] || {}) };
      return bag[GP_NS];
    } catch {
      // Fallback if ST context not ready yet
      window.__gpFallbackSettings = { ...GP_DEFAULTS, ...(window.__gpFallbackSettings || {}) };
      return window.__gpFallbackSettings;
    }
  }
  function gpSaveSettings(next) {
    try {
      const ctx = SillyTavern.getContext();
      const bag = ctx.extensionSettings || (ctx.extensionSettings = {});
      bag[GP_NS] = { ...gpSettings(), ...next };
    } catch {
      window.__gpFallbackSettings = { ...gpSettings(), ...next };
    }
  }

  // Read a CSS var (computed) or return fallback
  function cssVar(name, fallback = '') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }

  // Expose/refresh our theme variables so CSS you already added can use them
  function applyThemeVars() {
    // Hover glow should follow UnderlineColor
    document.documentElement.style.setProperty('--GP-GlowColor', 'var(--SmartThemeUnderlineColor)');
    // Spiral stroke uses QuoteColor
    const quote = cssVar('--SmartThemeQuoteColor', '#7aa2f7');
    document.documentElement.style.setProperty('--GP-SpiralStroke', quote);
  }

  // ---- Viewer discovery / lifecycle ----------------------------------------
  function isViewer(root) {
    return root?.classList?.contains('galleryImageDraggable') && root.querySelector('img');
  }

  function discoverViewers() {
    return $$('.draggable.galleryImageDraggable').filter(isViewer);
  }

  function onNewViewer(root) {
    if (!isViewer(root) || root.__gpWired) return;
    root.__gpWired = true;

    buildViewerChrome(root);
    wireZoom(root);         // keeps your hover + wheel zoom behavior
    wireSlideshow(root);    // ⏯️ + speed + transition
    // keep drag/resize as-is (we're not touching MovingUI bindings)
  }

  // Mutation observer to enhance newly opened viewers
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (isViewer(n)) onNewViewer(n);
        // also catch nested img viewer (sometimes injected inside container)
        discoverViewers().forEach(onNewViewer);
      });
    }
  });

  // ---- Controls chrome (💾 🔍 ⏯️ + slider + transition) ---------------------
  function buildViewerChrome(root) {
    // Insert controls container BEFORE the panelControlBar (top-left of window)
    const pcb = $('.panelControlBar', root);
    if (!pcb) return;

    let left = $('.gp-controls-left', root);
    if (!left) {
      left = document.createElement('div');
      left.className = 'gp-controls-left'; // your CSS positions this TL above header
      // Insert before panelControlBar so it sits "to the left" visually
      pcb.parentNode.insertBefore(left, pcb);
    } else {
      left.textContent = ''; // clear
    }

    // Buttons
    const btnSave = document.createElement('button');
    btnSave.className = 'gp-btn gp-save';
    btnSave.title = 'Save as default size and location';
    btnSave.textContent = '💾';

    const btnZoom = document.createElement('button');
    btnZoom.className = 'gp-btn gp-zoom';
    btnZoom.title = 'Toggle hover zoom / wheel zoom';
    btnZoom.textContent = '🔍';

    const btnPlay = document.createElement('button');
    btnPlay.className = 'gp-btn gp-play';
    btnPlay.title = 'Start/Stop slideshow';
    btnPlay.textContent = '⏯️';

    // Speed slider
    const speed = document.createElement('input');
    speed.type = 'range';
    speed.min = '0.1';
    speed.max = '10';
    speed.step = '0.1';
    speed.value = String(gpSettings().slideshowSpeedSec || 3);
    speed.className = 'gp-speed gp-glow-on-hover';
    speed.title = 'Slideshow delay (seconds)';

    // Transition selector (emoji narrow)
    const sel = document.createElement('select');
    sel.className = 'gp-trans';
    sel.title = 'Transition';
    [
      { v: 'crossfade', t: '😶‍🌫️' },
      { v: 'spiral',    t: '😵‍💫' },
      { v: 'pushH',     t: '➡️'   },
      { v: 'pushV',     t: '⬇️'   },
    ].forEach(({ v, t }) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = t;
      sel.appendChild(o);
    });
    sel.value = gpSettings().slideshowTransition || 'crossfade';

    // Append controls
    left.appendChild(btnSave);
    left.appendChild(btnZoom);
    left.appendChild(btnPlay);
    left.appendChild(speed);
    left.appendChild(sel);

    // Wire handlers
    btnSave.addEventListener('click', () => saveViewerRect(root));
    btnZoom.addEventListener('click', () => toggleZoom(root));
    btnPlay.addEventListener('click', () => toggleSlideshow(root));
    speed.addEventListener('input', () => {
      const secs = Math.max(0.1, Math.min(10, parseFloat(speed.value) || 3));
      gpSaveSettings({ slideshowSpeedSec: secs });
      // live-update if currently running
      if (root.__gpSlideTimer) {
        startSlideshow(root); // restarts timer with new delay
      }
    });
    sel.addEventListener('change', () => {
      gpSaveSettings({ slideshowTransition: sel.value });
    });

    // Title tweak: Image Gallery -> Image GalleryPlus (gallery drawer)
    const galTitle = document.querySelector('#gallery .dragTitle span');
    if (galTitle && galTitle.textContent.trim() !== 'Image GalleryPlus') {
      galTitle.textContent = 'Image GalleryPlus';
    }
  }

  // ---- Zoom (wheel zoom + hover assist) -------------------------------------
  function wireZoom(root) {
    const img = $('img', root);
    if (!img) return;

    img.style.objectFit = 'contain'; // never crop; respect viewer box
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';

    // Persisted flag
    if (typeof root.__gpZoomEnabled !== 'boolean') {
      root.__gpZoomEnabled = !!gpSettings().hoverZoom;
    }

    let scale = 1;
    let tx = 0, ty = 0;

    function applyTransform() {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.style.transformOrigin = 'center center';
    }

    // Wheel zoom
    root.addEventListener('wheel', (ev) => {
      if (!root.__gpZoomEnabled) return;
      ev.preventDefault();
      const delta = -Math.sign(ev.deltaY) * 0.1; // zoom step
      const next = Math.max(0.2, Math.min(8, scale + delta));
      // keep center — simple approach: do not recompute tx/ty to mouse
      scale = next;
      applyTransform();
    }, { passive: false });

    // Drag image panning while zoomed (click+drag)
    let dragging = false, sx = 0, sy = 0;
    img.addEventListener('mousedown', (e) => {
      if (scale <= 1) return; // no panning if not zoomed
      dragging = true; sx = e.clientX; sy = e.clientY;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      tx += (e.clientX - sx);
      ty += (e.clientY - sy);
      sx = e.clientX; sy = e.clientY;
      applyTransform();
    });
    window.addEventListener('mouseup', () => (dragging = false));

    root.__gpZoomReset = function () {
      scale = 1; tx = 0; ty = 0; applyTransform();
    };
  }
  function toggleZoom(root) {
    root.__gpZoomEnabled = !root.__gpZoomEnabled;
    if (!root.__gpZoomEnabled && root.__gpZoomReset) root.__gpZoomReset();
    gpSaveSettings({ hoverZoom: root.__gpZoomEnabled });
  }

  // ---- Save default rect (💾) -----------------------------------------------
  function saveViewerRect(root) {
    const r = root.getBoundingClientRect();
    gpSaveSettings({
      viewerRect: { x: r.left, y: r.top, w: r.width, h: r.height },
    });
  }

  // ---- Slideshow ------------------------------------------------------------
  function wireSlideshow(root) {
    if (root.__gpSlideWired) return;
    root.__gpSlideWired = true;

    // Keyboard left/right nav (while viewer focused/hovered)
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { advance(root, +1); }
      if (e.key === 'ArrowLeft')  { advance(root, -1); }
    });

    // Preload neighbor on hover to keep memory modest
    root.addEventListener('mouseenter', () => preloadNeighbor(root, +1));
  }

  function toggleSlideshow(root) {
    if (root.__gpSlideTimer) stopSlideshow(root);
    else startSlideshow(root);
  }
  function startSlideshow(root) {
    stopSlideshow(root);
    const delayMs = Math.max(100, Math.min(10000, (gpSettings().slideshowSpeedSec || 3) * 1000));
    root.__gpSlideTimer = setInterval(() => {
      advance(root, +1);
    }, delayMs);
    root.classList.add('gp-slideshow-active');
  }
  function stopSlideshow(root) {
    if (root.__gpSlideTimer) clearInterval(root.__gpSlideTimer);
    root.__gpSlideTimer = null;
    root.classList.remove('gp-slideshow-active');
  }

  function preloadNeighbor(root, dir) {
    const nextSrc = findNeighborSrc(root, dir);
    if (!nextSrc) return;
    const img = new Image();
    img.src = nextSrc;
  }

  function advance(root, dir) {
    const nextSrc = findNeighborSrc(root, dir);
    if (!nextSrc) return;
    performTransition(root, nextSrc, gpSettings().slideshowTransition || 'crossfade');
  }

  function findNeighborSrc(root, dir) {
    // Find all thumbnails in current gallery container and current src index
    const gal = document.querySelector('#dragGallery .nGY2GallerySub');
    if (!gal) return null;

    const thumbs = $$('.nGY2GThumbnailImg.nGY2TnImg2', gal);
    if (!thumbs.length) return null;

    const current = $('img', root)?.getAttribute('src');
    const list = thumbs.map((n) => n.getAttribute('src') || n.parentElement?.style?.backgroundImage?.replace(/^url\("?|"?\)$/g,'') || '');
    let idx = list.findIndex((s) => s === current);
    if (idx < 0) {
      // fallback: try to match filename only
      const name = current?.split('/').pop();
      idx = list.findIndex((s) => s.split('/').pop() === name);
    }
    if (idx < 0) return null;

    const next = (idx + (dir > 0 ? 1 : -1) + list.length) % list.length;
    return list[next];
  }

  // ---- Transitions ----------------------------------------------------------
  function performTransition(root, nextSrc, type) {
    const baseImg = $('img', root);
    if (!baseImg) return;

    // Avoid re-entrant transitions
    if (root.__gpTransitioning) return;
    root.__gpTransitioning = true;

    const end = () => { root.__gpTransitioning = false; };

    switch (type) {
      case 'spiral':
        transitionCrossfade(root, baseImg, nextSrc, 450, () => {
          addSpiralOverlay(root, 600);
        }, end);
        break;
      case 'pushH':
        transitionPush(root, baseImg, nextSrc, 'H', 350, end);
        break;
      case 'pushV':
        transitionPush(root, baseImg, nextSrc, 'V', 350, end);
        break;
      case 'crossfade':
      default:
        transitionCrossfade(root, baseImg, nextSrc, 350, null, end);
        break;
    }
  }

  // Crossfade by ghosting current image, swapping base src, then fading in
  function transitionCrossfade(root, baseImg, nextSrc, durMs, beforeFx, done) {
    const rect = baseImg.getBoundingClientRect();
    const ghost = baseImg.cloneNode(true);
    ghost.classList.add('gp-ghost');
    ghost.style.position = 'absolute';
    ghost.style.top = baseImg.offsetTop + 'px';
    ghost.style.left = baseImg.offsetLeft + 'px';
    ghost.style.width = baseImg.clientWidth + 'px';
    ghost.style.height = baseImg.clientHeight + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.transition = `opacity ${durMs}ms ease`;
    root.appendChild(ghost);

    // Swap base src hidden, then fade it up while ghost fades out
    baseImg.style.opacity = '0';
    baseImg.src = nextSrc;

    if (typeof beforeFx === 'function') beforeFx();

    requestAnimationFrame(() => {
      baseImg.style.transition = `opacity ${durMs}ms ease`;
      baseImg.style.opacity = '1';
      ghost.style.opacity = '0';
      setTimeout(() => {
        ghost.remove();
        done && done();
      }, durMs + 20);
    });
  }

  // Push transition: move current out and next in along X or Y
  function transitionPush(root, baseImg, nextSrc, axis = 'H', durMs = 350, done) {
    const rect = baseImg.getBoundingClientRect();

    // create two overlay imgs
    const cur = baseImg.cloneNode(true);
    const nxt = baseImg.cloneNode(true);
    nxt.src = nextSrc;

    [cur, nxt].forEach((el) => {
      el.classList.add('gp-ghost');
      el.style.position = 'absolute';
      el.style.top = baseImg.offsetTop + 'px';
      el.style.left = baseImg.offsetLeft + 'px';
      el.style.width = baseImg.clientWidth + 'px';
      el.style.height = baseImg.clientHeight + 'px';
      el.style.pointerEvents = 'none';
      el.style.transition = `transform ${durMs}ms ease, opacity ${durMs}ms ease`;
      root.appendChild(el);
    });

    const distX = axis === 'H' ? 1 : 0;
    const distY = axis === 'V' ? 1 : 0;

    // start positions
    cur.style.transform = 'translate(0,0)';
    nxt.style.transform = `translate(${distX ? 100 : 0}%, ${distY ? 100 : 0}%)`;
    nxt.style.opacity = '1';

    // animate
    requestAnimationFrame(() => {
      cur.style.transform = `translate(${distX ? -100 : 0}%, ${distY ? -100 : 0}%)`;
      cur.style.opacity = '0';
      nxt.style.transform = 'translate(0,0)';
      setTimeout(() => {
        // commit the real img source
        baseImg.src = nextSrc;
        cur.remove(); nxt.remove();
        done && done();
      }, durMs + 20);
    });
  }

  // Spiral overlay: SVG, 1px themed stroke, scales/rotates then fades
  function addSpiralOverlay(root, durMs = 600) {
    // Build SVG sized to viewer
    const box = root.getBoundingClientRect();
    const w = Math.max(100, box.width);
    const h = Math.max(100, box.height);
    const cx = w / 2;
    const cy = h / 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('gp-spiral');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    svg.style.opacity = '0.85';
    svg.style.transition = `transform ${durMs}ms ease, opacity ${durMs}ms ease`;

    // Archimedean spiral path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--GP-SpiralStroke)');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('vector-effect', 'non-scaling-stroke');

    const turns = 3.2;          // ~3 turns
    const steps = 850;          // smooth curve
    const a = 1.0;
    const b = Math.min(w, h) * 0.035; // spacing between arms
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (Math.PI * 2 * turns);
      const r = a + b * t;
      const x = cx + r * Math.cos(t);
      const y = cy + r * Math.sin(t);
      d += (i === 0 ? 'M ' : ' L ') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    path.setAttribute('d', d);
    svg.appendChild(path);
    root.appendChild(svg);

    // Animate scale/rotate out
    svg.style.transformOrigin = '50% 50%';
    svg.style.transform = 'scale(0.25) rotate(0deg)';
    requestAnimationFrame(() => {
      svg.style.transform = 'scale(1.05) rotate(360deg)';
      svg.style.opacity = '0';
      setTimeout(() => svg.remove(), durMs + 30);
    });
  }

  // ---- Boot -----------------------------------------------------------------
  function init() {
    applyThemeVars();
    // Enhance any existing viewers
    discoverViewers().forEach(onNewViewer);

    // Watch for new viewers
    mo.observe(document.body, { childList: true, subtree: true });

    // Also, make sure gallery title says Image GalleryPlus
    const galTitle = document.querySelector('#gallery .dragTitle span');
    if (galTitle && galTitle.textContent.trim() !== 'Image GalleryPlus') {
      galTitle.textContent = 'Image GalleryPlus';
    }
  }

  // Run now or on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // ---- Debug API (optional) -------------------------------------------------
  window.GalleryPlus = Object.assign(window.GalleryPlus || {}, {
    settings: gpSettings,
    saveSettings: gpSaveSettings,
    rescan: () => discoverViewers().forEach(onNewViewer),
    setTransition: (t) => gpSaveSettings({ slideshowTransition: t }),
    setDelay: (s) => gpSaveSettings({ slideshowSpeedSec: s }),
  });
})();
