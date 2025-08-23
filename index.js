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
    speed.width = '40%';
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

  // ---old transition code---
  // function transitionSpiralRefined(root, baseImg, nextSrc, done) {
  //   const delaySec = gpSettings().slideshowSpeedSec || 3;
  //   // const transMs  = Math.max(450, Math.round((delaySec * 1000) / 6)); // ~1/6 of delay
  //   let transMs = Math.round((delaySec * 1000) / 3); // ~1/3 of delay
  //   transMs = Math.max(2500, transMs);               // ensure at least 1s


  //   // Overlay SVG sized to viewer
  //   const box = root.getBoundingClientRect();
  //   const w = Math.max(100, Math.round(box.width));
  //   const h = Math.max(100, Math.round(box.height));

  //   const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  //   svg.setAttribute('width', w);
  //   svg.setAttribute('height', h);
  //   svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  //   svg.style.position = 'absolute';
  //   svg.style.inset = '0';
  //   svg.style.pointerEvents = 'none';
  //   svg.style.opacity = '1';
  //   svg.style.transformOrigin = '50% 50%';

  //   // defs + mask
  //   const defs = document.createElementNS(svg.namespaceURI, 'defs');
  //   const mask = document.createElementNS(svg.namespaceURI, 'mask');
  //   const maskId = `gpMask_${Math.random().toString(36).slice(2)}`;
  //   mask.setAttribute('id', maskId);

  //   // Mask background (hide by default)
  //   const mRect = document.createElementNS(svg.namespaceURI, 'rect');
  //   mRect.setAttribute('x', '0');
  //   mRect.setAttribute('y', '0');
  //   mRect.setAttribute('width', '100%');
  //   mRect.setAttribute('height', '100%');
  //   mRect.setAttribute('fill', 'black');
  //   mask.appendChild(mRect);

  //   // Build Archimedean spiral path
  //   const path = document.createElementNS(svg.namespaceURI, 'path');
  //   path.setAttribute('fill', 'none');
  //   path.setAttribute('stroke', 'white'); // white = reveal in mask
  //   path.setAttribute('stroke-width', '1');
  //   path.setAttribute('stroke-linecap', 'round');
  //   path.setAttribute('vector-effect', 'non-scaling-stroke');

  //   const cx = w / 2;
  //   const cy = h / 2;
  //   const turns = 3.0; // total turns
  //   const steps = 1400;
  //   const maxR = Math.hypot(w, h) * 0.55;
  //   const b = maxR / (Math.PI * 2 * turns); // r = b * theta
  //   const a = 0; // start at center

  //   let d = '';
  //   for (let i = 0; i <= steps; i++) {
  //     const t = (i / steps) * (Math.PI * 2 * turns);
  //     const r = a + b * t;
  //     const x = cx + r * Math.cos(t);
  //     const y = cy + r * Math.sin(t);
  //     d += (i === 0 ? 'M ' : ' L ') + x.toFixed(2) + ' ' + y.toFixed(2);
  //   }
  //   path.setAttribute('d', d);

  //   // Use dasharray animation to reveal more length of the spiral over time
  //   // and animate stroke-width to fill more area smoothly.
  //   mask.appendChild(path);
  //   defs.appendChild(mask);

  //   // Put B under a mask
  //   const imgB = document.createElementNS(svg.namespaceURI, 'image');
  //   imgB.setAttributeNS('http://www.w3.org/1999/xlink', 'href', nextSrc);
  //   imgB.setAttribute('x', '0');
  //   imgB.setAttribute('y', '0');
  //   imgB.setAttribute('width', String(w));
  //   imgB.setAttribute('height', String(h));
  //   imgB.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  //   imgB.setAttribute('mask', `url(#${maskId})`);

  //   // Themed spiral stroke overlay for a gentle glow
  //   const stroke = document.createElementNS(svg.namespaceURI, 'path');
  //   stroke.setAttribute('d', d);
  //   stroke.setAttribute('fill', 'none');
  //   stroke.setAttribute('stroke', 'var(--GP-SpiralStroke)');
  //   stroke.setAttribute('stroke-width', '2');
  //   stroke.setAttribute('stroke-linecap', 'round');
  //   stroke.setAttribute('vector-effect', 'non-scaling-stroke');
  //   stroke.style.filter = `drop-shadow(0 0 6px var(--GP-SpiralStroke)) drop-shadow(0 0 16px var(--GP-SpiralStroke))`;
  //   stroke.style.opacity = '0.75';

  //   svg.appendChild(defs);
  //   svg.appendChild(imgB);
  //   svg.appendChild(stroke);
  //   root.appendChild(svg);

  //   // Also fade base A for extra smoothness
  //   const startOpacity = 1, endOpacity = 0;
  //   const L = (() => {
  //     try { return path.getTotalLength(); } catch { return 3000; }
  //   })();

  //   // Initialize dash so nothing is shown at t=0
  //   path.style.strokeDasharray = `0 ${L}`;
  //   path.style.strokeDashoffset = `${L}`;
  //   stroke.style.strokeDasharray = `0 ${L}`;
  //   stroke.style.strokeDashoffset = `${L}`;

  //   const startT = performance.now();
  //   const endT   = startT + transMs;

  //   function frame(now) {
  //     const p = clamp((now - startT) / transMs, 0, 1);

  //     // Slight rotation for a bit of swirl momentum
  //     svg.style.transform = `rotate(${45 * p}deg)`; // default 15 * p

  //     // Grow the visible portion of the spiral along its length
  //     const visibleLen = L * (0.15 + 0.85 * p); // start with a small chunk
  //     path.style.strokeDasharray  = `${visibleLen} ${L}`;
  //     path.style.strokeDashoffset = `${L - visibleLen}`;
  //     stroke.style.strokeDasharray  = `${visibleLen} ${L}`;
  //     stroke.style.strokeDashoffset = `${L - visibleLen}`;

  //     // Thicken stroke to fill area progressively (smooth reveal)
  //     const maxSW = Math.max(w, h) * 0.65; // thick enough to cover default 0.25
  //     const sw = 8 + (maxSW - 8) * easeOutCubic(p);
  //     path.setAttribute('stroke-width', `${sw}`);
  //     stroke.setAttribute('stroke-width', `${Math.max(2, sw * 0.06)}`);

  //     // Fade A underneath
  //     const a = startOpacity + (endOpacity - startOpacity) * p;
  //     baseImg.style.opacity = String(a);

  //     if (now < endT) {
  //       requestAnimationFrame(frame);
  //     } else {
  //       // Commit to B
  //       baseImg.style.opacity = '1';
  //       baseImg.src = nextSrc;
  //       svg.remove();
  //       done && done();
  //     }
  //   }

  //   requestAnimationFrame(frame);
  // }

  // ---old new transtion code---
