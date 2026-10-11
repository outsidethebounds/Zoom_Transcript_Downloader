// MAIN-world metadata bridge. Never reads transcript bodies or authentication data.
(() => {
  if (window.__ztdNotesMetadataHook) return;
  window.__ztdNotesMetadataHook = true;
  let activeRequest = null;
  window.addEventListener('message', async event => {
    if (event.source !== window || event.data?.source !== 'ztd-notes-direct-request') return;
    const { requestId, action, fileId } = event.data;
    if (action === 'cancel') {
      if (activeRequest?.id === requestId) { activeRequest.cancelled = true; activeRequest.wake?.(); }
      return;
    }
    const reply = payload => window.postMessage({ source: 'ztd-notes-direct-response', requestId, ...payload }, location.origin);
    if (activeRequest) { reply({ kind: 'failed' }); return; }
    const adapter = globalThis.ZTDNotesDirect;
    let fn;
    try { fn = adapter?.discover(window); } catch { /* UI fallback. */ }
    if (!fn || typeof fileId !== 'string' || !fileId) { reply({ kind: 'unavailable' }); return; }
    const request = { id: requestId, cancelled: false };
    activeRequest = request;
    try {
      const result = await adapter.exportNote(fn, fileId, () => request.cancelled,
        ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); request.wake = () => { clearTimeout(timer); resolve(); }; }));
      if (!request.cancelled) reply(result);
    } finally { activeRequest = null; }
  });
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
