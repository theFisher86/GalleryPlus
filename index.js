(function () {
  'use strict';

  const EXT_ID = 'GalleryPlus';

  const DEFAULTS = {
    enabled: true,
    diag: Date.now(),
    openHeight: 800,
    hoverZoom: false,
    hoverZoomScale: 1.08,
    viewerRect: null,
    masonryDense: false,
    showCaptions: true,
    webpOnly: false,
    slideshowSpeedSec: 3,
    slideshowTransition: 'crossfade',
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
  // Settings panel + live updates
  // -------------------------------
  function applyGallerySettings() {
    const s = gpSettings();
    document.body.classList.toggle('gp-masonry-dense', !!s.masonryDense);
    document.querySelectorAll('#dragGallery .nGY2GThumbnailLabel, #dragGallery .nGY2ItemLabel, #dragGallery figcaption').forEach(el => {
      el.style.display = s.showCaptions ? '' : 'none';
    });
    const webp = !!s.webpOnly;
    document.querySelectorAll('#dragGallery .nGY2GalleryItem, #dragGallery .nGY2GThumbnail, #dragGallery .nGY2TnItem').forEach(item => {
      let src = '';
      const img = item.querySelector('img.nGY2GThumbnailImg, .nGY2GThumbnailImage.nGY2TnImg');
      if (img instanceof HTMLImageElement) src = img.src;
      else if (img) {
        const bg = img.style.backgroundImage || '';
        const m = bg.match(/url\(["']?(.+?)["']?\)/);
        if (m) src = new URL(m[1], location.href).href;
      }
      const isWebp = /\.webp(\?|$)/i.test(src);
      item.style.display = webp && !isWebp ? 'none' : '';
    });
  }

  function applySettings() {
    applyGallerySettings();
    const s = gpSettings();
    document.querySelectorAll('.galleryImageDraggable').forEach(root => {
      const speed = root.querySelector('.gp-speed');
      if (speed) speed.value = String(s.slideshowSpeedSec || 3);
      const sel = root.querySelector('.gp-transition');
      if (sel) {
        const v = s.slideshowTransition || 'crossfade';
        sel.value = v;
        root.dataset.gpTransition = v;
      }
    });
  }

  function wireSettingsPanel() {
    const root = document.querySelector('#gp-settings-root');
    if (!root || root.dataset.gpWired === '1') return;
    root.dataset.gpWired = '1';
    const s = gpSettings();

    const bind = (sel, prop, transform) => {
      const el = root.querySelector(sel);
      if (!el) return;
      const tr = transform || (v => v);
      if (el.type === 'checkbox') {
        el.checked = !!s[prop];
        el.addEventListener('change', () => { gpSaveSettings({ [prop]: el.checked }); applySettings(); });
      } else {
        el.value = String(s[prop] ?? '');
        el.addEventListener('change', () => { gpSaveSettings({ [prop]: tr(el.value) }); applySettings(); });
      }
    };

    bind('#gp-enabled', 'enabled');
    bind('#gp-openHeight', 'openHeight', v => parseInt(v, 10) || 800);
    const openHeight = root.querySelector('#gp-openHeight');
    const openHeightValue = root.querySelector('#gp-openHeightValue');
    openHeightValue.textContent = String(s.openHeight || 800);
    openHeight?.addEventListener('input', () => { openHeightValue.textContent = openHeight.value; });

    bind('#gp-hoverZoom', 'hoverZoom');
    bind('#gp-hoverZoomScale', 'hoverZoomScale', v => parseFloat(v) || 1);
    const hz = root.querySelector('#gp-hoverZoomScale');
    const hzVal = root.querySelector('#gp-hoverZoomScaleValue');
    hzVal.textContent = (s.hoverZoomScale || 1).toFixed(2);
    hz?.addEventListener('input', () => { hzVal.textContent = parseFloat(hz.value).toFixed(2); });

    bind('#gp-masonryDense', 'masonryDense');
    bind('#gp-showCaptions', 'showCaptions');
    bind('#gp-webpOnly', 'webpOnly');
    bind('#gp-slideshowSpeedSec', 'slideshowSpeedSec', v => {
      let n = parseFloat(v); if (!Number.isFinite(n) || n < 0.1) n = 0.1; if (n > 10) n = 10; return n;
    });
    bind('#gp-slideshowTransition', 'slideshowTransition');

    applySettings();
  }

  const settingsObserver = new MutationObserver(wireSettingsPanel);
  settingsObserver.observe(document.body, { childList: true, subtree: true });
  wireSettingsPanel();

  const gallerySettingsObserver = new MutationObserver(applyGallerySettings);
  gallerySettingsObserver.observe(document.body, { childList: true, subtree: true });
  applyGallerySettings();

  // -------------------------------
  // Theme helpers
  // -------------------------------

  function cssVar(name, fallback = '') {
    const r = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (r) return r;
    const b = getComputedStyle(document.body).getPropertyValue(name).trim();
    return b || fallback;
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
    const saveTip = 'Save as default size and location';
    saveBtn.title = saveTip;
    saveBtn.setAttribute('aria-label', saveTip);
    const saveIcon = document.createElement('span');
    saveIcon.setAttribute('aria-hidden', 'true');
    saveIcon.textContent = '💾';
    saveBtn.appendChild(saveIcon);
    saveBtn.addEventListener('click', () => saveDefaultRect(root));

    // 🔍 toggle hover zoom
    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'gp-btn gp-zoom';
    const zoomTip = 'Toggle hover zoom (off = scroll zoom + pan)';
    zoomBtn.title = zoomTip;
    zoomBtn.setAttribute('aria-label', zoomTip);
    const zoomIcon = document.createElement('span');
    zoomIcon.setAttribute('aria-hidden', 'true');
    zoomIcon.textContent = '🔍';
    zoomBtn.appendChild(zoomIcon);
    zoomBtn.classList.toggle('active', !!gpSettings().hoverZoom);
    zoomBtn.addEventListener('click', () => {
      const ns = !gpSettings().hoverZoom;
      gpSaveSettings({ hoverZoom: ns });
      zoomBtn.classList.toggle('active', ns);
    });

    // ⏯️ start/pause slideshow
    const playBtn = document.createElement('button');
    playBtn.className = 'gp-btn gp-play';
    const playTip = 'Start / pause slideshow';
    playBtn.title = playTip;
    playBtn.setAttribute('aria-label', playTip);
    const playIcon = document.createElement('span');
    playIcon.setAttribute('aria-hidden', 'true');
    playIcon.textContent = '⏯️';
    playBtn.appendChild(playIcon);
    playBtn.addEventListener('click', () => {
      if (root.dataset.gpPlaying === '1') stopSlideshow(root);
      else startSlideshow(root);
    });

    // ⭘ fullscreen
    const fsBtn = document.createElement('button');
    fsBtn.className = 'gp-btn gp-fs';
    const fsTip = 'Fullscreen slideshow';
    fsBtn.title = fsTip;
    fsBtn.setAttribute('aria-label', fsTip);
    const fsIcon = document.createElement('span');
    fsIcon.setAttribute('aria-hidden', 'true');
    fsIcon.textContent = '⛶';
    fsBtn.appendChild(fsIcon);
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
      ['spiral',    '😵‍🨡'],
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

    function onMouseDown(e) {
      if (gpSettings().hoverZoom) return;
      if (e.button !== 0) return;
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

  function toggleFullscreen(root) {
    const isFS = document.fullscreenElement === root;
    if (isFS) {
      document.exitFullscreen?.();
    } else {
      root.requestFullscreen?.({ navigationUI: 'hide' }).catch(()=>{});
    }
  }

  function wireFullscreenStateSync(root) {
    function onFSChange() {
      const isFS = document.fullscreenElement === root;
      root.classList.toggle('gp-fullscreen', isFS);
    }
    document.addEventListener('fullscreenchange', onFSChange);
    const obs = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        document.removeEventListener('fullscreenchange', onFSChange);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

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

  function applyGalleryTitle() {
    const t = document.querySelector('#gallery .dragTitle span');
    if (t && t.textContent && !/Image GalleryPlus/.test(t.textContent)) {
      t.textContent = 'Image GalleryPlus';
    }
  }

  function initObservers() {
    const galleryObserver = new MutationObserver(applyGalleryTitle);
    galleryObserver.observe(document.body, { childList: true, subtree: true });
    applyGalleryTitle();

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
  }

  initObservers();

})();
