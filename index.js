/* GalleryPlus – index.js (spiral v2)
 * Slideshow ⏯️ + slider + transition menu + zoom + theme glows + rich spiral transition
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
    // Hover glow for buttons/slider
    document.documentElement.style.setProperty('--GP-GlowColor', 'var(--SmartThemeUnderlineColor)');
    // Spiral stroke color
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
        discoverViewers().forEach(onNewViewer);
      });
    }
  });

  // =============== Controls (💾 🔍 ⏯️ + slider + transition) =================

  function buildViewerChrome(root) {
    const pcb = $('.panelControlBar', root);
    if (!pcb) return;

    let left = $('.gp-controls-left', root);
    if (!left) {
      left = document.createElement('div');
      left.className = 'gp-controls-left';
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

    // Wire handlers
    btnSave.addEventListener('click', () => saveViewerRect(root));
    btnZoom.addEventListener('click', () => toggleZoom(root));
    btnPlay.addEventListener('click', () => toggleSlideshow(root));
    speed.addEventListener('input', () => {
      const secs = clamp(parseFloat(speed.value) || 3, 0.1, 10);
      gpSaveSettings({ slideshowSpeedSec: secs });
      applySpeedWarning(speed, secs);
      if (root.__gpSlideTimer) startSlideshow(root); // restart with new delay
    });
    sel.addEventListener('change', () => {
      gpSaveSettings({ slideshowTransition: sel.value });
    });

    // Initial warning state
    applySpeedWarning(speed, parseFloat(speed.value) || 3);

    // Tweak gallery title text
    const galTitle = document.querySelector('#gallery .dragTitle span');
    if (galTitle && galTitle.textContent.trim() !== 'Image GalleryPlus') {
      galTitle.textContent = 'Image GalleryPlus';
    }
  }

  function applySpeedWarning(speedEl, secs) {
    const warn = secs < 3;
    speedEl.classList.toggle('gp-speed-warning', warn);
    // Inline visual guarantee (in case theme CSS doesn’t style input[type=range] deeply)
    if (warn) {
      speedEl.style.outline = '2px solid #ff4d4f';
      speedEl.style.boxShadow = '0 0 10px #ff4d4f';
    } else {
      speedEl.style.outline = '';
      speedEl.style.boxShadow = '';
    }
  }

  // ============================== Zoom =======================================

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

  // ========================== Save viewer rect ===============================

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
        transitionSpiralRich(root, baseImg, nextSrc, end);
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

  // Spiral v2 (mask reveal + edge glow + pulse)
  function transitionSpiralRich(root, baseImg, nextSrc, done) {
    const delaySec = gpSettings().slideshowSpeedSec || 3;
    const transMs  = Math.max(400, Math.round((delaySec * 1000) / 6)); // 1/6 of delay
    const pulseMs  = Math.max(200, Math.round((delaySec * 1000) / 3)); // 1/3 of delay

    // 1) Edge glow around Image A
    const quote = cssVar('--SmartThemeQuoteColor', '#7aa2f7');
    const prevShadow = baseImg.style.boxShadow;
    const prevOutline = baseImg.style.outline;
    baseImg.style.boxShadow = `0 0 22px ${quote}, 0 0 44px ${quote}55`;
    baseImg.style.outline = `1px solid ${quote}`;

    // 2) SVG overlay with mask(reveal) for Image B
    const box = root.getBoundingClientRect();
    const w = Math.max(100, Math.round(box.width));
    const h = Math.max(100, Math.round(box.height));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('gp-spiral');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    svg.style.opacity = '1';

    const defs = document.createElementNS(svg.namespaceURI, 'defs');
    const mask = document.createElementNS(svg.namespaceURI, 'mask');
    const maskId = `gpMask_${Math.random().toString(36).slice(2)}`;
    mask.setAttribute('id', maskId);

    // Mask: black background (hide) + white spiral stroke (show)
    const mRect = document.createElementNS(svg.namespaceURI, 'rect');
    mRect.setAttribute('x', '0');
    mRect.setAttribute('y', '0');
    mRect.setAttribute('width', '100%');
    mRect.setAttribute('height', '100%');
    mRect.setAttribute('fill', 'black');
    mask.appendChild(mRect);

    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'white'); // white shows in mask
    path.setAttribute('stroke-width', '1'); // animated to 50
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');

    const cx = w / 2;
    const cy = h / 2;
    const turnsToEdge = 1.0; // first reach to edges
    const extraTurns   = 2.0; // then +2 rotations
    const totalTurns   = turnsToEdge + extraTurns; // ~3
    const steps = 1100;
    const a = 0.6;
    const b = Math.min(w, h) * 0.038;

    let d = '';
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (Math.PI * 2 * totalTurns);
      const r = a + b * t;
      const x = cx + r * Math.cos(t);
      const y = cy + r * Math.sin(t);
      d += (i === 0 ? 'M ' : ' L ') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    path.setAttribute('d', d);
    mask.appendChild(path);
    defs.appendChild(mask);

    // Color spiral stroke path (for visible overlay) – sits on top
    const spiralStroke = document.createElementNS(svg.namespaceURI, 'path');
    spiralStroke.setAttribute('d', d);
    spiralStroke.setAttribute('fill', 'none');
    spiralStroke.setAttribute('stroke', 'var(--GP-SpiralStroke)');
    spiralStroke.setAttribute('stroke-width', '1');
    spiralStroke.setAttribute('stroke-linecap', 'round');
    spiralStroke.setAttribute('vector-effect', 'non-scaling-stroke');
    spiralStroke.style.opacity = '0.5';

    // Image B inside the mask
    const imgB = document.createElementNS(svg.namespaceURI, 'image');
    imgB.setAttributeNS('http://www.w3.org/1999/xlink', 'href', nextSrc);
    imgB.setAttribute('x', '0');
    imgB.setAttribute('y', '0');
    imgB.setAttribute('width', String(w));
    imgB.setAttribute('height', String(h));
    imgB.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    imgB.setAttribute('mask', `url(#${maskId})`);

    svg.appendChild(defs);
    svg.appendChild(imgB);
    svg.appendChild(spiralStroke);
    root.appendChild(svg);

    // Animate:
    // - stroke-width: 1 -> 50
    // - group rotation: 0 -> 1080deg (3 turns) & scale 0.2 -> 1.15
    // - stroke opacity pulse: 0.3–0.7 @ (delay/3)
    // - base image fades under spiral
    const startT = performance.now();
    const endT   = startT + transMs;

    const centerX = w / 2;
    const centerY = h / 2;
    svg.style.transformOrigin = '50% 50%';
    svg.style.transform = 'scale(0.2) rotate(0deg)';

    const pulseAmp = 0.2;      // +/- 0.2 around 0.5 => 0.3..0.7
    const baseOp0  = 1.0;
    const baseOp1  = 0.0;

    function frame(now) {
      const p = clamp((now - startT) / transMs, 0, 1);

      // stroke width growth
      const sw = 1 + 49 * p;
      path.setAttribute('stroke-width', String(sw));
      spiralStroke.setAttribute('stroke-width', String(sw));

      // spin & grow
      const rot = 1080 * p; // 3 rotations total (to edge + 2 more)
      const sca = 0.2 + 0.95 * p;
      svg.style.transform = `scale(${sca}) rotate(${rot}deg)`;

      // pulse opacity 0.3..0.7 with period = pulseMs
      const phase = (now - startT) / pulseMs;
      const op = 0.5 + pulseAmp * Math.sin(phase * Math.PI * 2);
      spiralStroke.style.opacity = String(clamp(op, 0.3, 0.7));

      // fade base A out under spiral
      const baseOp = baseOp0 + (baseOp1 - baseOp0) * p;
      baseImg.style.opacity = String(baseOp);

      if (now < endT) {
        requestAnimationFrame(frame);
      } else {
        // Commit to next image
        baseImg.style.opacity = '1';
        baseImg.src = nextSrc;

        // Cleanup
        baseImg.style.boxShadow = prevShadow;
        baseImg.style.outline   = prevOutline;
        svg.remove();
        done && done();
      }
    }
    requestAnimationFrame(frame);
  }

  // ============================= Boot ========================================

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

  // =========================== Utilities =====================================

  function clamp(v, mn, mx) { return Math.min(mx, Math.max(mn, v)); }

  // Debug/controls
  window.GalleryPlus = Object.assign(window.GalleryPlus || {}, {
    settings: gpSettings,
    saveSettings: gpSaveSettings,
    rescan: () => discoverViewers().forEach(onNewViewer),
    setTransition: (t) => gpSaveSettings({ slideshowTransition: t }),
    setDelay: (s) => gpSaveSettings({ slideshowSpeedSec: s }),
  });
})();
