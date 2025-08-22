// GalleryPlus – clean feature build with anchored pagination in the gallery window
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

  // Robust: load settings.html without import.meta.url
  async function loadSettingsHTML() {
    const base =
      (document.currentScript && new URL('.', document.currentScript.src).href) ||
      '/scripts/extensions/third-party/GalleryPlus/';
    const res = await fetch(base + 'settings.html');
    return await res.text();
  }

  // --- Init: register settings panel and DOM hooks
  const onReady = (fn) => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

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

    // Enhance any gallery already present
    document.querySelectorAll(GALLERY_SELECTOR).forEach(enhanceGallery);

    // Optional slash command helper
    if (st()?.registerSlashCommand) {
      st().registerSlashCommand('gp', () => openBuiltInGallery(), ['galleryplus'], 'Open the gallery (GalleryPlus)', true, true);
    }
  });

  const GALLERY_SELECTOR = [
    '.char_gallery_modal',
    '[data-gallery-root]',
    '.gallery-modal',
    '.gallery-root',
    '#character-gallery',
    '[class*="gallery"]'
  ].join(',');

  function isGalleryNode(n) {
    if (!(n instanceof HTMLElement)) return false;
    return n.matches?.(GALLERY_SELECTOR);
  }

  function openBuiltInGallery() {
    if (window.showCharGallery) return window.showCharGallery();
    const btn = document.querySelector('[data-action="open-gallery"], .open_gallery_button, [aria-label="Open gallery"]');
    btn?.click();
  }

  // ====== Enhancement pipeline ======
  function enhanceGallery(root) {
    if (root.__gpEnhanced) return;
    root.__gpEnhanced = true;

    const s = settings();

    // Build a stable 3-row structure inside the gallery container:
    // [header] [scrolling content] [footer]
    root.classList.add('gp-root');

    // Header
    const header = document.createElement('div');
    header.className = 'gp-header';
    header.textContent = 'GalleryPlus';
    root.prepend(header);

    // Find the original grid host (thumbnails) and pagination controls
    const originalGrid =
      root.querySelector('.char_gallery, .gallery-grid, [data-gallery-grid], img, .thumbnail, .thumbs, [class*="thumb"]') ||
      root;

    // Collect any pre-existing pagination controls to move into our footer
    const existingPagerButtons = root.querySelectorAll('.pagination button, .gallery-pagination button, .pager button, [data-page]');

    // Create scroll container and place the grid inside
    const scroll = document.createElement('div');
    scroll.className = 'gp-scroll';
    // If the originalGrid is the root, clone children that look like items
    if (originalGrid === root) {
      const wrap = document.createElement('div');
      wrap.className = 'gp-gallery';
      while (root.children.length && !root.children[0].classList.contains('gp-header')) {
        const el = root.children[0];
        if (el === scroll) break;
        wrap.appendChild(el);
      }
      scroll.appendChild(wrap);
    } else {
      // Wrap the existing grid in our own gp-gallery container to normalize layout
      const wrap = document.createElement('div');
      wrap.className = 'gp-gallery';
      originalGrid.replaceWith(scroll);
      scroll.appendChild(wrap);
      // move original grid’s children into wrap
      [...originalGrid.children].forEach((c) => wrap.appendChild(c));
    }
    root.appendChild(scroll);

    // Footer (sticky inside modal)
    const footer = document.createElement('div');
    footer.className = 'gp-footer';
    const bar = document.createElement('div');
    bar.className = 'gp-pagination-bar';
    footer.appendChild(bar);
    root.appendChild(footer);

    // Move existing pagination controls (if any) into our bar
    existingPagerButtons.forEach((b) => bar.appendChild(b));

    // Now normalize cards, lazy-load, and wire behaviors
    const grid = root.querySelector('.gp-gallery');
    if (s.masonryDense) grid.classList.add('gp-dense');

    upgradeThumbnails(grid);
    attachGlobalPreviewNav(root);
  }

  // Turn each <img> into a stable card with actions/caption and lazy decode
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

    const card = document.createElement('div');
    card.className = 'gp-card';
    img.replaceWith(card);
    card.appendChild(img);

    // Caption
    if (s.showCaptions) {
      const cap = document.createElement('div');
      cap.className = 'gp-caption';
      const file = (img.alt || img.title || img.src || '').split('/').pop();
      cap.textContent = file;
      card.appendChild(cap);
    }

    // Quick actions
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

    // Also open on click (ignore action buttons)
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

  // ====== Preview with configurable default height and subtle inverse parallax ======
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

    // Wire up all inputs in settings.html (same data-gp names used before)
    const map = {
      enabled: '[data-gp="enabled"]',
      openHeight: '[data-gp="openHeight"]',
      hoverZoom: '[data-gp="hoverZoom"]',
      hoverZoomScale: '[data-gp="hoverZoomScale"]',
      masonryDense: '[data-gp="masonryDense"]',
      showCaptions: '[data-gp="showCaptions"]',
      webpOnly: '[data-gp="webpOnly"]',
    };
    rootEl.querySelector(map.enabled).checked = !!s.enabled;
    rootEl.querySelector(map.openHeight).value = s.openHeight;
    rootEl.querySelector(map.hoverZoom).checked = !!s.hoverZoom;
    rootEl.querySelector(map.hoverZoomScale).value = s.hoverZoomScale;
    rootEl.querySelector(map.masonryDense).checked = !!s.masonryDense;
    rootEl.querySelector(map.showCaptions).checked = !!s.showCaptions;
    rootEl.querySelector(map.webpOnly).checked = !!s.webpOnly;

    rootEl.addEventListener('change', (e) => {
      const key = e.target?.dataset?.gp;
      if (!key) return;
      s[key] = (e.target.type === 'checkbox') ? e.target.checked : Number(e.target.value);
      saveSettings();
    });
  }
})();
