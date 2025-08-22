// GalleryPlus – fixed init order + safer DOM enhancement (no internal grid replacement)
(() => {
  const MODULE = 'GalleryPlus';
  const DEFAULTS = Object.freeze({
    enabled: true,
    openHeight: 800,
    hoverZoom: true,
    hoverZoomScale: 1.08,
    masonryDense: false,
    showCaptions: true,
    webpOnly: false,
  });

  // IMPORTANT: Define selectors BEFORE we reference them anywhere.
  const GALLERY_SELECTOR = [
    '.char_gallery_modal',
    '[data-gallery-root]',
    '.gallery-modal',
    '.gallery-root',
    '#character-gallery',
    '[class*="gallery"]'
  ].join(',');

  const ctx = () => window.SillyTavern?.getContext?.() || {};
  const st = () => window.SillyTavern;

  function settings() {
    const { extensionSettings } = ctx();
    if (!extensionSettings[MODULE]) extensionSettings[MODULE] = structuredClone(DEFAULTS);
    for (const k of Object.keys(DEFAULTS)) {
      if (!Object.hasOwn(extensionSettings[MODULE], k)) extensionSettings[MODULE][k] = DEFAULTS[k];
    }
    return extensionSettings[MODULE];
  }
  const saveSettings = () => ctx().saveSettingsDebounced?.();

  // Robust loader for settings.html (no import.meta.url)
  async function loadSettingsHTML() {
    const base =
      (document.currentScript && new URL('.', document.currentScript.src).href) ||
      '/scripts/extensions/third-party/GalleryPlus/';
    const res = await fetch(base + 'settings.html');
    return await res.text();
  }

  const onReady = (fn) => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

  function isGalleryNode(n) {
    return (n instanceof HTMLElement) && n.matches?.(GALLERY_SELECTOR);
  }

  function openBuiltInGallery() {
    if (window.showCharGallery) return window.showCharGallery();
    document.querySelector('[data-action="open-gallery"], .open_gallery_button, [aria-label="Open gallery"]')?.click();
  }

  onReady(async () => {
    // Settings panel
    st()?.onExtensionSettings?.(MODULE, async (rootEl) => {
      try {
        rootEl.innerHTML = await loadSettingsHTML();
        bindSettings(rootEl);
      } catch (e) {
        console.error('[GalleryPlus] Failed to load settings.html', e);
      }
    });

    // Observe DOM for gallery mount and enhance it
    const mo = new MutationObserver((muts) => {
      if (!settings().enabled) return;
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (isGalleryNode(n)) enhanceGallery(n);
          const nested = n.querySelector?.(GALLERY_SELECTOR);
          if (nested) enhanceGallery(nested);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Enhance any already-mounted gallery
    document.querySelectorAll(GALLERY_SELECTOR).forEach(enhanceGallery);

    // Optional slash command helper
    if (st()?.registerSlashCommand) {
      st().registerSlashCommand('gp', () => openBuiltInGallery(), ['galleryplus'], 'Open the gallery (GalleryPlus)', true, true);
    }
  });

  // ===== Enhancement (safe) =====
  function enhanceGallery(root) {
    if (root.__gpEnhanced) return;
    root.__gpEnhanced = true;

    const s = settings();

    // Make the modal a 3-row grid without disturbing its children too much
    root.classList.add('gp-root');
    root.style.display = 'grid';
    root.style.gridTemplateRows = 'auto 1fr auto';
    root.style.gap = '8px';
    root.style.maxHeight = '90vh';
    root.style.minHeight = 'min(90vh, 100%)';

    // Header (nice gradient)
    const header = document.createElement('div');
    header.className = 'gp-header';
    header.textContent = 'GalleryPlus';
    root.prepend(header);

    // Identify a logical "content area" (where thumbnails go).
    // We prefer a known grid container, else the first child after our header.
    const gridHost =
      root.querySelector('.char_gallery, .gallery-grid, [data-gallery-grid]') ||
      root.querySelector(':scope > :not(.gp-header):not(.gp-footer)');

    // Make that area scrollable. We wrap it in a gp-scroll DIV, but we DO NOT
    // replace inner grids or move their children around (keeps built-in listeners intact).
    if (gridHost) {
      const scroll = document.createElement('div');
      scroll.className = 'gp-scroll';
      gridHost.before(scroll);
      scroll.appendChild(gridHost); // move the whole node into scroll (listeners preserved)
      // Apply our grid class onto the existing grid container if it’s likely a grid
      if (/gallery|grid|thumb/i.test(gridHost.className)) {
        gridHost.classList.add('gp-gallery');
        if (s.masonryDense) gridHost.classList.add('gp-dense');
      }
      // Ensure scroll region can actually scroll
      scroll.style.minHeight = '0';
      scroll.style.overflow = 'auto';
      // Upgrade thumbnails lazily
      upgradeThumbnails(gridHost);
    }

    // Footer: we’ll reparent the existing pagination container wholesale (no button surgery)
    const footer = document.createElement('div');
    footer.className = 'gp-footer';
    root.appendChild(footer);

    let pagerContainer =
      root.querySelector('.pagination, .gallery-pagination, .pager, [data-pagination], [class*="pagination"]');

    if (pagerContainer) {
      footer.appendChild(pagerContainer); // move the entire container => sticky bottom inside modal
      pagerContainer.classList.add('gp-pagination-bar');
      pagerContainer.style.display = 'flex';
      pagerContainer.style.justifyContent = 'center';
      pagerContainer.style.gap = '6px';
      pagerContainer.style.flexWrap = 'wrap';
    } else {
      // If no pager exists (infinite grid builds), we just leave the footer empty.
      footer.style.display = 'none';
    }

    // Keyboard nav for our preview
    attachGlobalPreviewNav(root);
  }

  // ===== Thumbnails / actions =====
  function upgradeThumbnails(gridHost) {
    const imgs = gridHost.querySelectorAll('img:not([data-gp])');
    imgs.forEach(img => wrapAsCard(img));

    const io = new IntersectionObserver((entries, o) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          hydrateCard(e.target);
          o.unobserve(e.target);
        }
      }
    }, { root: gridHost.closest('.gp-scroll') || null, rootMargin: '200px' });

    gridHost.querySelectorAll('.gp-card').forEach(c => io.observe(c));
  }

  function wrapAsCard(img) {
    const s = settings();
    img.setAttribute('decoding', 'async');
    img.setAttribute('loading', 'lazy');
    img.dataset.gp = '1';

    // If the parent is already a card from the built-in, don’t double-wrap.
    if (img.closest('.gp-card')) return;

    const card = document.createElement('div');
    card.className = 'gp-card';
    img.replaceWith(card);
    card.appendChild(img);

    if (s.showCaptions) {
      const cap = document.createElement('div');
      cap.className = 'gp-caption';
      const file = (img.alt || img.title || img.src || '').split('/').pop();
      cap.textContent = file;
      card.appendChild(cap);
    }

    const actions = document.createElement('div');
    actions.className = 'gp-actions';
    actions.innerHTML = `
      <button class="gp-btn" data-act="open">Open</button>
      <button class="gp-btn" data-act="newtab" title="Open in new tab">↗</button>
      <button class="gp-btn" data-act="download" title="Download">↓</button>
    `;
    actions.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;
      if (act === 'open') openPreview(img);
      if (act === 'newtab') window.open(img.src, '_blank', 'noopener');
      if (act === 'download') downloadImage(img.src);
    });
    card.appendChild(actions);

    card.addEventListener('click', (e) => {
      if (e.target.closest('.gp-actions')) return;
      openPreview(img);
    });
  }

  function hydrateCard(card) {
    const img = card.querySelector('img');
    if (!img) return;
    const doBitmap = 'createImageBitmap' in window;
    const doIdle = 'requestIdleCallback' in window;

    const decodeTask = async () => {
      try {
        if (doBitmap && !img.src.startsWith('blob:')) {
          const r = await fetch(img.src, { cache: 'force-cache' });
          const blob = await r.blob();
          const bmp = await createImageBitmap(blob);
          bmp.close();
        } else {
          await img.decode().catch(() => {});
        }
      } catch {}
    };

    if (doIdle) requestIdleCallback(decodeTask, { timeout: 500 });
    else decodeTask();
  }

  // ===== Preview with settings =====
  function openPreview(imgEl) {
    const s = settings();
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.75)', display: 'grid', placeItems: 'center', zIndex: 10000
    });

    const frame = document.createElement('div');
    frame.className = 'gp-preview';
    frame.style.setProperty('--gp-open-height', `${Number(s.openHeight) || 800}px`);

    const big = new Image();
    big.src = imgEl.src;
    big.alt = imgEl.alt || '';
    frame.appendChild(big);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    window.addEventListener('keydown', escOnce);
    function escOnce(e) { if (e.key === 'Escape') { window.removeEventListener('keydown', escOnce); cleanup(); } }

    if (s.hoverZoom) enableHoverParallax(frame, big, s.hoverZoomScale || 1.08);
  }

  function enableHoverParallax(host, img, maxScale) {
    let rect = null, raf = 0, active = false, lock = false, scale = Math.max(1, maxScale);

    function update(e) {
      if (!rect) rect = host.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const nx = (mx / rect.width) - 0.5;
      const ny = (my / rect.height) - 0.5;
      const tx = -nx * (rect.width * 0.02);
      const ty = -ny * (rect.height * 0.02);
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function onMove(e) {
      if (!active || lock) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => update(e));
    }

    function onEnter() { active = true; host.dataset.zooming = '1'; img.style.transform = `scale(${scale})`; }
    function onLeave() { active = false; host.dataset.zooming = '0'; img.style.transform = ''; rect = null; }
    function onWheel(e) {
      if (!lock) return;
      e.preventDefault();
      scale = Math.min(2, Math.max(1, scale + (e.deltaY < 0 ? 0.02 : -0.02)));
      img.style.transform = `scale(${scale})`;
    }
    function onKey(e) {
      if (e.code === 'Space') { lock = e.type === 'keydown'; host.dataset.zooming = lock ? '1' : '0'; }
    }

    host.addEventListener('mouseenter', onEnter, { passive: true });
    host.addEventListener('mouseleave', onLeave, { passive: true });
    host.addEventListener('mousemove', onMove, { passive: true });
    host.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
  }

  function attachGlobalPreviewNav(root) {
    window.addEventListener('keydown', (e) => {
      const previewOpen = document.querySelector('.gp-preview');
      if (!previewOpen) return;
      if (e.key === 'ArrowRight') clickSibling(root, +1);
      if (e.key === 'ArrowLeft') clickSibling(root, -1);
    }, { passive: true });
  }

  function clickSibling(root, dir) {
    const cards = [...root.querySelectorAll('.gp-card')];
    const currentSrc = document.querySelector('.gp-preview img')?.src;
    if (!currentSrc) return;
    const idx = cards.findIndex(c => c.querySelector('img')?.src === currentSrc);
    const next = cards.at(idx + dir);
    next?.click();
  }

  function downloadImage(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = (url.split('/').pop() || 'image');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function bindSettings(rootEl) {
    const s = settings();
    const q = (sel) => rootEl.querySelector(sel);

    const map = {
      enabled: '[data-gp="enabled"]',
      openHeight: '[data-gp="openHeight"]',
      hoverZoom: '[data-gp="hoverZoom"]',
      hoverZoomScale: '[data-gp="hoverZoomScale"]',
      masonryDense: '[data-gp="masonryDense"]',
      showCaptions: '[data-gp="showCaptions"]',
      webpOnly: '[data-gp="webpOnly"]',
    };
    q(map.enabled).checked = !!s.enabled;
    q(map.openHeight).value = s.openHeight;
    q(map.hoverZoom).checked = !!s.hoverZoom;
    q(map.hoverZoomScale).value = s.hoverZoomScale;
    q(map.masonryDense).checked = !!s.masonryDense;
    q(map.showCaptions).checked = !!s.showCaptions;
    q(map.webpOnly).checked = !!s.webpOnly;

    rootEl.addEventListener('change', (e) => {
      const key = e.target?.dataset?.gp;
      if (!key) return;
      s[key] = (e.target.type === 'checkbox') ? e.target.checked : Number(e.target.value);
      saveSettings();
    });
  }
})();
// GalleryPlus – fixed init order + safer DOM enhancement (no internal grid replacement)
(() => {
  const MODULE = 'GalleryPlus';
  const DEFAULTS = Object.freeze({
    enabled: true,
    openHeight: 800,
    hoverZoom: true,
    hoverZoomScale: 1.08,
    masonryDense: false,
    showCaptions: true,
    webpOnly: false,
  });

  // IMPORTANT: Define selectors BEFORE we reference them anywhere.
  const GALLERY_SELECTOR = [
    '.char_gallery_modal',
    '[data-gallery-root]',
    '.gallery-modal',
    '.gallery-root',
    '#character-gallery',
    '[class*="gallery"]'
  ].join(',');

  const ctx = () => window.SillyTavern?.getContext?.() || {};
  const st = () => window.SillyTavern;

  function settings() {
    const { extensionSettings } = ctx();
    if (!extensionSettings[MODULE]) extensionSettings[MODULE] = structuredClone(DEFAULTS);
    for (const k of Object.keys(DEFAULTS)) {
      if (!Object.hasOwn(extensionSettings[MODULE], k)) extensionSettings[MODULE][k] = DEFAULTS[k];
    }
    return extensionSettings[MODULE];
  }
  const saveSettings = () => ctx().saveSettingsDebounced?.();

  // Robust loader for settings.html (no import.meta.url)
  async function loadSettingsHTML() {
    const base =
      (document.currentScript && new URL('.', document.currentScript.src).href) ||
      '/scripts/extensions/third-party/GalleryPlus/';
    const res = await fetch(base + 'settings.html');
    return await res.text();
  }

  const onReady = (fn) => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

  function isGalleryNode(n) {
    return (n instanceof HTMLElement) && n.matches?.(GALLERY_SELECTOR);
  }

  function openBuiltInGallery() {
    if (window.showCharGallery) return window.showCharGallery();
    document.querySelector('[data-action="open-gallery"], .open_gallery_button, [aria-label="Open gallery"]')?.click();
  }

  onReady(async () => {
    // Settings panel
    st()?.onExtensionSettings?.(MODULE, async (rootEl) => {
      try {
        rootEl.innerHTML = await loadSettingsHTML();
        bindSettings(rootEl);
      } catch (e) {
        console.error('[GalleryPlus] Failed to load settings.html', e);
      }
    });

    // Observe DOM for gallery mount and enhance it
    const mo = new MutationObserver((muts) => {
      if (!settings().enabled) return;
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (isGalleryNode(n)) enhanceGallery(n);
          const nested = n.querySelector?.(GALLERY_SELECTOR);
          if (nested) enhanceGallery(nested);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Enhance any already-mounted gallery
    document.querySelectorAll(GALLERY_SELECTOR).forEach(enhanceGallery);

    // Optional slash command helper
    if (st()?.registerSlashCommand) {
      st().registerSlashCommand('gp', () => openBuiltInGallery(), ['galleryplus'], 'Open the gallery (GalleryPlus)', true, true);
    }
  });

  // ===== Enhancement (safe) =====
  function enhanceGallery(root) {
    if (root.__gpEnhanced) return;
    root.__gpEnhanced = true;

    const s = settings();

    // Make the modal a 3-row grid without disturbing its children too much
    root.classList.add('gp-root');
    root.style.display = 'grid';
    root.style.gridTemplateRows = 'auto 1fr auto';
    root.style.gap = '8px';
    root.style.maxHeight = '90vh';
    root.style.minHeight = 'min(90vh, 100%)';

    // Header (nice gradient)
    const header = document.createElement('div');
    header.className = 'gp-header';
    header.textContent = 'GalleryPlus';
    root.prepend(header);

    // Identify a logical "content area" (where thumbnails go).
    // We prefer a known grid container, else the first child after our header.
    const gridHost =
      root.querySelector('.char_gallery, .gallery-grid, [data-gallery-grid]') ||
      root.querySelector(':scope > :not(.gp-header):not(.gp-footer)');

    // Make that area scrollable. We wrap it in a gp-scroll DIV, but we DO NOT
    // replace inner grids or move their children around (keeps built-in listeners intact).
    if (gridHost) {
      const scroll = document.createElement('div');
      scroll.className = 'gp-scroll';
      gridHost.before(scroll);
      scroll.appendChild(gridHost); // move the whole node into scroll (listeners preserved)
      // Apply our grid class onto the existing grid container if it’s likely a grid
      if (/gallery|grid|thumb/i.test(gridHost.className)) {
        gridHost.classList.add('gp-gallery');
        if (s.masonryDense) gridHost.classList.add('gp-dense');
      }
      // Ensure scroll region can actually scroll
      scroll.style.minHeight = '0';
      scroll.style.overflow = 'auto';
      // Upgrade thumbnails lazily
      upgradeThumbnails(gridHost);
    }

    // Footer: we’ll reparent the existing pagination container wholesale (no button surgery)
    const footer = document.createElement('div');
    footer.className = 'gp-footer';
    root.appendChild(footer);

    let pagerContainer =
      root.querySelector('.pagination, .gallery-pagination, .pager, [data-pagination], [class*="pagination"]');

    if (pagerContainer) {
      footer.appendChild(pagerContainer); // move the entire container => sticky bottom inside modal
      pagerContainer.classList.add('gp-pagination-bar');
      pagerContainer.style.display = 'flex';
      pagerContainer.style.justifyContent = 'center';
      pagerContainer.style.gap = '6px';
      pagerContainer.style.flexWrap = 'wrap';
    } else {
      // If no pager exists (infinite grid builds), we just leave the footer empty.
      footer.style.display = 'none';
    }

    // Keyboard nav for our preview
    attachGlobalPreviewNav(root);
  }

  // ===== Thumbnails / actions =====
  function upgradeThumbnails(gridHost) {
    const imgs = gridHost.querySelectorAll('img:not([data-gp])');
    imgs.forEach(img => wrapAsCard(img));

    const io = new IntersectionObserver((entries, o) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          hydrateCard(e.target);
          o.unobserve(e.target);
        }
      }
    }, { root: gridHost.closest('.gp-scroll') || null, rootMargin: '200px' });

    gridHost.querySelectorAll('.gp-card').forEach(c => io.observe(c));
  }

  function wrapAsCard(img) {
    const s = settings();
    img.setAttribute('decoding', 'async');
    img.setAttribute('loading', 'lazy');
    img.dataset.gp = '1';

    // If the parent is already a card from the built-in, don’t double-wrap.
    if (img.closest('.gp-card')) return;

    const card = document.createElement('div');
    card.className = 'gp-card';
    img.replaceWith(card);
    card.appendChild(img);

    if (s.showCaptions) {
      const cap = document.createElement('div');
      cap.className = 'gp-caption';
      const file = (img.alt || img.title || img.src || '').split('/').pop();
      cap.textContent = file;
      card.appendChild(cap);
    }

    const actions = document.createElement('div');
    actions.className = 'gp-actions';
    actions.innerHTML = `
      <button class="gp-btn" data-act="open">Open</button>
      <button class="gp-btn" data-act="newtab" title="Open in new tab">↗</button>
      <button class="gp-btn" data-act="download" title="Download">↓</button>
    `;
    actions.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;
      if (act === 'open') openPreview(img);
      if (act === 'newtab') window.open(img.src, '_blank', 'noopener');
      if (act === 'download') downloadImage(img.src);
    });
    card.appendChild(actions);

    card.addEventListener('click', (e) => {
      if (e.target.closest('.gp-actions')) return;
      openPreview(img);
    });
  }

  function hydrateCard(card) {
    const img = card.querySelector('img');
    if (!img) return;
    const doBitmap = 'createImageBitmap' in window;
    const doIdle = 'requestIdleCallback' in window;

    const decodeTask = async () => {
      try {
        if (doBitmap && !img.src.startsWith('blob:')) {
          const r = await fetch(img.src, { cache: 'force-cache' });
          const blob = await r.blob();
          const bmp = await createImageBitmap(blob);
          bmp.close();
        } else {
          await img.decode().catch(() => {});
        }
      } catch {}
    };

    if (doIdle) requestIdleCallback(decodeTask, { timeout: 500 });
    else decodeTask();
  }

  // ===== Preview with settings =====
  function openPreview(imgEl) {
    const s = settings();
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.75)', display: 'grid', placeItems: 'center', zIndex: 10000
    });

    const frame = document.createElement('div');
    frame.className = 'gp-preview';
    frame.style.setProperty('--gp-open-height', `${Number(s.openHeight) || 800}px`);

    const big = new Image();
    big.src = imgEl.src;
    big.alt = imgEl.alt || '';
    frame.appendChild(big);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    window.addEventListener('keydown', escOnce);
    function escOnce(e) { if (e.key === 'Escape') { window.removeEventListener('keydown', escOnce); cleanup(); } }

    if (s.hoverZoom) enableHoverParallax(frame, big, s.hoverZoomScale || 1.08);
  }

  function enableHoverParallax(host, img, maxScale) {
    let rect = null, raf = 0, active = false, lock = false, scale = Math.max(1, maxScale);

    function update(e) {
      if (!rect) rect = host.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const nx = (mx / rect.width) - 0.5;
      const ny = (my / rect.height) - 0.5;
      const tx = -nx * (rect.width * 0.02);
      const ty = -ny * (rect.height * 0.02);
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function onMove(e) {
      if (!active || lock) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => update(e));
    }

    function onEnter() { active = true; host.dataset.zooming = '1'; img.style.transform = `scale(${scale})`; }
    function onLeave() { active = false; host.dataset.zooming = '0'; img.style.transform = ''; rect = null; }
    function onWheel(e) {
      if (!lock) return;
      e.preventDefault();
      scale = Math.min(2, Math.max(1, scale + (e.deltaY < 0 ? 0.02 : -0.02)));
      img.style.transform = `scale(${scale})`;
    }
    function onKey(e) {
      if (e.code === 'Space') { lock = e.type === 'keydown'; host.dataset.zooming = lock ? '1' : '0'; }
    }

    host.addEventListener('mouseenter', onEnter, { passive: true });
    host.addEventListener('mouseleave', onLeave, { passive: true });
    host.addEventListener('mousemove', onMove, { passive: true });
    host.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
  }

  function attachGlobalPreviewNav(root) {
    window.addEventListener('keydown', (e) => {
      const previewOpen = document.querySelector('.gp-preview');
      if (!previewOpen) return;
      if (e.key === 'ArrowRight') clickSibling(root, +1);
      if (e.key === 'ArrowLeft') clickSibling(root, -1);
    }, { passive: true });
  }

  function clickSibling(root, dir) {
    const cards = [...root.querySelectorAll('.gp-card')];
    const currentSrc = document.querySelector('.gp-preview img')?.src;
    if (!currentSrc) return;
    const idx = cards.findIndex(c => c.querySelector('img')?.src === currentSrc);
    const next = cards.at(idx + dir);
    next?.click();
  }

  function downloadImage(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = (url.split('/').pop() || 'image');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function bindSettings(rootEl) {
    const s = settings();
    const q = (sel) => rootEl.querySelector(sel);

    const map = {
      enabled: '[data-gp="enabled"]',
      openHeight: '[data-gp="openHeight"]',
      hoverZoom: '[data-gp="hoverZoom"]',
      hoverZoomScale: '[data-gp="hoverZoomScale"]',
      masonryDense: '[data-gp="masonryDense"]',
      showCaptions: '[data-gp="showCaptions"]',
      webpOnly: '[data-gp="webpOnly"]',
    };
    q(map.enabled).checked = !!s.enabled;
    q(map.openHeight).value = s.openHeight;
    q(map.hoverZoom).checked = !!s.hoverZoom;
    q(map.hoverZoomScale).value = s.hoverZoomScale;
    q(map.masonryDense).checked = !!s.masonryDense;
    q(map.showCaptions).checked = !!s.showCaptions;
    q(map.webpOnly).checked = !!s.webpOnly;

    rootEl.addEventListener('change', (e) => {
      const key = e.target?.dataset?.gp;
      if (!key) return;
      s[key] = (e.target.type === 'checkbox') ? e.target.checked : Number(e.target.value);
      saveSettings();
    });
  }
})();
