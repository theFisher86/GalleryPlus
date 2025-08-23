import { wireViewer } from './ui-controls.js';

function applyGalleryTitle() {
  const t = document.querySelector('#gallery .dragTitle span');
  if (t && t.textContent && !/Image GalleryPlus/.test(t.textContent)) {
    t.textContent = 'Image GalleryPlus';
  }
}

export function initObservers() {
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
