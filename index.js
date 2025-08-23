/* GalleryPlus – index.js (refined spiral)
 * Slideshow ⏯️ + slider + transition menu + zoom + theme glows + refined spiral transition
 * - Spiral is a smooth SVG spiral-mask reveal with a subtle themed glow (SmartThemeQuoteColor)
 * - Red delay warning only when Spiral is selected and delay < 3s
 */

(function () {
  if (window.__GalleryPlusLoaded) return;
  window.__GalleryPlusLoaded = true;

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

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function gpSettings() {
    try {
      const ctx = SillyTavern.getContext();
      const bag = ctx.extensionSettings || (ctx.extensionSettings = {});
      bag[GP_NS] = { ...GP_DEFAULTS, ...(bag[GP_NS] || {}) };
      return bag[GP_NS];
    } catch {
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

  function cssVar(name, fallback = '') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }

  function applyThemeVars() {
    // hover glow for buttons/slider uses ST underline color
    document.documentElement.style.setProperty('--GP-GlowColor', 'var(--SmartThemeUnderlineColor)');
    // Spiral stroke color uses ST quote color
    const quote = cssVar('--SmartThemeQuoteColor', '#7aa2f7');
    document.documentElement.style.setProperty('--GP-SpiralStroke', quote);
  }

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
    wireZoom(root);
    wireSlideshow(root);
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (isViewer(n)) onNewViewer(n);
      });
    }
  });

  // ==================== Controls (💾 🔍 ⏯️ + slider + transition) ====================

  function buildViewerChrome(root) {
    const pcb = $('.panelControlBar', root);
    if (!pcb) return;

    let left = $('.gp-controls-left', root);
    if (!left) {
      left = document.createElement('div');
      left.className = 'gp-controls-left';
      // place to the left of the panelControlBar (sibling before it)
      pcb.parentNode.insertBefore(left, pcb);
    } else {
      left.textContent = '';
    }

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

    const speed = document.createElement('input');
    speed.type = 'range';
    speed.min = '0.1';
    speed.max = '10';
    speed.step = '0.1';
    speed.value = String(gpSettings().slideshowSpeedSec || 3);
    speed.className = 'gp-speed gp-glow-on-hover';
    speed.title = 'Slideshow delay (seconds)';

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

    left.appendChild(btnSave);
    left.appendChild(btnZoom);
    left.appendChild(btnPlay);
    left.appendChild(speed);
    left.appendChild(sel);

    // Wire
    btnSave.addEventListener('click', () => saveViewerRect(root));
    btnZoom.addEventListener('click', () => toggleZoom(root));
    btnPlay.addEventListener('click', () => toggleSlideshow(root));

    const applyWarn = () =>
      applySpeedWarning(speed, parseFloat(speed.value) || 3, sel.value);

    speed.addEventListener('input', () => {
      const secs = clamp(parseFloat(speed.value) || 3, 0.1, 10);
      gpSaveSettings({ slideshowSpeedSec: secs });
      applyWarn();
      if (root.__gpSlideTimer) startSlideshow(root); // restart
    });

    sel.addEventListener('change', () => {
      gpSaveSettings({ slideshowTransition: sel.value });
      applyWarn();
    });

    // Initial
    applyWarn();

    // Tweak gallery title text (once)
    const galTitle = document.querySelector('#gallery .dragTitle span');
    if (galTitle && galTitle.textContent.trim() !== 'Image GalleryPlus') {
      galTitle.textContent = 'Image GalleryPlus';
    }
  }

  function applySpeedWarning(speedEl, secs, transition) {
    const warn = transition === 'spiral' && secs < 3;
    speedEl.classList.toggle('gp-speed-warning', warn);
    if (warn) {
      speedEl.style.outline = '2px solid #ff4d4f';
      speedEl.style.boxShadow = '0 0 10px #ff4d4f';
    } else {
      speedEl.style.outline = '';
      speedEl.style.boxShadow = '';
    }
  }

  // ================================== Zoom ===================================

  function wireZoom(root) {
    const img = $('img', root);
    if (!img) return;

    img.style.objectFit = 'contain';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';

    if (typeof root.__gpZoomEnabled !== 'boolean') {
      root.__gpZoomEnabled = !!gpSettings().hoverZoom;
    }

    let scale = 1;
    let tx = 0, ty = 0;

    function applyTransform() {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.style.transformOrigin = 'center center';
    }

    root.addEventListener('wheel', (ev) => {
      if (!root.__gpZoomEnabled) return;
      ev.preventDefault();
      const delta = -Math.sign(ev.deltaY) * 0.1;
      scale = clamp(scale + delta, 0.2, 8);
      applyTransform();
    }, { passive: false });

    let dragging = false, sx = 0, sy = 0;
    img.addEventListener('mousedown', (e) => {
      if (scale <= 1) return;
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

    root.__gpZoomReset = function () { scale = 1; tx = 0; ty = 0; applyTransform(); };
  }
  function toggleZoom(root) {
    root.__gpZoomEnabled = !root.__gpZoomEnabled;
    if (!root.__gpZoomEnabled && root.__gpZoomReset) root.__gpZoomReset();
    gpSaveSettings({ hoverZoom: root.__gpZoomEnabled });
  }

  // ============================== Save rect ==================================

  function saveViewerRect(root) {
    const r = root.getBoundingClientRect();
    gpSaveSettings({
      viewerRect: { x: r.left, y: r.top, w: r.width, h: r.height },
    });
  }

  // ============================= Slideshow ===================================

  function wireSlideshow(root) {
    if (root.__gpSlideWired) return;
    root.__gpSlideWired = true;

    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { advance(root, +1); }
      if (e.key === 'ArrowLeft')  { advance(root, -1); }
    });
    root.addEventListener('mouseenter', () => preloadNeighbor(root, +1));
  }

  function toggleSlideshow(root) {
    if (root.__gpSlideTimer) stopSlideshow(root);
    else startSlideshow(root);
  }
  function startSlideshow(root) {
    stopSlideshow(root);
    const delayMs = clamp((gpSettings().slideshowSpeedSec || 3) * 1000, 100, 10000);
    root.__gpSlideTimer = setInterval(() => advance(root, +1), delayMs);
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
    const gal = document.querySelector('#dragGallery .nGY2GallerySub');
    if (!gal) return null;
    const thumbs = $$('.nGY2GThumbnailImg.nGY2TnImg2', gal);
    if (!thumbs.length) return null;

    const current = $('img', root)?.getAttribute('src');
    const list = thumbs.map((n) => n.getAttribute('src') || n.parentElement?.style?.backgroundImage?.replace(/^url\("?|"?\)$/g,'') || '');
    let idx = list.findIndex((s) => s === current);
    if (idx < 0) {
      const name = current?.split('/').pop();
      idx = list.findIndex((s) => s.split('/').pop() === name);
    }
    if (idx < 0) return null;

    const next = (idx + (dir > 0 ? 1 : -1) + list.length) % list.length;
    return list[next];
  }

  // ============================ Transitions ==================================

  function performTransition(root, nextSrc, type) {
    const baseImg = $('img', root);
    if (!baseImg) return;
    if (root.__gpTransitioning) return;
    root.__gpTransitioning = true;

    const end = () => { root.__gpTransitioning = false; };

    switch (type) {
      case 'spiral':
        transitionSpiralRefined(root, baseImg, nextSrc, end);
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

  // Crossfade
  function transitionCrossfade(root, baseImg, nextSrc, durMs, beforeFx, done) {
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

    baseImg.style.opacity = '0';
    baseImg.src = nextSrc;

    if (typeof beforeFx === 'function') beforeFx();

    requestAnimationFrame(() => {
      baseImg.style.transition = `opacity ${durMs}ms ease`;
      baseImg.style.opacity = '1';
      ghost.style.opacity = '0';
      setTimeout(() => { ghost.remove(); done && done(); }, durMs + 20);
    });
  }

  // Push
  function transitionPush(root, baseImg, nextSrc, axis = 'H', durMs = 350, done) {
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

    cur.style.transform = 'translate(0,0)';
    nxt.style.transform = `translate(${distX ? 100 : 0}%, ${distY ? 100 : 0}%)`;
    nxt.style.opacity = '1';

    requestAnimationFrame(() => {
      cur.style.transform = `translate(${distX ? -100 : 0}%, ${distY ? -100 : 0}%)`;
      cur.style.opacity = '0';
      nxt.style.transform = 'translate(0,0)';
      setTimeout(() => {
        baseImg.src = nextSrc;
        cur.remove(); nxt.remove();
        done && done();
      }, durMs + 20);
    });
  }

  // Spiral (refined “looks good” version)
  // Uses an SVG spiral path as a mask that grows in length and thickness while rotating slightly.
  // Adds a subtle SmartThemeQuoteColor glow stroke to keep it on-brand.
  function transitionSpiralRefined(root, baseImg, nextSrc, done) {
    const delaySec = gpSettings().slideshowSpeedSec || 3;
    const transMs  = Math.max(450, Math.round((delaySec * 1000) / 6)); // ~1/6 of delay

    // Overlay SVG sized to viewer
    const box = root.getBoundingClientRect();
    const w = Math.max(100, Math.round(box.width));
    const h = Math.max(100, Math.round(box.height));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    svg.style.opacity = '1';
    svg.style.transformOrigin = '50% 50%';

    // defs + mask
    const defs = document.createElementNS(svg.namespaceURI, 'defs');
    const mask = document.createElementNS(svg.namespaceURI, 'mask');
    const maskId = `gpMask_${Math.random().toString(36).slice(2)}`;
    mask.setAttribute('id', maskId);

    // Mask background (hide by default)
    const mRect = document.createElementNS(svg.namespaceURI, 'rect');
    mRect.setAttribute('x', '0');
    mRect.setAttribute('y', '0');
    mRect.setAttribute('width', '100%');
    mRect.setAttribute('height', '100%');
    mRect.setAttribute('fill', 'black');
    mask.appendChild(mRect);

    // Build Archimedean spiral path
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'white'); // white = reveal in mask
    path.setAttribute('stroke-width', '1');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');

    const cx = w / 2;
    const cy = h / 2;
    const turns = 3.0; // total turns
    const steps = 1400;
    const maxR = Math.hypot(w, h) * 0.55;
    const b = maxR / (Math.PI * 2 * turns); // r = b * theta
    const a = 0; // start at center

    let d = '';
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (Math.PI * 2 * turns);
      const r = a + b * t;
      const x = cx + r * Math.cos(t);
      const y = cy + r * Math.sin(t);
      d += (i === 0 ? 'M ' : ' L ') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    path.setAttribute('d', d);

    // Use dasharray animation to reveal more length of the spiral over time
    // and animate stroke-width to fill more area smoothly.
    mask.appendChild(path);
    defs.appendChild(mask);

    // Put B under a mask
    const imgB = document.createElementNS(svg.namespaceURI, 'image');
    imgB.setAttributeNS('http://www.w3.org/1999/xlink', 'href', nextSrc);
    imgB.setAttribute('x', '0');
    imgB.setAttribute('y', '0');
    imgB.setAttribute('width', String(w));
    imgB.setAttribute('height', String(h));
    imgB.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    imgB.setAttribute('mask', `url(#${maskId})`);

    // Themed spiral stroke overlay for a gentle glow
    const stroke = document.createElementNS(svg.namespaceURI, 'path');
    stroke.setAttribute('d', d);
    stroke.setAttribute('fill', 'none');
    stroke.setAttribute('stroke', 'var(--GP-SpiralStroke)');
    stroke.setAttribute('stroke-width', '2');
    stroke.setAttribute('stroke-linecap', 'round');
    stroke.setAttribute('vector-effect', 'non-scaling-stroke');
    stroke.style.filter = `drop-shadow(0 0 6px var(--GP-SpiralStroke)) drop-shadow(0 0 16px var(--GP-SpiralStroke))`;
    stroke.style.opacity = '0.75';

    svg.appendChild(defs);
    svg.appendChild(imgB);
    svg.appendChild(stroke);
    root.appendChild(svg);

    // Also fade base A for extra smoothness
    const startOpacity = 1, endOpacity = 0;
    const L = (() => {
      try { return path.getTotalLength(); } catch { return 3000; }
    })();

    // Initialize dash so nothing is shown at t=0
    path.style.strokeDasharray = `0 ${L}`;
    path.style.strokeDashoffset = `${L}`;
    stroke.style.strokeDasharray = `0 ${L}`;
    stroke.style.strokeDashoffset = `${L}`;

    const startT = performance.now();
    const endT   = startT + transMs;

    function frame(now) {
      const p = clamp((now - startT) / transMs, 0, 1);

      // Slight rotation for a bit of swirl momentum
      svg.style.transform = `rotate(${30 * p}deg)`; // default 15 * p

      // Grow the visible portion of the spiral along its length
      const visibleLen = L * (0.15 + 0.85 * p); // start with a small chunk
      path.style.strokeDasharray  = `${visibleLen} ${L}`;
      path.style.strokeDashoffset = `${L - visibleLen}`;
      stroke.style.strokeDasharray  = `${visibleLen} ${L}`;
      stroke.style.strokeDashoffset = `${L - visibleLen}`;

      // Thicken stroke to fill area progressively (smooth reveal)
      const maxSW = Math.max(w, h) * 0.45; // thick enough to cover default 0.25
      const sw = 8 + (maxSW - 8) * easeOutCubic(p);
      path.setAttribute('stroke-width', `${sw}`);
      stroke.setAttribute('stroke-width', `${Math.max(2, sw * 0.06)}`);

      // Fade A underneath
      const a = startOpacity + (endOpacity - startOpacity) * p;
      baseImg.style.opacity = String(a);

      if (now < endT) {
        requestAnimationFrame(frame);
      } else {
        // Commit to B
        baseImg.style.opacity = '1';
        baseImg.src = nextSrc;
        svg.remove();
        done && done();
      }
    }

    requestAnimationFrame(frame);
  }

  // ============================ Boot & Utils =================================

  function init() {
    applyThemeVars();
    discoverViewers().forEach(onNewViewer);
    mo.observe(document.body, { childList: true, subtree: true });

    const galTitle = document.querySelector('#gallery .dragTitle span');
    if (galTitle && galTitle.textContent.trim() !== 'Image GalleryPlus') {
      galTitle.textContent = 'Image GalleryPlus';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  function clamp(v, mn, mx) { return Math.min(mx, Math.max(mn, v)); }
  function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }

  // Dev helpers exposed
  window.GalleryPlus = Object.assign(window.GalleryPlus || {}, {
    settings: gpSettings,
    saveSettings: gpSaveSettings,
    rescan: () => discoverViewers().forEach(onNewViewer),
    setTransition: (t) => gpSaveSettings({ slideshowTransition: t }),
    setDelay: (s) => gpSaveSettings({ slideshowSpeedSec: s }),
  });
})();