//   function transitionSpiralRefined(root, baseImg, nextSrc, done) {
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

// --newest transition code--
function transitionSpiralRefined(root, baseImg, nextSrc, done) {
  // --- Tunables -----------------------------------------------------------
  // You can hot-override these via window.GP_SPIRAL_OVERRIDES (see console patch).
  const w = Math.max(1, root.clientWidth);
  const h = Math.max(1, root.clientHeight);
  const cx = w / 2, cy = h / 2;
  const minSide = Math.min(w, h);

  const OV = (window.GP_SPIRAL_OVERRIDES || {});
  const TURNS          = OV.turns ?? 3.0;                  // total rotations of spiral
  const DENSITY        = OV.density ?? 1.85;               // samples per pixel hypot multiplier
  const MIN_STROKE     = OV.minStroke ?? 26;               // px, start thickness
  const MAX_STROKE     = Math.max(
                          MIN_STROKE + 8,
                          Math.round((OV.maxStrokeFactor ?? 0.34) * minSide)
                        );                                  // px, end thickness
  const BLUR_PX        = OV.blurPx ?? 0.7;                 // small blur to close hairline gaps

  // Transition timing: ~1/3 of slide delay, at least 1s (you already added the lower-bound)
  const delaySec = gpSettings().slideshowSpeedSec || 3;
  const transMs  = Math.max(1000, Math.round((delaySec * 1000) / 3));

  // --- Easing -------------------------------------------------------------
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeInOutCubic = (t) => (t < 0.5) ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutCubic   = (t) => 1 - Math.pow(1 - t, 3);

  // --- SVG overlay --------------------------------------------------------
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  Object.assign(svg.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 1,
  });

  const defs = document.createElementNS(svgNS, 'defs');

  // Theme color for subtle outline (non-blocking)
  const quoteColor = getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeQuoteColor')?.trim() || '#7aa2f7';

  // Slight blur to help close micro gaps between spiral coils without looking soft
  const filter = document.createElementNS(svgNS, 'filter');
  filter.setAttribute('id', 'gpSBlur');
  const blur = document.createElementNS(svgNS, 'feGaussianBlur');
  blur.setAttribute('stdDeviation', String(BLUR_PX));
  filter.appendChild(blur);
  defs.appendChild(filter);

  // Mask: reveal Image B along a thick spiral stroke that grows and unwraps
  const mask = document.createElementNS(svgNS, 'mask');
  const maskId = `gpSpiralMask_${Date.now()}_${Math.floor(Math.random()*99999)}`;
  mask.setAttribute('id', maskId);

  // Mask black background
  const mBG = document.createElementNS(svgNS, 'rect');
  mBG.setAttribute('x', '0'); mBG.setAttribute('y', '0');
  mBG.setAttribute('width', '100%'); mBG.setAttribute('height', '100%');
  mBG.setAttribute('fill', 'black');
  mask.appendChild(mBG);

  // Spiral path (white stroke reveals B). We'll animate dashoffset + strokeWidth
  const spiral = document.createElementNS(svgNS, 'path');
  spiral.setAttribute('fill', 'none');
  spiral.setAttribute('stroke', 'white');
  spiral.setAttribute('stroke-linecap', 'round');
  spiral.setAttribute('stroke-linejoin', 'round');
  spiral.setAttribute('filter', 'url(#gpSBlur)');
  mask.appendChild(spiral);

  // Near the end, softly flood the mask to guarantee a completely smooth finish
  const flood = document.createElementNS(svgNS, 'rect');
  flood.setAttribute('x', '0'); flood.setAttribute('y', '0');
  flood.setAttribute('width', '100%'); flood.setAttribute('height', '100%');
  flood.setAttribute('fill', 'white');
  flood.setAttribute('fill-opacity', '0');
  mask.appendChild(flood);

  defs.appendChild(mask);
  svg.appendChild(defs);

  // Group for Image B so we can rotate to a full 360° and end aligned
  const g = document.createElementNS(svgNS, 'g');

  const imgB = document.createElementNS(svgNS, 'image');
  // Keep Image B fully visible (no cropping)
  imgB.setAttributeNS('http://www.w3.org/1999/xlink', 'href', nextSrc);
  imgB.setAttribute('x', '0'); imgB.setAttribute('y', '0');
  imgB.setAttribute('width', String(w)); imgB.setAttribute('height', String(h));
  imgB.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  imgB.setAttribute('mask', `url(#${maskId})`);
  g.appendChild(imgB);

  // Thin decorative spiral outline on top (purely cosmetic; the mask does the revealing)
  const cosmetic = document.createElementNS(svgNS, 'path');
  cosmetic.setAttribute('fill', 'none');
  cosmetic.setAttribute('stroke', quoteColor);
  cosmetic.setAttribute('stroke-opacity', '0.6');
  cosmetic.setAttribute('stroke-width', '1');
  cosmetic.setAttribute('pointer-events', 'none');

  svg.appendChild(g);
  svg.appendChild(cosmetic);

  // Insert overlay above base image
  root.appendChild(svg);

  // --- Build spiral geometry ---------------------------------------------
  // Archimedean spiral r = a + b*theta
  const thetaMax = TURNS * Math.PI * 2;
  const maxR = Math.hypot(cx, cy) + Math.max(cx, cy); // go beyond corners so we fully cover
  const b = maxR / thetaMax;

  // Dense sampling proportional to diagonal length
  const samples = Math.max(400, Math.round(Math.hypot(w, h) * DENSITY));
  const dt = thetaMax / samples;

  const pts = new Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const t = i * dt;
    const r = b * t;
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    pts[i] = [x, y];
  }

  const d = ['M', pts[0][0].toFixed(2), pts[0][1].toFixed(2)];
  for (let i = 1; i < pts.length; i++) {
    d.push('L', pts[i][0].toFixed(2), pts[i][1].toFixed(2));
  }
  const pathD = d.join(' ');
  spiral.setAttribute('d', pathD);
  cosmetic.setAttribute('d', pathD);

  // Use stroke-dasharray animation to reveal along the path
  // Normalize path length to 1.0 via pathLength & animate dashoffset from 1 -> 0
  spiral.setAttribute('pathLength', '1');
  spiral.setAttribute('stroke-dasharray', '1');
  spiral.setAttribute('stroke-dashoffset', '1');

  // --- Animate ------------------------------------------------------------
  const t0 = performance.now();

  function frame(ts) {
    const p = clamp01((ts - t0) / transMs);
    const e = easeInOutCubic(p);

    // Much thicker stroke during the reveal
    const sw = MIN_STROKE + (MAX_STROKE - MIN_STROKE) * e;
    spiral.setAttribute('stroke-width', sw.toFixed(2));
    spiral.setAttribute('stroke-dashoffset', (1 - e).toFixed(4));

    // Late-stage flood (last ~15%) to guarantee a perfectly smooth finish into Image B
    const floodStart = 0.85;
    const floodAlpha = (p <= floodStart) ? 0 : easeOutCubic((p - floodStart) / (1 - floodStart));
    flood.setAttribute('fill-opacity', floodAlpha.toFixed(3));

    // Rotate B a full 360° so it ends aligned
    const angle = 360 * e;
    g.setAttribute('transform', `rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})`);

    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      // Commit Image B and clean up
      baseImg.src = nextSrc;
      root.removeChild(svg);
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
