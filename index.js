// index.js — GalleryPlus (full file)
// Drop-in replacement. Tested against SillyTavern’s extension loader pattern.
//
// Features added:
// - Renames gallery title to "Image GalleryPlus"
// - Injects viewer controls (💾 save window size/pos, 🔍 toggle zoom mode)
// - Persists defaults in SillyTavern extensionSettings.GalleryPlus (and mirrors to localStorage as fallback)
// - Wheel-zoom + drag-to-pan when hoverZoom is OFF; retain existing hover zoom when ON
// - Applies saved gallery window size/position on open
//
// Notes:
// - This file avoids touching Settings.html. We use persisted extension settings instead.
// - If selectors differ in your ST build, check the SELECTORS block below.

(() => {
  "use strict";

  // ---------- CONFIG / SELECTORS ----------
  const EXT_NAME = "GalleryPlus";
  const LOG_PREFIX = `[${EXT_NAME}]`;
  const SELECTORS = {
    galleryPanel: "#gallery",
    galleryTitleSpan: "#gallery .dragTitle span",
    galleryContainer: "#dragGallery",                  // NGY2 gallery inside the panel
    viewerRoot: ".nGY2Viewer",                         // NGY2 viewer overlay root (inserted in <body>)
    viewerImgQuery:
      ".nGY2Viewer img, .nGY2ViewerItem img, .nGY2viewerImg, .nGY2viewerImage, .nGY2ViewerContent img",
  };
// Help with debugging
  window.GP_DEBUG_SELECTORS = SELECTORS;   // expose selectors


  // ---------- UTIL ----------
  const log = (...args) => console.log(LOG_PREFIX, ...args);
  const warn = (...args) => console.warn(LOG_PREFIX, ...args);

  const getST = () => window.SillyTavern?.getContext?.() ?? null;

  const defaults = {
    enabled: true,
    diag: Date.now(),
    openHeight: 800,
    hoverZoom: true,          // true = NGY2’s “inverse move” hover zoom; false = wheel zoom we add
    hoverZoomScale: 1.08,     // used by our wheel zoom as step multiplier (~8%)
    viewerRect: null,         // { insetTop, insetRight, insetBottom, insetLeft, width, height }
  };

  function getSettings() {
    const st = getST();
    let state = undefined;

    // Try SillyTavern extension settings first
    try {
      state = st?.extensionSettings?.[EXT_NAME];
    } catch (_) {}

    // Fallback to localStorage mirror
    if (!state) {
      try {
        const raw = localStorage.getItem(`${EXT_NAME}:settings`);
        state = raw ? JSON.parse(raw) : null;
      } catch (_) {}
    }

    // Merge with defaults
    const merged = Object.assign({}, defaults, state || {});
    // Keep ST object in sync if possible
    try {
      if (st) {
        st.extensionSettings = st.extensionSettings || {};
        st.extensionSettings[EXT_NAME] = merged;
      }
    } catch (_) {}
    return merged;
  }

  function saveSettings(next) {
    const st = getST();
    try {
      if (st) {
        st.extensionSettings = st.extensionSettings || {};
        st.extensionSettings[EXT_NAME] = next;
        // ST will persist automatically on its side; but mirror to localStorage as well.
      }
    } catch (_) {}

    try {
      localStorage.setItem(`${EXT_NAME}:settings`, JSON.stringify(next));
    } catch (_) {}

    log("settings saved", next);
  }

  // Shallow update helper
  function updateSettings(patch) {
    const cur = getSettings();
    const next = Object.assign({}, cur, patch || {});
    saveSettings(next);
    return next;
  }

  // ---------- GALLERY TITLE ----------
  function retitleGallery() {
    try {
      const el = document.querySelector(SELECTORS.galleryTitleSpan);
      if (el && el.textContent !== "Image GalleryPlus") {
        el.textContent = "Image GalleryPlus";
      }
    } catch (e) {
      warn("retitleGallery()", e);
    }
  }

  // ---------- PANEL SIZE / POSITION PERSISTENCE ----------
  function readPanelRect(panel) {
    // panel.style.inset e.g. "129px 398px 0px 148px"
    const rect = panel.getBoundingClientRect();
    const style = panel.style || {};
    const parsePx = (s) =>
      typeof s === "string" && s.includes("px") ? parseFloat(s) : null;

    let insetTop = null,
      insetRight = null,
      insetBottom = null,
      insetLeft = null;

    if (style.inset) {
      const parts = style.inset.split(" ").map((s) => s.trim());
      insetTop = parsePx(parts[0]);
      insetRight = parsePx(parts[1]);
      insetBottom = parsePx(parts[2]);
      insetLeft = parsePx(parts[3]);
    }

    const width = parsePx(style.width) ?? rect.width;
    const height = parsePx(style.height) ?? rect.height;

    return {
      insetTop,
      insetRight,
      insetBottom,
      insetLeft,
      width,
      height,
    };
  }

  function applyPanelRect(panel, r) {
    if (!panel || !r) return;

    const px = (n) => (typeof n === "number" && !Number.isNaN(n) ? `${n}px` : "0px");

    // Only assign the parts we actually have
    const inset =
      [r.insetTop, r.insetRight, r.insetBottom, r.insetLeft]
        .map((n) => (typeof n === "number" ? `${n}px` : "auto"))
        .join(" ");

    if (r.width) panel.style.width = px(r.width);
    if (r.height) panel.style.height = px(r.height);

    // If the saved rect had inset values, apply them. If not, leave ST’s values alone.
    if (
      typeof r.insetTop === "number" ||
      typeof r.insetRight === "number" ||
      typeof r.insetBottom === "number" ||
      typeof r.insetLeft === "number"
    ) {
      panel.style.inset = inset;
    }
  }

  function saveCurrentPanelRectAsDefault() {
    const panel = document.querySelector(SELECTORS.galleryPanel);
    if (!panel) {
      warn("save default: gallery panel not found");
      return;
    }
    const r = readPanelRect(panel);
    updateSettings({ viewerRect: r });
    toast("Saved viewer size & position as default");
  }

  // ---------- VIEWER ENHANCEMENTS ----------
  function gpEnhanceViewer(viewRoot) {
    if (!viewRoot || viewRoot.dataset.gpEnhanced === "1") return;
    viewRoot.dataset.gpEnhanced = "1";

    // Controls container
    const controls = document.createElement("div");
    controls.className = "gp-controls";
    controls.style.position = "fixed";
    controls.style.top = "14px";
    controls.style.left = "14px";
    controls.style.zIndex = "999999";
    controls.style.display = "flex";
    controls.style.gap = "8px";
    controls.style.pointerEvents = "auto";

    const mkBtn = (label, title) => {
      const b = document.createElement("button");
      b.className = "gp-btn";
      b.textContent = label;
      b.title = title;
      b.style.fontSize = "14px";
      b.style.lineHeight = "1";
      b.style.padding = "6px 8px";
      b.style.borderRadius = "8px";
      b.style.border = "1px solid var(--SmartThemeBorderColor, #555)";
      b.style.background = "var(--SmartThemeBlurTintColor, rgba(0,0,0,.35))";
      b.style.color = "var(--SmartThemeTextColor, #eee)";
      b.style.cursor = "pointer";
      b.style.backdropFilter = "blur(6px)";
      b.style.userSelect = "none";
      b.style.webkitUserSelect = "none";
      return b;
    };

    const btnSave = mkBtn("💾", "Save as default size and location");
    const btnZoom = mkBtn("🔍", "Toggle mouseover zoom / wheel zoom");

    controls.append(btnSave, btnZoom);
    document.body.appendChild(controls);

    // Save current panel rect
    btnSave.addEventListener("click", saveCurrentPanelRectAsDefault);

    // Zoom mode toggle
    const setZoomButtonState = () => {
      const st = getSettings();
      btnZoom.setAttribute(
        "aria-pressed",
        st.hoverZoom ? "true" : "false"
      );
      btnZoom.style.opacity = st.hoverZoom ? "1" : "0.85";
      btnZoom.style.outline = st.hoverZoom ? "2px solid #9999" : "none";
    };

    btnZoom.addEventListener("click", () => {
      const next = updateSettings({ hoverZoom: !getSettings().hoverZoom });
      setZoomButtonState();
      applyZoomMode(viewRoot, next);
      toast(next.hoverZoom ? "Hover zoom enabled" : "Wheel zoom enabled");
    });

    setZoomButtonState();
    applyZoomMode(viewRoot, getSettings());

    // Remove controls when viewer goes away
    const removeIfDetached = () => {
      if (!document.body.contains(viewRoot)) {
        controls.remove();
        observer.disconnect();
        window.removeEventListener("resize", removeIfDetached);
      }
    };
    const observer = new MutationObserver(removeIfDetached);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", removeIfDetached);
  }

  // ===== GalleryPlus slideshow helpers =====
  const GP_SLIDES = window.__gpSlideMap || (window.__gpSlideMap = new WeakMap());

  function gpGetSlideState(root) {
    let s = GP_SLIDES.get(root);
    if (!s) { s = { timer: null, interval: 3000 }; GP_SLIDES.set(root, s); }
    return s;
  }
  function gpGalleryList() {
    const nodes = document.querySelectorAll('#dragGallery .nGY2GThumbnailImg');
    return Array.from(nodes).map(n => n.getAttribute('src') || n.src).filter(Boolean);
  }
  function gpBase(p) { return (p || '').split('/').pop(); }
  function gpSwapWithFade(img, nextSrc) {
    if (!img) return;
    img.style.transition = 'opacity 250ms ease';
    img.style.opacity = '0';
    const on = () => { img.style.opacity = '1'; img.removeEventListener('load', on); };
    img.addEventListener('load', on, { once: true });
    img.src = nextSrc;
  }
  function gpStartSlideshow(root) {
    const s = gpGetSlideState(root);
    if (s.timer) return;
    const img = root.querySelector('img');
    const tick = () => {
      const list = gpGalleryList(); if (!list.length || !img) return;
      const cur = gpBase(img.getAttribute('src') || img.src);
      let i = list.findIndex(x => gpBase(x) === cur);
      i = (i + 1) % list.length;
      gpSwapWithFade(img, list[i]);
    };
    s.timer = setInterval(tick, s.interval);
    root.classList.add('gp-slideshow-on');
  }
  function gpStopSlideshow(root) {
    const s = gpGetSlideState(root);
    if (s.timer) { clearInterval(s.timer); s.timer = null; }
    root.classList.remove('gp-slideshow-on');
  }


  // Help with debugging
  window.GP_DEBUG = { enhance: gpEnhanceViewer, applyZoom: applyZoomMode };
  
  // Add or remove our wheel zoom handlers depending on settings
  function applyZoomMode(viewRoot, state) {
    if (!viewRoot) return;

    // Find a target image inside viewer
    const img = viewRoot.querySelector(SELECTORS.viewerImgQuery);
    if (!img) {
      // Try again a little later (NGY2 sometimes paints late)
      setTimeout(() => applyZoomMode(viewRoot, state), 60);
      return;
    }

    // Clean previous handlers
    teardownWheelZoom(viewRoot);

    if (state.hoverZoom) {
      // Let NGY2’s hover behavior do its thing (no extra handlers)
      return;
    }

    // Enable our wheel zoom + drag pan
    setupWheelZoom(viewRoot, img, state);
  }

  function setupWheelZoom(viewRoot, img, state) {
    const step = Number(state.hoverZoomScale || 1.08);
    let scale = 1;
    let isDragging = false;
    let originX = 0;
    let originY = 0;
    let lastClientX = 0;
    let lastClientY = 0;

    img.style.transformOrigin = "center center";
    img.style.willChange = "transform";
    img.style.transition = "transform 60ms linear";

    const onWheel = (ev) => {
      ev.preventDefault();

      const rect = img.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;

      // Zoom in/out
      const dir = ev.deltaY < 0 ? 1 : -1;
      const nextScale = clamp(scale * Math.pow(step, dir), 1, 8);

      // Adjust transform-origin to zoom toward pointer
      const ox = (cx / rect.width) * 100;
      const oy = (cy / rect.height) * 100;
      img.style.transformOrigin = `${ox}% ${oy}%`;
      scale = nextScale;
      img.style.transform = `scale(${scale})`;

      if (scale === 1) {
        img.style.cursor = "default";
      } else {
        img.style.cursor = isDragging ? "grabbing" : "grab";
      }
    };

    const onDown = (ev) => {
      if (scale === 1) return;
      isDragging = true;
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;

      const m = getComputedStyle(img).transform;
      const parsed = parseMatrix(m);
      originX = parsed.translateX || 0;
      originY = parsed.translateY || 0;

      img.style.cursor = "grabbing";
      ev.preventDefault();
    };

    const onMove = (ev) => {
      if (!isDragging) return;
      const dx = ev.clientX - lastClientX;
      const dy = ev.clientY - lastClientY;
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;

      const tx = originX + dx;
      const ty = originY + dy;

      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };

    const onUp = () => {
      if (!isDragging) return;
      isDragging = false;
      img.style.cursor = scale === 1 ? "default" : "grab";

      // Update origin from the last applied transform
      const m = getComputedStyle(img).transform;
      const parsed = parseMatrix(m);
      originX = parsed.translateX || 0;
      originY = parsed.translateY || 0;
    };

    viewRoot.addEventListener("wheel", onWheel, { passive: false });
    viewRoot.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    viewRoot._gpWheelZoom = { onWheel, onDown, onMove, onUp, img };
  }

  function teardownWheelZoom(viewRoot) {
    const wz = viewRoot?._gpWheelZoom;
    if (!wz) return;
    viewRoot.removeEventListener("wheel", wz.onWheel);
    viewRoot.removeEventListener("mousedown", wz.onDown);
    window.removeEventListener("mousemove", wz.onMove);
    window.removeEventListener("mouseup", wz.onUp);

    if (wz.img) {
      wz.img.style.transform = "";
      wz.img.style.transformOrigin = "";
      wz.img.style.cursor = "";
      wz.img.style.transition = "";
      wz.img.style.willChange = "";
    }
    delete viewRoot._gpWheelZoom;
  }

  function parseMatrix(m) {
    // matrix(a, b, c, d, tx, ty) or matrix3d(...)
    if (!m || m === "none") return {};
    if (m.startsWith("matrix3d(")) {
      const v = m
        .slice(9, -1)
        .split(",")
        .map((x) => parseFloat(x.trim()));
      return { translateX: v[12] || 0, translateY: v[13] || 0 };
    }
    if (m.startsWith("matrix(")) {
      const v = m
        .slice(7, -1)
        .split(",")
        .map((x) => parseFloat(x.trim()));
      return { translateX: v[4] || 0, translateY: v[5] || 0 };
    }
    return {};
  }

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // ---------- TOAST ----------
  let toastTimer = null;
  function toast(msg = "") {
    let el = document.getElementById("gp_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "gp_toast";
      el.style.position = "fixed";
      el.style.right = "16px";
      el.style.bottom = "16px";
      el.style.zIndex = "999999";
      el.style.padding = "10px 12px";
      el.style.borderRadius = "10px";
      el.style.background = "rgba(0,0,0,.6)";
      el.style.color = "#fff";
      el.style.fontSize = "13px";
      el.style.backdropFilter = "blur(6px)";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.style.opacity = "0"), 1400);
  }

  // ---------- OBSERVERS ----------
  function watchGalleryAndViewer() {
    // Apply saved panel rect and retitle as soon as #gallery appears
    const galleryObserver = new MutationObserver(() => {
      const panel = document.querySelector(SELECTORS.galleryPanel);
      if (panel) {
        retitleGallery();

        const st = getSettings();
        if (st.viewerRect) {
          applyPanelRect(panel, st.viewerRect);
        }
      }
    });
    galleryObserver.observe(document.body, { childList: true, subtree: true });

    // Watch for viewer overlay creation (NGY2)
    const viewerObserver = new MutationObserver((list) => {
      for (const m of list) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.matches?.(SELECTORS.viewerRoot) || n.querySelector?.(SELECTORS.viewerRoot)) {
            const root = n.matches?.(SELECTORS.viewerRoot) ? n : n.querySelector(SELECTORS.viewerRoot);
            if (root) {
              gpEnhanceViewer(root);
            }
          }
        }
      }
    });
    viewerObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- SETUP / REGISTER ----------
  function setup() {
    log("fetch shim active (if present) and index.js loaded");
    // Initial attempt for already-mounted gallery
    retitleGallery();

    // Start observers
    watchGalleryAndViewer();

    // If the gallery panel is already present on load, apply defaults immediately.
    const panel = document.querySelector(SELECTORS.galleryPanel);
    if (panel) {
      const st = getSettings();
      if (st.viewerRect) applyPanelRect(panel, st.viewerRect);
    }
  }

  // SillyTavern extension loader compatibility
  if (typeof window.registerExtension === "function") {
    window.registerExtension({
      name: EXT_NAME,
      setup: async () => setup(),
      onEnable: async () => {
        updateSettings({ enabled: true });
        setup();
      },
      onDisable: async () => {
        updateSettings({ enabled: false });
      },
    });
  } else {
    // Fallback: run immediately
    setup();
  }
