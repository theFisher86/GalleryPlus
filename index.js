// public/scripts/extensions/third-party/GalleryPlus/index.js
// or …/data/<user>/extensions/GalleryPlus/index.js

(function () {
  const MODULE = 'GalleryPlus';
  const GP = (key) => SillyTavern.getContext().extensionSettings[MODULE]?.[key];
  const ctx = () => SillyTavern.getContext();
  const log = (...a) => console.log('[GalleryPlus]', ...a);

  // --- defaults & safe init -------------------------------------------------
  const defaults = Object.freeze({
    enabled: true,
    openHeight: 800,           // px
    hoverZoom: true,
    hoverZoomScale: 1.08,
    masonryDense: false,       // reserved for future
    showCaptions: true,        // reserved for future
    webpOnly: false            // reserved for future
  });

  function settings() {
    const { extensionSettings } = ctx();
    if (!extensionSettings[MODULE]) {
      extensionSettings[MODULE] = structuredClone(defaults);
    }
    // forward-compatible fill
    for (const k of Object.keys(defaults)) {
      if (!Object.hasOwn(extensionSettings[MODULE], k)) {
        extensionSettings[MODULE][k] = defaults[k];
      }
    }
    return extensionSettings[MODULE];
  }

  // call once on load
  settings();
  ctx().saveSettingsDebounced?.();

  // --- SETTINGS PANEL (Unified Extensions menu) -----------------------------
  // This uses the documented hook that injects a small DOM panel for the row.
  // (See ST docs “UI Extensions → Persistent settings” for the pattern.) :contentReference[oaicite:0]{index=0}
  SillyTavern.onExtensionSettings?.(MODULE, (root) => {
    // wipe and build panel UI
    root.innerHTML = `
      <div class="gp-settings">
        <div class="flex gap8 alignCenter">
          <label class="checkbox_label">
            <input type="checkbox" id="gp-enabled">
            <span>Enable GalleryPlus tweaks</span>
          </label>
        </div>

        <div class="flex gap8 alignCenter">
          <label style="min-width: 180px;">Default open height (px)</label>
          <input type="number" id="gp-openHeight" min="400" max="2400" step="20" class="text_pole" style="width:120px">
        </div>

        <div class="flex gap8 alignCenter">
          <label class="checkbox_label">
            <input type="checkbox" id="gp-hoverZoom">
            <span>Hover zoom on viewer image</span>
          </label>
          <label style="min-width: 140px;">Scale</label>
          <input type="number" id="gp-hoverZoomScale" min="1.01" max="1.5" step="0.01" class="text_pole" style="width:100px">
        </div>
      </div>
    `;

    // hydrate values
    const s = settings();
    root.querySelector('#gp-enabled').checked = !!s.enabled;
    root.querySelector('#gp-openHeight').value = s.openHeight;
    root.querySelector('#gp-hoverZoom').checked = !!s.hoverZoom;
    root.querySelector('#gp-hoverZoomScale').value = s.hoverZoomScale;

    // wire events
    const save = () => ctx().saveSettingsDebounced?.();
    root.querySelector('#gp-enabled').addEventListener('change', (e) => {
      settings().enabled = e.target.checked; save();
    });
    root.querySelector('#gp-openHeight').addEventListener('change', (e) => {
      settings().openHeight = Math.max(400, Math.min(2400, Number(e.target.value) || defaults.openHeight));
      save();
    });
    root.querySelector('#gp-hoverZoom').addEventListener('change', (e) => {
      settings().hoverZoom = e.target.checked; save();
    });
    root.querySelector('#gp-hoverZoomScale').addEventListener('change', (e) => {
      let val = Number(e.target.value) || defaults.hoverZoomScale;
      val = Math.max(1.01, Math.min(1.5, val));
      settings().hoverZoomScale = val; save();
    });
  });

  // --- GALLERY LIST FIXES (pagination anchoring) ----------------------------
  // Note: DO NOT inject gp-root into <select>. We only tweak layout + colors.
  function patchGalleryListOnce() {
    const panel = document.getElementById('gallery');
    if (!panel) return;

    // Make the gallery section flex so the paginator can stick to bottom
    const dragGallery = panel.querySelector('#dragGallery');
    if (dragGallery && !dragGallery.classList.contains('gp-flexified')) {
      dragGallery.classList.add('gp-flexified');
      dragGallery.style.display = 'flex';
      dragGallery.style.flexDirection = 'column';
      dragGallery.style.height = 'calc(100% - 110px)'; // leave room for controls
      dragGallery.style.minHeight = '0';

      const gy = dragGallery.querySelector('.nGY2Gallery');
      if (gy) {
        gy.style.display = 'flex';
        gy.style.flexDirection = 'column';
        gy.style.flex = '1 1 auto';
        gy.style.minHeight = '0';
      }

      const gySub = dragGallery.querySelector('.nGY2GallerySub');
      if (gySub) {
        gySub.style.flex = '1 1 auto';
        gySub.style.minHeight = '0';
        gySub.style.height = 'auto';
        gySub.style.overflow = 'visible';
      }

      const bottom = dragGallery.querySelector('.nGY2GalleryBottom');
      if (bottom) {
        bottom.style.marginTop = 'auto';
      }
    }
  }

  // --- IMAGE VIEWER FIXES (header + open height + hover zoom) ---------------
  function patchImageViewer(node) {
    if (!node || !settings().enabled) return;

    // our header lives in .galleryImageDraggable only
    const host = node.closest('.galleryImageDraggable');
    if (!host || host.classList.contains('gp-ready')) return;

    host.classList.add('gp-ready');
    host.style.display = 'grid';
    host.style.gridTemplateRows = 'auto 1fr auto';
    host.style.gap = '8px';
    host.style.maxHeight = '90vh';
    host.style.minHeight = 'min(90vh, 100%)';

    // kill any leftover bad gp-scroll from previous versions
    host.querySelectorAll('.gp-scroll').forEach(el => el.remove());

    // gradient header (kept per your request)
    let header = host.querySelector('.gp-header');
    if (!header) {
      header = document.createElement('div');
      header.className = 'gp-header';
      header.textContent = 'GalleryPlus';
      host.insertBefore(header, host.firstChild);
    }

    // move the image right below header
    const img = host.querySelector('img');
    if (img) {
      img.style.maxHeight = `${settings().openHeight}px`;
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
      img.style.justifySelf = 'center';
      img.style.alignSelf = 'start';
      img.style.transition = 'transform 180ms ease-out';

      if (settings().hoverZoom) {
        const scale = Number(settings().hoverZoomScale) || 1.08;
        let rect = null;

        const onEnter = () => { rect = img.getBoundingClientRect(); };
        const onMove = (e) => {
          if (!rect) return;
          // inverse, subtle parallax
          const dx = ((e.clientX - rect.left) / rect.width - 0.5) * -4;  // -2..2%
          const dy = ((e.clientY - rect.top) / rect.height - 0.5) * -4;
          img.style.transform = `scale(${scale}) translate(${dx}%, ${dy}%)`;
        };
        const onLeave = () => { img.style.transform = 'scale(1) translate(0,0)'; rect = null; };

        img.addEventListener('mouseenter', onEnter);
        img.addEventListener('mousemove', onMove);
        img.addEventListener('mouseleave', onLeave);
      }
    }
  }

  // --- observe dynamic content ---------------------------------------------
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      // gallery list mounts/updates
      if (document.getElementById('gallery')) patchGalleryListOnce();

      // any newly opened viewer windows
      m.addedNodes?.forEach((n) => {
        if (n.nodeType === 1) {
          if (n.classList?.contains('galleryImageDraggable') || n.querySelector?.('.galleryImageDraggable')) {
            patchImageViewer(n);
          }
        }
      });
    }
  });

  obs.observe(document.body, { childList: true, subtree: true });

  // one-shot pass if already open
  patchGalleryListOnce();
  document.querySelectorAll('.galleryImageDraggable').forEach(patchImageViewer);

  log('loaded', settings());
})();
