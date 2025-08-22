// GalleryPlus – augments the built-in Gallery.
// Tested against ST’s extension API per docs: getContext(), extensionSettings, saveSettingsDebounced.
// Docs: https://docs.sillytavern.app/for-contributors/writing-extensions/

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

function ctx() { return SillyTavern.getContext(); }
function settings() {
  const { extensionSettings } = ctx();
  if (!extensionSettings[MODULE]) extensionSettings[MODULE] = structuredClone(DEFAULTS);
  for (const k of Object.keys(DEFAULTS)) {
    if (!Object.hasOwn(extensionSettings[MODULE], k)) extensionSettings[MODULE][k] = DEFAULTS[k];
  }
  return extensionSettings[MODULE];
}

function saveSettings() { ctx().saveSettingsDebounced(); }

(async function init() {
  // Register settings panel
  SillyTavern.onExtensionSettings(MODULE, async (rootEl) => {
    rootEl.innerHTML = await fetch(import.meta.url.replace('index.js', 'settings.html')).then(r => r.text());
    bindSettings(rootEl);
  });

  // When the built-in Gallery opens, we augment its content
  // The built-in exposes showCharGallery()/viewWithDragbox in its module; we hook at DOM level to avoid fragile imports.
  // We watch for the gallery modal container to mount, then enhance.
  const observer = new MutationObserver(muts => {
    if (!settings().enabled) return;
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (!(n instanceof HTMLElement)) return;
        // Heuristic: the gallery modal usually has a container with data-ext="gallery" or similar structure.
        if (n.matches?.('.char_gallery_modal, [data-gallery-root]')) {
          enhanceGallery(n);
        }
        // If nested
        const found = n.querySelector?.('.char_gallery_modal, [data-gallery-root]');
        if (found) enhanceGallery(found);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also add a command so you can open the gallery quickly if the built-in supports it
  // Some builds register /show-gallery per older commit; we add a safe handler if slash-commands exist.
  if (window.SillyTavern?.registerSlashCommand) {
    SillyTavern.registerSlashCommand?.('gp', () => openBuiltInGallery(), ['galleryplus'], 'Open the gallery (GalleryPlus)', true, true);
  }
})();

function openBuiltInGallery() {
  // Try to call a known global if present; else click the UI button if available.
  // This avoids hard imports that can break on updates.
  if (window.showCharGallery) return window.showCharGallery();
  const btn = document.querySelector('[data-action="open-gallery"], .open_gallery_button, [aria-label="Open gallery"]');
  btn?.click();
}

/** Enhance the gallery root DOM node */
function enhanceGallery(root) {
  // Avoid double enhancing
  if (root.__gpEnhanced) return;
  root.__gpEnhanced = true;

  // Find the container that holds the thumbnails and the pagination controls
  const gridHost = root.querySelector('.char_gallery, .gallery-grid, [data-gallery-grid]') || root;
  const pager   = root.querySelector('.pagination, .gallery-pagination') || createPaginationBar(root);

  gridHost.classList.add('gp-gallery');
  if (settings().masonryDense) gridHost.classList.add('gp-dense');

  // Stabilize pagination position
  pager.classList.add('gp-pagination-bar');

  // Wire pagination if built-in exposes events/buttons; otherwise leave existing handlers intact.
  stabilizePagination(root, pager);

  // Rebuild visible cards into aspect-ratio containers and lazy load
  upgradeThumbnails(gridHost);

  // Keyboard nav in preview
  attachGlobalPreviewNav(root);
}

/** Creates a sticky pagination bar if none exists */
function createPaginationBar(root) {
  const bar = document.createElement('div');
  bar.className = 'gp-pagination-bar';
  root.appendChild(bar);
  return bar;
}

/** Attach (or re-attach) pagination handlers safely */
function stabilizePagination(root, pager) {
  // If buttons exist already, just move them into sticky bar to keep DOM jank-free.
  const existing = root.querySelectorAll('.pagination button, .gallery-pagination button');
  if (existing.length) {
    existing.forEach(b => pager.appendChild(b));
  }
}

/** Convert current thumbnail list into stable cards with lazy load + bitmap decode */
function upgradeThumbnails(gridHost) {
  const imgs = gridHost.querySelectorAll('img:not([data-gp])');
  imgs.forEach(img => wrapAsCard(img));
  // Lazy reveal as they intersect
  const io = new IntersectionObserver((entries, o) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const card = e.target;
        hydrateCard(card);
        o.unobserve(card);
      }
    }
  }, { root: gridHost.closest('.char_gallery_modal') || null, rootMargin: '200px' });

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

  // Caption/metadata
  if (s.showCaptions) {
    const cap = document.createElement('div');
    cap.className = 'gp-caption';
    const { naturalWidth, naturalHeight } = img;
    const file = (img.alt || img.title || img.src || '').split('/').pop();
    cap.textContent = file;
    card.appendChild(cap);
  }

  // Quick actions
  const actions = document.createElement('div');
  actions.className = 'gp-actions';
  actions.innerHTML = `
    <button class="gp-btn" data-act="open">Open</button>
    <button class="gp-btn" data-act="newtab">↗</button>
    <button class="gp-btn" data-act="download">↓</button>
  `;
  actions.addEventListener('click', (e) => {
    const act = e.target?.dataset?.act;
    if (!act) return;
    if (act === 'open') openPreview(img);
    if (act === 'newtab') window.open(img.src, '_blank', 'noopener');
    if (act === 'download') downloadImage(img.src);
  });
  card.appendChild(actions);

  // Also open on click
  card.addEventListener('click', (e) => {
    // ignore clicks on actions
    if (e.target.closest('.gp-actions')) return;
    openPreview(img);
  });
}