/* ====================== GalleryPlus: viewer controls & wiring ====================== */

(function GP_bootstrap() {
  const GP_NS = 'GalleryPlus';

  // --- settings helpers ---
  function gpDefaults() {
    return {
      enabled: true,
      diag: Date.now(),
      openHeight: 800,
      hoverZoom: true,
      hoverZoomScale: 1.08,
      viewerRect: null,
      masonryDense: false,
      showCaptions: true,
      webpOnly: false,
    };
  }
  function gpGetSettings() {
    const ctx = window.SillyTavern?.getContext?.();
    const cur = ctx?.extensionSettings?.[GP_NS] || {};
    return Object.assign(gpDefaults(), cur);
  }
  function gpSaveSettings(s) {
    const ctx = window.SillyTavern?.getContext?.();
    if (!ctx) return;
    ctx.extensionSettings[GP_NS] = s;
    if (window.saveSettingsDebounced) window.saveSettingsDebounced();
  }

  // -- rename the gallery title safely (no ?. assignment) --
  function gpFixGalleryTitle() {
    const el = document.querySelector('#gallery .dragTitle span');
    if (el && el.textContent !== 'Image GalleryPlus') {
      el.textContent = 'Image GalleryPlus';
    }
  }

  // observe gallery container to keep the title correct
  const gpTitleObserver = new MutationObserver(gpFixGalleryTitle);
  const titleTarget = document.body;
  gpTitleObserver.observe(titleTarget, { subtree: true, childList: true });

  // state per viewer
  const viewerState = new WeakMap();

  function updateZoomIcon(btn, s) {
    btn.style.opacity = s.hoverZoom ? '1' : '0.7';
    btn.title = s.hoverZoom
      ? 'Hover-zoom ON (click to switch to wheel zoom)'
      : 'Wheel-zoom ON (click to switch to hover zoom)';
  }

  function applyViewerRect(root, rect) {
    if (!rect) return;
    root.style.inset = `${rect.top}px auto auto ${rect.left}px`;
    root.style.width = rect.width + 'px';
    root.style.height = rect.height + 'px';
  }

  function saveRect(root) {
    const r = root.getBoundingClientRect();
    const s = gpGetSettings();
    s.viewerRect = {
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
    gpSaveSettings(s);
    console.debug('[GP] saved viewerRect', s.viewerRect);
  }

  function applyMode(root, img, s) {
    // cleanup previous handlers, if any
    const prev = viewerState.get(root);
    if (prev?.cleanup) prev.cleanup();

    const st = prev || { scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0 };
    viewerState.set(root, st);

    // shared img styling
    Object.assign(img.style, {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      transformOrigin: 'center center',
      willChange: 'transform',
      display: 'block',
      margin: 'auto',
      userSelect: 'none',
      pointerEvents: 'auto',
    });
    root.style.overflow = 'hidden';

    // ensure it sits above the gallery
    const z = parseInt(getComputedStyle(root).zIndex || '0', 10);
    if (!Number.isFinite(z) || z < 5000) root.style.zIndex = '5001';

    let cleanup = () => {};
    if (s.hoverZoom) {
      st.scale = s.hoverZoomScale || 1.08;
      st.tx = 0; st.ty = 0;
      const move = (ev) => {
        const rect = root.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = ev.clientX - cx;
        const dy = ev.clientY - cy;
        const damp = 0.08; // inverse movement "feel"
        st.tx = -dx * damp;
        st.ty = -dy * damp;
        img.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
      };
      const leave = () => {
        img.style.transform = `translate(0px, 0px) scale(${st.scale})`;
      };
      root.addEventListener('mousemove', move);
      root.addEventListener('mouseleave', leave);
      cleanup = () => {
        root.removeEventListener('mousemove', move);
        root.removeEventListener('mouseleave', leave);
      };
    } else {
      st.scale = Math.max(1, st.scale || 1);
      const wheel = (ev) => {
        if (!ev.ctrlKey) ev.preventDefault(); // keep natural wheel zoom
        const delta = -Math.sign(ev.deltaY) * 0.1;
        st.scale = Math.min(6, Math.max(1, st.scale + delta));
        img.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
      };
      const down = (ev) => {
        if (st.scale <= 1) return;
        st.dragging = true;
        st.lastX = ev.clientX;
        st.lastY = ev.clientY;
        ev.preventDefault();
      };
      const move = (ev) => {
        if (!st.dragging) return;
        const dx = ev.clientX - st.lastX;
        const dy = ev.clientY - st.lastY;
        st.lastX = ev.clientX;
        st.lastY = ev.clientY;
        st.tx += dx;
        st.ty += dy;
        img.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.scale})`;
      };
      const up = () => { st.dragging = false; };

      root.addEventListener('wheel', wheel, { passive: false });
      root.addEventListener('mousedown', down);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      cleanup = () => {
        root.removeEventListener('wheel', wheel);
        root.removeEventListener('mousedown', down);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
    }
    st.cleanup = cleanup;
  }

  function enhanceViewer(root) {
    if (!root || !(root instanceof HTMLElement)) return;
    if (root.classList.contains('gp-armed')) return;
    root.classList.add('gp-armed');

    // get the <img> the viewer is showing
    const img = root.querySelector('img');
    if (!img) return;

    // apply persisted rect if any
    applyViewerRect(root, gpGetSettings().viewerRect);

    // mount controls into the bar
    const bar = root.querySelector('.panelControlBar');
    if (bar && !bar.querySelector('.gp-controls')) {
      const ctrls = document.createElement('div');
      ctrls.className = 'gp-controls';
      ctrls.style.display = 'flex';
      ctrls.style.gap = '6px';
      ctrls.style.alignItems = 'center';

      const save = document.createElement('button');
      save.className = 'gp-btn gp-save';
      save.type = 'button';
      save.title = 'Save as default size and location';
      save.textContent = '💾';

      const zoom = document.createElement('button');
      zoom.className = 'gp-btn gp-zoom';
      zoom.type = 'button';
      zoom.title = 'Toggle hover zoom / wheel zoom';
      zoom.textContent = '🔍';

      [save, zoom].forEach(b => {
        b.style.border = 'none';
        b.style.background = 'transparent';
        b.style.cursor = 'pointer';
        b.style.fontSize = '16px';
        b.style.lineHeight = '1';
        b.style.padding = '0 4px';
      });

      // --- Place controls OUTSIDE the panelControlBar, anchored at top-left of the window ---
      const bar = root.querySelector('.panelControlBar');

      // Make sure the root can anchor absolutely-positioned children
      const cs = getComputedStyle(root);
      if (cs.position === 'static') {
        root.style.position = 'relative';
      }

      // Add a marker class so CSS targets only gallery viewers
      root.classList.add('galleryImageDraggable');

      // Add a hook class on the bar so we can pad it in CSS (avoids overlap)
      bar?.classList.add('gp-has-external-controls');

      // Insert the controls at the root level (NOT inside the bar)
      if (!root.querySelector('.gp-controls')) {
        root.appendChild(ctrls);
      }

      // Position tweaks happen via CSS
      ctrls.style.marginLeft = '';   // let CSS handle spacing
      ctrls.style.marginRight = '';  // (clear any previous inline styles)


      ctrls.appendChild(save);
      ctrls.appendChild(zoom);

      save.addEventListener('click', () => saveRect(root));
      zoom.addEventListener('click', () => {
        const s = gpGetSettings();
        s.hoverZoom = !s.hoverZoom;
        gpSaveSettings(s);
        applyMode(root, img, s);
        updateZoomIcon(zoom, s);
      });

      updateZoomIcon(zoom, gpGetSettings());
    }

    // apply zoom mode behavior
    applyMode(root, img, gpGetSettings());
  }

  // watch for new viewers
  function scanExisting() {
    document.querySelectorAll('.galleryImageDraggable').forEach(enhanceViewer);
  }
  if (!window.__GP_VIEW_OBS__) {
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList?.contains('galleryImageDraggable')) enhanceViewer(n);
          n.querySelectorAll?.('.galleryImageDraggable')?.forEach(enhanceViewer);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.__GP_VIEW_OBS__ = mo;
  }
  // run once in case a viewer is already open
  scanExisting();
  // force the drawer title now and whenever #gallery re-renders
  gpFixGalleryTitle();

  // expose tiny debug helpers (handy in console)
  window.__GP = Object.assign(window.__GP || {}, {
    forceScan: scanExisting,
    enhanceViewer,
    getSettings: gpGetSettings,
  });
})();
})();
