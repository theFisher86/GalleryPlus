// GalleryPlus – register in Extensions panel; add viewer header/hover-zoom only;
// guard built-in gallery fetch so /show-gallery never crashes on non-array data.

(function () {
  const MODULE = 'GalleryPlus';
  const ctx = () => window.SillyTavern?.getContext?.() || {};
  const st  = () => window.SillyTavern;
  const log = (...a) => console.log('[GalleryPlus]', ...a);

  // ----- defaults & safe init ----------------------------------------------
  const DEFAULTS = Object.freeze({
    enabled: true,
    openHeight: 800,        // px
    hoverZoom: true,
    hoverZoomScale: 1.08,
  });

  function settings() {
    const bag = ctx().extensionSettings || (ctx().extensionSettings = {});
    if (!bag[MODULE]) bag[MODULE] = structuredClone(DEFAULTS);
    for (const k of Object.keys(DEFAULTS)) {
      if (!Object.hasOwn(bag[MODULE], k)) bag[MODULE][k] = DEFAULTS[k];
    }
    return bag[MODULE];
  }
  settings();
  ctx().saveSettingsDebounced?.();

  // ----- 0) Guard the built-in Gallery fetch so /show-gallery never dies ----
  // Some builds return an object or error JSON from /api/images/list.
  // The built-in code expects an array and calls .map -> throws.
  // We wrap getGalleryItems (if present) to coerce non-arrays to [].
  function installGalleryGuard() {
    const g = window.getGalleryItems;
    if (!g || g.__gpWrapped) return;
    window.getGalleryItems = async function (...args) {
      try {
        const data = await g.apply(this, args);
        // If the original returns { items: [...] } or anything not an array,
        // coerce to [] or .items to keep the gallery usable.
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.items)) return data.items;
        return [];
      } catch (e) {
        console.warn('[GalleryPlus] guarded getGalleryItems error:', e);
        return [];
      }
    };
    window.getGalleryItems.__gpWrapped = true;
    log('installed gallery guard');
  }

  // ----- 1) Register settings in unified Extensions panel -------------------
  // Pattern used by first-party extensions: onExtensionSettings(name, cb)
  st()?.onExtensionSettings?.(MODULE, (root) => {
    const s = settings();
    root.innerHTML = `
      <div class="gp-settings" style="display:grid;gap:10px;">
        <label class="checkbox_label">
          <input type="checkbox" id="gp-enabled">
          <span>Enable GalleryPlus</span>
        </label>
        <div style="display:flex;gap:10px;align-items:center;">
          <label style="min-width:180px;">Default open height (px)</label>
          <input type="number" id="gp-openHeight" min="400" max="2400" step="20" class="text_pole" style="width:120px">
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label class="checkbox_label">
            <input type="checkbox" id="gp-hoverZoom">
            <span>Hover zoom in viewer</span>
          </label>
          <label style="min-width:120px;">Scale</label>
          <input type="number" id="gp-hoverZoomScale" min="1.01" max="1.5" step="0.01" class="text_pole" style="width:100px">
        </div>
      </div>
    `;
    root.querySelector('#gp-enabled').checked = !!s.enabled;
    root.querySelector('#gp-openHeight').value = s.openHeight;
    root.querySelector('#gp-hoverZoom').checked = !!s.hoverZoom;
    root.querySelector('#gp-hoverZoomScale').value = s.hoverZoomScale;

    const save = () => ctx().saveSettingsDebounced?.();
    root.querySelector('#gp-enabled').addEventListener('change', e => { s.enabled = e.target.checked; save(); });
    root.querySelector('#gp-openHeight').addEventListener('change', e => { s.openHeight = Math.max(400, Math.min(2400, Number(e.target.value)||800)); save(); });
    root.querySelector('#gp-hoverZoom').addEventListener('change', e => { s.hoverZoom = e.target.checked; save(); });
    root.querySelector('#gp-hoverZoomScale').addEventListener('change', e => { let v = Number(e.target.value)||1.08; s.hoverZoomScale = Math.max(1.01, Math.min(1.5, v)); save(); });
  });

  // ----- 2) Image viewer polish (NO changes to gallery list window) ---------
  function enhanceImageViewer(win) {
    if (!win || win.__gpReady || !settings().enabled) return;
    win.__gpReady = true;

    // Header (gradient)
    const header = document.createElement('div');
    header.className = 'gp-header';
    header.textContent = 'GalleryPlus';
    win.insertBefore(header, win.firstChild);

    // The <img> that viewer inserts
    const img = win.querySelector('img');
    if (!img) return;

    img.style.maxHeight = `${Number(settings().openHeight)||800}px`;
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    img.style.transition = 'transform 160ms ease';

    if (settings().hoverZoom) {
      const maxScale = Number(settings().hoverZoomScale)||1.08;
      let rect = null;
      const onEnter = () => { rect = img.getBoundingClientRect(); img.style.transform = `scale(${maxScale})`; };
      const onMove  = (e) => {
        if (!rect) return;
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top)  / rect.height - 0.5;
        img.style.transform = `translate(${-nx*6}%, ${-ny*6}%) scale(${maxScale})`; // subtle inverted parallax
      };
      const onLeave = () => { rect = null; img.style.transform = ''; };
      img.addEventListener('mouseenter', onEnter, { passive: true });
      img.addEventListener('mousemove',  onMove,  { passive: true });
      img.addEventListener('mouseleave', onLeave, { passive: true });
    }
  }

  // ----- 3) Observe windows -------------------------------------------------
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes?.forEach((n) => {
        if (n.nodeType !== 1) return;
        // built-in gallery image popup uses .galleryImageDraggable
        const viewer = n.matches?.('.galleryImageDraggable') ? n : n.querySelector?.('.galleryImageDraggable');
        if (viewer) enhanceImageViewer(viewer);
      });
    }
  });

  function start() {
    installGalleryGuard();
    mo.observe(document.body, { childList: true, subtree: true });
    // In case a viewer is already open
    document.querySelectorAll('.galleryImageDraggable').forEach(enhanceImageViewer);
    log('ready', settings());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