function hydrateCard(card) {
  // If using thumbnails with placeholders, you could swap src here.
  // Additionally, decode eagerly off-thread when supported.
  const img = card.querySelector('img');
  if (!img) return;
  const doBitmap = 'createImageBitmap' in window;
  const doIdle = 'requestIdleCallback' in window;

  const decodeTask = async () => {
    try {
      if (doBitmap && img.src.startsWith('blob:') === false) {
        const r = await fetch(img.src, { cache: 'force-cache' });
        const blob = await r.blob();
        const bmp = await createImageBitmap(blob);
        // draw to a bitmap canvas? not needed; setting img.src is enough after decode
        // just revoke to release memory if we blobbed
        // (we didn't blob here since we used fetch directly)
        bmp.close(); // free GPU memory
      } else {
        await img.decode().catch(() => {});
      }
    } catch {}
  };

  if (doIdle) requestIdleCallback(decodeTask, { timeout: 500 });
  else decodeTask();
}

/** Preview modal with configurable height + hover zoom/parallax */
function openPreview(imgEl) {
  const s = settings();

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,.75)', display: 'grid', placeItems: 'center', zIndex: 10000
  });

  const frame = document.createElement('div');
  frame.className = 'gp-preview';
  frame.style.setProperty('--gp-open-height', `${Number(s.openHeight) || DEFAULTS.openHeight}px`);

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

  if (s.hoverZoom) enableHoverParallax(frame, big, s.hoverZoomScale || DEFAULTS.hoverZoomScale);
}

function enableHoverParallax(host, img, maxScale) {
  let rect = null, raf = 0, active = false, lock = false, scale = Math.max(1, maxScale);

  function update(e) {
    if (!rect) rect = host.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const nx = (mx / rect.width) - 0.5;   // -0.5..0.5
    const ny = (my / rect.height) - 0.5;
    const tx = -nx * (rect.width * 0.02); // invert movement, subtle
    const ty = -ny * (rect.height * 0.02);
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function onMove(e) {
    if (!active || lock) return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => update(e));
  }

  function onEnter() {
    active = true;
    host.dataset.zooming = '1';
    img.style.transform = `scale(${scale})`;
  }
  function onLeave() {
    active = false;
    host.dataset.zooming = '0';
    img.style.transform = '';
  }
  function onWheel(e) {
    if (!lock) return; // only when locked
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

/** Global keyboard nav to switch images while preview is open */
function attachGlobalPreviewNav(root) {
  // If the built-in attaches handlers, we don’t fight it; we only add ours if a .gp-preview exists
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

/** Bind settings panel controls */
function bindSettings(rootEl) {
  const s = settings();

  rootEl.querySelector('[data-gp="enabled"]').checked = !!s.enabled;
  rootEl.querySelector('[data-gp="openHeight"]').value = s.openHeight;
  rootEl.querySelector('[data-gp="hoverZoom"]').checked = !!s.hoverZoom;
  rootEl.querySelector('[data-gp="hoverZoomScale"]').value = s.hoverZoomScale;
  rootEl.querySelector('[data-gp="masonryDense"]').checked = !!s.masonryDense;
  rootEl.querySelector('[data-gp="showCaptions"]').checked = !!s.showCaptions;
  rootEl.querySelector('[data-gp="webpOnly"]').checked = !!s.webpOnly;

  rootEl.addEventListener('change', (e) => {
    const key = e.target?.dataset?.gp;
    if (!key) return;
    s[key] = (e.target.type === 'checkbox') ? e.target.checked : Number(e.target.value);
    saveSettings();
  });
}
