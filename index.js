// GalleryPlus – Dice-style settings; viewer polish only; guard /api/images/list.
// Works on builds without SillyTavern.onExtensionSettings.

(function () {
  const MODULE = 'GalleryPlus';
  const st = () => window.SillyTavern;
  const ctx = () => st()?.getContext?.() || {};
  const log = (...a) => console.log('[GalleryPlus]', ...a);

  // ---- defaults & safe settings bag ---------------------------------------
  const DEFAULTS = Object.freeze({
    enabled: true,
    openHeight: 800,
    hoverZoom: true,
    hoverZoomScale: 1.08,
  });

  function ensureSettings() {
    const bag = ctx().extensionSettings || (ctx().extensionSettings = {});
    if (!bag[MODULE]) bag[MODULE] = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (!(k in bag[MODULE])) bag[MODULE][k] = DEFAULTS[k];
    }
    return bag[MODULE];
  }
  const S = ensureSettings();
  ctx().saveSettingsDebounced?.();

  // ---- 0) Fetch shim so /show-gallery never crashes -----------------------
  // If /api/images/list fails or returns non-array, return [] instead.
  (function installFetchShim(){
    const orig = window.fetch;
    if (!orig || orig.__gpWrapped) return;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      let res;
      try {
        res = await orig.apply(this, args);
      } catch (e) {
        if (url.includes('/api/images/list')) {
          return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' }});
        }
        throw e;
      }

      try {
        if (url.includes('/api/images/list')) {
          // Bad status? provide empty list so gallery UI can still render.
          if (!res.ok) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' }});
          const clone = res.clone();
          const json = await clone.json().catch(() => null);
          if (!Array.isArray(json)) {
            return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' }});
          }
        }
      } catch (_) {
        // Fall through to original res if anything unexpected
      }
      return res;
    };
    window.fetch.__gpWrapped = true;
    log('fetch shim active');
  })();

  // ---- 1) Viewer polish (do NOT modify gallery list window) ---------------
  function enhanceImageViewer(win) {
    if (!win || win.__gpReady || !ensureSettings().enabled) return;
    win.__gpReady = true;

    // Header
    const header = document.createElement('div');
    header.className = 'gp-header';
    header.textContent = 'GalleryPlus';
    win.insertBefore(header, win.firstChild);

    // Find the image element the built-in viewer inserts
    const img = win.querySelector('img');
    if (!img) return;

    const s = ensureSettings();
    img.style.maxHeight = `${Number(s.openHeight) || 800}px`;
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    img.style.transition = 'transform 160ms ease';

    if (s.hoverZoom) {
      const maxScale = Number(s.hoverZoomScale) || 1.08;
      let rect = null;
      const onEnter = () => { rect = img.getBoundingClientRect(); img.style.transform = `scale(${maxScale})`; };
      const onMove  = (e) => {
        if (!rect) return;
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top)  / rect.height - 0.5;
        img.style.transform = `translate(${-nx*6}%, ${-ny*6}%) scale(${maxScale})`;
      };
      const onLeave = () => { rect = null; img.style.transform = ''; };
      img.addEventListener('mouseenter', onEnter, { passive: true });
      img.addEventListener('mousemove',  onMove,  { passive: true });
      img.addEventListener('mouseleave', onLeave, { passive: true });
    }
  }

  // Observe windows; only enhance popups (class .galleryImageDraggable)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes?.forEach((n) => {
        if (n.nodeType !== 1) return;
        const viewer = n.matches?.('.galleryImageDraggable') ? n : n.querySelector?.('.galleryImageDraggable');
        if (viewer) enhanceImageViewer(viewer);
      });
    }
  });

  // ---- 2) Bind settings.html (Dice-style; no ST API needed) --------------
  function bindSettingsPanel(root) {
    if (!root || root.__gpBound) return false;
    const enabledEl = root.querySelector('#gp-enabled');
    const hEl = root.querySelector('#gp-openHeight');
    const hzEl = root.querySelector('#gp-hoverZoom');
    const hzsEl = root.querySelector('#gp-hoverZoomScale');
    if (!enabledEl || !hEl || !hzEl || !hzsEl) return false;

    const s = ensureSettings();
    enabledEl.checked = !!s.enabled;
    hEl.value = s.openHeight;
    hzEl.checked = !!s.hoverZoom;
    hzsEl.value = s.hoverZoomScale;

    const save = () => ctx().saveSettingsDebounced?.();

    enabledEl.addEventListener('change', e => { s.enabled = e.target.checked; save(); });
    hEl.addEventListener('change', e => { s.openHeight = Math.max(400, Math.min(2400, Number(e.target.value)||800)); save(); });
    hzEl.addEventListener('change', e => { s.hoverZoom = e.target.checked; save(); });
    hzsEl.addEventListener('change', e => { let v = Number(e.target.value)||1.08; s.hoverZoomScale = Math.max(1.01, Math.min(1.5, v)); save(); });

    root.__gpBound = true;
    log('settings panel bound');
    return true;
    }

  // Watch for the settings fragment to appear (Dice-style loader injects it)
  const settingsMO = new MutationObserver(() => {
    document.querySelectorAll('.gp-settings[data-ext="GalleryPlus"]').forEach(bindSettingsPanel);
  });

  function start() {
    mo.observe(document.body, { childList: true, subtree: true });
    settingsMO.observe(document.body, { childList: true, subtree: true });

    // In case viewer already open or panel already injected
    document.querySelectorAll('.galleryImageDraggable').forEach(enhanceImageViewer);
    document.querySelectorAll('.gp-settings[data-ext="GalleryPlus"]').forEach(bindSettingsPanel);

    log('ready', ensureSettings());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
