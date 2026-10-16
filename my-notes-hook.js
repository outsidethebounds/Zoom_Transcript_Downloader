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
        // This is the occurrence key corresponding to the recording-list data.meetingId.
        // Do not substitute the recurring meeting number or title/date fields.
        const occurrenceId = item.meeting && (item.meeting.meetingId ?? item.meeting.meeting_id);
        if ((typeof occurrenceId === 'string' || typeof occurrenceId === 'number') && String(occurrenceId).trim()) row.setAttribute('data-ztd-occurrence-id', String(occurrenceId).trim());
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

  // Observe only the Notes-list API contract; never forward cursors, note text,
  // participant data, auth headers, or response bodies across worlds.
  const NOTES_LIST_PATH = '/api/file/meeting_notes/my_notes';
  let notesPaginationSequence = 0;
  let notesPaginationPages = 0;
  let notesPaginationRows = 0;
  let lastNotesPagination = null;
  const requestKeyNames = (url, body) => {
    const keys = [];
    try { for (const [key] of new URL(url, location.href).searchParams) keys.push(key); } catch {}
    if (typeof body === 'string') {
      try { const value = JSON.parse(body); if (value && typeof value === 'object') keys.push(...Object.keys(value)); }
      catch { try { for (const [key] of new URLSearchParams(body)) keys.push(key); } catch {} }
    } else if (body instanceof URLSearchParams || body instanceof FormData) {
      for (const [key] of body) keys.push(key);
    }
    return [...new Set(keys)].sort();
  };
  const isNotesListUrl = value => {
    try { const url = new URL(value, location.href); return /(?:^|\.)zoom\.us$/i.test(url.hostname) && url.pathname === NOTES_LIST_PATH; }
    catch { return false; }
  };
  const publishNotesPage = (method, url, body, status, mime, payload) => {
    const keys = requestKeyNames(url, body);
    const notesList = payload?.notesList;
    const hasSchema = payload && Array.isArray(notesList) && typeof payload.nextPageToken === 'string';
    if (keys.includes('pageToken') === false) { notesPaginationPages = 0; notesPaginationRows = 0; }
    notesPaginationSequence += 1;
    notesPaginationPages += 1;
    const count = Array.isArray(notesList) ? notesList.length : null;
    if (count != null) notesPaginationRows += count;
    lastNotesPagination = {
      valid: method === 'GET' && status === 200 && /^application\/json(?:;|$)/i.test(mime) && hasSchema,
      method, path: NOTES_LIST_PATH, status, mime, requestKeys: keys,
      notesCount: count, nextPageTokenPresent: typeof payload?.nextPageToken === 'string' && payload.nextPageToken.length > 0,
      sequence: notesPaginationSequence, pages: notesPaginationPages, totalRows: notesPaginationRows,
    };
    window.postMessage({ source: 'ztd-notes-pagination-result', payload: lastNotesPagination }, location.origin);
  };
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this.__ztdNotesPageRequest = { method: String(method || 'GET').toUpperCase(), url: String(url || '') };
    return originalXhrOpen.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function(body) {
    const request = this.__ztdNotesPageRequest;
    if (request && isNotesListUrl(request.url)) {
      this.addEventListener('load', () => {
        let payload = null;
        try { payload = this.responseType === 'json' ? this.response : JSON.parse(this.responseText); } catch {}
        publishNotesPage(request.method, request.url, body, this.status, this.getResponseHeader('content-type') || '', payload);
      }, { once: true });
      this.addEventListener('error', () => publishNotesPage(request.method, request.url, body, 0, '', null), { once: true });
    }
    return originalXhrSend.call(this, body);
  };
  const originalFetch = window.fetch;
  window.fetch = function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!isNotesListUrl(url)) return originalFetch.apply(this, arguments);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const body = init.body ?? null;
    return originalFetch.apply(this, arguments).then(async response => {
      let payload = null;
      try { payload = await response.clone().json(); } catch {}
      publishNotesPage(method, url, body, response.status, response.headers.get('content-type') || '', payload);
      return response;
    }, error => { publishNotesPage(method, url, body, 0, '', null); throw error; });
  };
  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.source !== 'ztd-notes-pagination-probe') return;
    window.postMessage({ source: 'ztd-notes-pagination-state', requestId: message.requestId, payload: lastNotesPagination }, location.origin);
  });

  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (/^https:\/\/file-paa\.zoom\.us\//.test(this.href)) {
      window.postMessage({ source: 'ztd-notes-export-metadata', url: this.href }, location.origin);
    }
    return nativeAnchorClick.apply(this, args);
  };
})();
