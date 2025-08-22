/* GalleryPlus – robust for older ST builds (no onExtensionSettings needed) */
/* global SillyTavern */

(() => {
  const EXT_ID = 'GalleryPlus';
  const ST = window.SillyTavern;
  if (!ST) {
    console.warn('[GalleryPlus] SillyTavern not found');
    return;
  }

  // ---- Settings bootstrap ---------------------------------------------------
  const ctx = ST.getContext?.() || {};
  ctx.extensionSettings ??= {};
  const store = (ctx.extensionSettings[EXT_ID] ??= {
    enabled: true,
    diag: Date.now(),
    openHeight: 800,
    hoverZoom: true,
    hoverZoomScale: 1.08
  });

  console.log('[GalleryPlus] boot', { store });

  function save() {
    try {
      ST.saveSettingsDebounced?.();
    } catch (e) {
      /* noop */
    }
  }

  // Apply CSS custom properties
  function applyCssVars() {
    const id = 'gp-css-vars';
    let tag = document.getElementById(id);
    if (!tag) {
      tag = document.createElement('style');
      tag.id = id;
      document.head.appendChild(tag);
    }
    const h = Math.max(220, Number(store.openHeight) || 800);
    const s = Math.max(1, Math.min(1.25, Number(store.hoverZoomScale) || 1.08));
    tag.textContent = `
      :root {
        --gp-open-height: ${h}px;
        --gp-zoom-scale: ${s};
      }
    `;
  }
  applyCssVars();

  // Dice-style: our settings.html is static. We attach when it appears.
  const SETTINGS_ROOT = '#gp-settings-root';

  const settingsObserver = new MutationObserver(() => {
    const root = document.querySelector(SETTINGS_ROOT);
    if (!root || root.__gpMounted) return;
    root.__gpMounted = true;
    console.log('[GalleryPlus] settings panel detected');

    const $ = (sel) => root.querySelector(sel);

    $('#gp-enabled').checked = !!store.enabled;
    $('#gp-openHeight').value = store.openHeight;
    $('#gp-hoverZoom').checked = !!store.hoverZoom;
    $('#gp-hoverZoomScale').value = store.hoverZoomScale;

    const syncOut = () => {
      const oh = Number($('#gp-openHeight').value) || store.openHeight;
      const sc = Number($('#gp-hoverZoomScale').value) || store.hoverZoomScale;
      $('#gp-openHeightValue').textContent = `${oh}px`;
      $('#gp-hoverZoomScaleValue').textContent = sc.toFixed(2);
    };
    syncOut();

    root.addEventListener('input', (e) => {
      if (e.target.id === 'gp-enabled') store.enabled = e.target.checked;
      if (e.target.id === 'gp-openHeight') store.openHeight = Math.max(220, Math.min(4000, parseInt(e.target.value || 800, 10)));
      if (e.target.id === 'gp-hoverZoom') store.hoverZoom = e.target.checked;
      if (e.target.id === 'gp-hoverZoomScale') store.hoverZoomScale = Math.max(1.0, Math.min(1.25, parseFloat(e.target.value || 1.08)));
      syncOut();
      applyCssVars();
      save();
    });
  });
  settingsObserver.observe(document.body, { childList: true, subtree: true });

  // ---- Gallery list: pin pagination to bottom -------------------------------
  function fixGalleryList(win) {
    try {
      const dragGallery = win.querySelector('#dragGallery');
      if (!dragGallery) return;

      // Calculate available height from the top of #dragGallery to the bottom of the window
      const winRect = win.getBoundingClientRect();
      const dgRect = dragGallery.getBoundingClientRect();
      const available = Math.max(300, Math.floor(win.clientHeight - (dgRect.top - winRect.top) - 8));
      dragGallery.style.height = available + 'px';

      const g = dragGallery.querySelector('.nGY2Gallery');
      const sub = dragGallery.querySelector('.nGY2GallerySub');
      const bottom = dragGallery.querySelector('.nGY2GalleryBottom');
      if (g && sub && bottom) {
        g.style.display = 'flex';
        g.style.flexDirection = 'column';
        g.style.height = '100%';
        g.style.position = 'relative';

        sub.style.flex = '1 1 auto';
        sub.style.height = 'auto';
        sub.style.overflow = 'auto';

        bottom.style.flex = '0 0 auto';
        bottom.style.position = 'sticky';
        bottom.style.bottom = '0';
        bottom.style.padding = '6px 0';
      }
      console.log('[GalleryPlus] gallery list fixed');
    } catch (err) {
      console.warn('[GalleryPlus] fixGalleryList error', err);
    }
  }

  // React when the gallery window is added
  const listObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.id === 'gallery') {
          // Defer a tick so nGY2 can lay out thumbnails first
          setTimeout(() => fixGalleryList(n), 0);
        }
      }
    }
  });
  listObserver.observe(document.body, { childList: true, subtree: true });

  // ---- Image viewer: gradient header + hover zoom (no wrappers) -------------
  function enhanceViewer(win) {
    try {
      // Kill any leftover wrappers from earlier versions
      win.querySelectorAll('.gp-scroll').forEach((el) => el.remove());

      // Header pill
      if (!win.querySelector('.gp-header')) {
        const hdr = document.createElement('div');
        hdr.className = 'gp-header';
        hdr.textContent = 'GalleryPlus';
        win.insertBefore(hdr, win.firstChild);
      }

      // Default height on open
      if (store.openHeight) {
        win.style.height = Math.max(220, Number(store.openHeight) || 800) + 'px';
      }

      // Hover zoom
      const img = win.querySelector('img');
      if (img && store.hoverZoom) {
        const scale = Number(store.hoverZoomScale) || 1.08;
        const maxShift = 12; // px
        const host = win;

        img.style.transition = 'transform 120ms ease-out';
        img.style.willChange = 'transform';

        const onMove = (e) => {
          const r = host.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          const tx = (0.5 - x) * maxShift; // inverse movement
          const ty = (0.5 - y) * maxShift;
          img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        };
        const onLeave = () => {
          img.style.transform = '';
        };

        host.addEventListener('mousemove', onMove);
        host.addEventListener('mouseleave', onLeave);
      }
      console.log('[GalleryPlus] viewer enhanced');
    } catch (err) {
      console.warn('[GalleryPlus] enhanceViewer error', err);
    }
  }

  const viewerObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.classList.contains('galleryImageDraggable')) {
          enhanceViewer(n);
        }
      }
    }
  });
  viewerObserver.observe(document.body, { childList: true, subtree: true });

  // ---- Safety: defensive parsing for /api/images/list results ----------------
  // If you patched a fetch shim earlier, leave it in place; just ensure we never crash on non-arrays.
  const oldFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await oldFetch(...args);
    try {
      // clone only requests we care about
      if (res.ok && /\/api\/images\/list\b/.test(res.url)) {
        const clone = res.clone();
        const data = await clone.json().catch(() => null);
        if (data && !Array.isArray(data) && !Array.isArray(data?.items)) {
          console.warn('[GalleryPlus] /api/images/list returned unexpected payload; extension will adapt.');
        }
      }
    } catch (e) {
      /* ignore */
    }
    return res;
  };

  console.log('[GalleryPlus] ready', store);
})();
