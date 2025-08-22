// --- GALLERYPLUS NUCLEAR TEST BUILD (diagnostics) ---
(() => {
  const MODULE = 'GalleryPlus';

  function ctx() {
    return window.SillyTavern?.getContext?.() || {};
  }

  // Run when DOM is ready
  const onReady = (fn) => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

  function log(...args) {
    console.log('%c[GalleryPlus]%c', 'color:#fff;background:#7b1fa2;padding:2px 6px;border-radius:4px', '', ...args);
  }

  // Add obvious 💣 to page chrome so we know the script executed at all
  function plantPageBombs() {
    try {
      document.title = `💣 ${document.title}`;
      const badge = document.createElement('div');
      badge.textContent = '💣 GalleryPlus active';
      Object.assign(badge.style, {
        position: 'fixed', top: '6px', right: '6px', zIndex: 999999,
        background: 'rgba(123,31,162,.9)', color: '#fff', padding: '6px 10px',
        borderRadius: '8px', fontSize: '12px', fontWeight: '600',
        boxShadow: '0 2px 10px rgba(0,0,0,.4)',
      });
      badge.setAttribute('data-gp-badge', '1');
      document.body.appendChild(badge);
      log('Nuclear test badge added.');
    } catch (e) {
      console.error('[GalleryPlus] Failed to plant page bombs:', e);
    }
  }

  // Add 💣 into gallery modal to prove we’re hooking the right node
  function bombGallery(root) {
    if (!root || root.__gpBombed) return;
    root.__gpBombed = true;

    const hdr = document.createElement('div');
    hdr.textContent = '💣💣💣 GalleryPlus hooked this gallery 💣💣💣';
    Object.assign(hdr.style, {
      position: 'sticky', top: '0', zIndex: 5, padding: '10px',
      background: 'linear-gradient(90deg,#7b1fa2,#512da8)', color: '#fff',
      borderBottom: '1px solid #32184c', textAlign: 'center', fontWeight: '700',
    });
    root.prepend(hdr);
    log('Bombed gallery root:', root);
  }

  // Heuristics to find the built-in Gallery root (covers multiple builds)
  function isGalleryNode(n) {
    if (!(n instanceof HTMLElement)) return false;
    return (
      n.matches?.('.char_gallery_modal, [data-gallery-root], .gallery-modal, .gallery-root, #character-gallery') ||
      // fallbacks
      n.id?.toLowerCase().includes('gallery') ||
      n.className?.toString().toLowerCase().includes('gallery')
    );
  }

  function attachObserver() {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (isGalleryNode(n)) bombGallery(n);
          const nested = n.querySelector?.('.char_gallery_modal, [data-gallery-root], .gallery-modal, .gallery-root, [id*="gallery"]');
          if (nested) bombGallery(nested);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Also bomb any gallery that’s already in the DOM
    document.querySelectorAll('.char_gallery_modal, [data-gallery-root], .gallery-modal, .gallery-root, [id*="gallery"]').forEach(bombGallery);

    log('MutationObserver attached for gallery nodes.');
  }

  // Minimal settings bootstrap so we can confirm persistence wiring
  function ensureSettings() {
    try {
      const { extensionSettings, saveSettingsDebounced } = ctx();
      if (!extensionSettings) { log('No extensionSettings yet; getContext() may not be ready.'); return; }
      if (!extensionSettings[MODULE]) extensionSettings[MODULE] = { enabled: true, diag: Date.now() };
      if (!extensionSettings[MODULE].enabled) extensionSettings[MODULE].enabled = true;
      saveSettingsDebounced?.();
      log('Settings ok:', extensionSettings[MODULE]);
    } catch (e) {
      console.error('[GalleryPlus] settings error:', e);
    }
  }

  onReady(() => {
    log('Script executed; DOM ready.');
    ensureSettings();
    plantPageBombs();
    attachObserver();
  });
})();
