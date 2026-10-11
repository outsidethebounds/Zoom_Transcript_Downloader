// MAIN-world metadata bridge. Never reads transcript bodies or authentication data.
(() => {
  if (window.__ztdNotesMetadataHook) return;
  window.__ztdNotesMetadataHook = true;
  function annotateRows() {
    for (const button of document.querySelectorAll('button[data-has-tooltip="true"]')) {
      const key = Object.keys(button).find(k => k.startsWith('__reactFiber'));
      let fiber = key ? button[key] : null;
      for (let n = 0; fiber && n < 14; n++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (!props || typeof props !== 'object') continue;
        const label = ['content', 'title', 'label', 'tooltip', 'text'].map(k => props[k]).find(v => typeof v === 'string' && /^Download transcript$/i.test(v.trim()));
        if (label) { button.setAttribute('data-ztd-download-transcript', 'true'); break; }
      }
    }

    for (const row of document.querySelectorAll('[role="row"][data-row="item"]')) {
      const key = Object.keys(row).find(k => k.startsWith('__reactFiber'));
      let fiber = key ? row[key] : null;
      for (let n = 0; fiber && n < 8; n++, fiber = fiber.return) {
        const item = fiber.memoizedProps?.item;
        if (!item?.id) continue;
        row.setAttribute('data-ztd-note-id', String(item.id));
        break;
      }
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'ztd-notes-load-more') return;
    const row = document.querySelector('[role="row"][data-row="item"]');
    const key = row && Object.keys(row).find(k => k.startsWith('__reactFiber'));
    let fiber = key ? row[key] : null;
    for (let n = 0; fiber && n < 25; n++, fiber = fiber.return) {
      if (typeof fiber.memoizedProps?.onLoadMore === 'function') { fiber.memoizedProps.onLoadMore(); break; }
    }
  });
  new MutationObserver(annotateRows).observe(document.documentElement, { childList: true, subtree: true });
  annotateRows();
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (/^https:\/\/file-paa\.zoom\.us\//.test(this.href)) {
      window.postMessage({ source: 'ztd-notes-export-metadata', url: this.href }, location.origin);
    }
    return nativeAnchorClick.apply(this, args);
  };
})();
