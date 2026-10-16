(() => {
  if (window.__ztdPageHookInstalled) return;
  window.__ztdPageHookInstalled = true;

  const postEvent = (type, payload) => {
    try {
      window.postMessage({
        source: 'zoom-transcript-extension',
        type,
        payload,
      }, '*');
    } catch {}
  };

  let directSaveWorker = false;
  let activeCapture = null;
  let nextCaptureGeneration = 0;
  const sameCapture = capture => !!capture && !!activeCapture && activeCapture.generation === capture.generation && activeCapture.runId === capture.runId && activeCapture.meetingId === capture.meetingId && activeCapture.sourceId === capture.sourceId;
  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source === 'ztd-recording-worker-control') directSaveWorker = event.data.active === true;
    if (event.data?.source === 'ztd-recording-item-capture') {
      const message = event.data;
      if (message.active === true && typeof message.runId === 'string' && typeof message.generation === 'number' && typeof message.meetingId === 'string' && typeof message.sourceId === 'string' && message.sourceId && message.generation > nextCaptureGeneration) {
        nextCaptureGeneration = message.generation;
        activeCapture = { runId: message.runId, generation: message.generation, meetingId: message.meetingId, sourceId: message.sourceId };
        postEvent('capture-ready', { runId: message.runId, generation: message.generation, meetingId: message.meetingId, sourceId: message.sourceId, requestId: message.requestId });
      } else if (message.active === false && activeCapture && message.generation === activeCapture.generation && message.runId === activeCapture.runId) activeCapture = null;
    }
  });
  // Metadata-only bridge for the authenticated Zoom recording list. Never
  // forward the raw API response (or transcript/export payloads) across worlds.
  const RECORDING_LIST_PATH = '/rest/meeting/transcript/user/list';
  const RECORDING_FIELDS = ['meetingId', 'sortKey', 'topic', 'createTime', 'canDownload'];
  window.addEventListener('message', async event => {
    const request = event.data;
    if (event.source !== window || event.origin !== location.origin
      || request?.source !== 'ztd-recording-metadata-request'
      || request.action !== 'scan'
      || typeof request.requestId !== 'string'
      || !/^[a-z0-9-]{8,80}$/i.test(request.requestId)) return;
    const requestId = request.requestId;
    const send = payload => postEvent('recording-metadata-result', { requestId, ...payload });
    try {
      const rows = [];
      const seenPages = new Set();
      const seenRows = new Set();
      let expectedCount = null;
      let pages = 0;
      for (let page = 1; page <= 1000; page++) {
        const url = new URL(RECORDING_LIST_PATH, location.origin);
        url.searchParams.set('page', String(page));
        const response = await fetch(url.href, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Zoom recording list request failed with HTTP ' + response.status);
        const body = await response.json();
        const result = body?.status === true && body?.result;
        const terminalEmpty = result?.data == null && result?.hasNextPage === false;
        if (!result || (!Array.isArray(result.data) && !terminalEmpty) || typeof result.hasNextPage !== 'boolean' || !Number.isInteger(result.page) || result.page !== page)
          throw new Error('Zoom recording page ' + page + ' schema mismatch (status=' + String(body?.status) + ', responsePage=' + String(result?.page) + ', dataArray=' + String(Array.isArray(result?.data)) + ', hasNextPage=' + String(result?.hasNextPage) + ').');
        const pageRows = Array.isArray(result.data) ? result.data : [];
        const signature = pageRows.map(row => String(row?.sortKey || '')).join('|');
        if (pageRows.length && (!signature.replaceAll('|', '') || seenPages.has(signature)))
          throw new Error('Zoom repeated a recording-list page; scan is incomplete.');
        if (pageRows.length) seenPages.add(signature);
        if (pageRows.length && Number.isFinite(result.total) && result.total >= 0) {
          if (expectedCount == null) expectedCount = result.total;
          else if (result.total !== expectedCount) throw new Error('Zoom recording-list total changed during pagination.');
        }
        for (const sourceRow of pageRows) {
          const item = {};
          for (const field of RECORDING_FIELDS) {
            const value = sourceRow?.[field];
            if (field === 'canDownload') { if (typeof value === 'boolean') item[field] = value; }
            else if (typeof value === 'string' || typeof value === 'number') item[field] = String(value);
          }
          if (!item.meetingId || !item.sortKey) throw new Error('Recording row is missing its opaque occurrence identifiers.');
          if (seenRows.has(item.sortKey)) throw new Error('Zoom repeated an opaque recording row ID; scan is incomplete.');
          seenRows.add(item.sortKey);
          rows.push(item);
        }
        pages = page;
        // Zoom may leave hasNextPage true on the final data page, so confirm
        // completion with the next page. An empty page is terminal only when
        // Zoom explicitly reports hasNextPage=false; empty+true/missing is an
        // ambiguous or transient response and must never certify an inventory.
        if (!pageRows.length) {
          if (result.hasNextPage !== false) throw new Error('Zoom returned an empty recording page while still reporting more pages; scan is incomplete.');
          if (expectedCount != null && expectedCount !== rows.length) throw new Error('Zoom recording-list total (' + expectedCount + ') does not match the exhausted inventory (' + rows.length + ').');
          send({ ok: true, rows, pages, expectedCount, terminalPage: page, exhausted: true });
          return;
        }
      }
      throw new Error('Zoom recording list exceeded the safe page limit.');
    } catch (error) {
      send({ ok: false, error: String(error?.message || error) });
    }
  });

  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) {
    if (directSaveWorker && /^(?:blob:https:\/\/(?:[^/]+\.)?zoom\.us\/|https:\/\/(?:[^/]+\.)?zoom\.us\/)/i.test(this.href)) {
      postEvent('native-download-url', { url: this.href });
      return; // captured text is saved once by the extension; no native prompt
    }
    return originalAnchorClick.apply(this, args);
  };

  // Verified from a native Zoom row action: POST XHR to this exact path with both
  // occurrence ID (meetingId) and opaque row ID (sortKey); response is text/plain Blob.
  const RECORDING_DOWNLOAD_PATH = '/rest/meeting/transcript/user/download';
  const isVerifiedTranscriptRequest = (url, request) => {
    try {
      const parsed = new URL(url, location.href);
      if (!/(?:^|\.)zoom\.us$/i.test(parsed.hostname) || parsed.pathname !== RECORDING_DOWNLOAD_PATH) return false;
      if (request?.transport !== 'xhr' || String(request.method).toUpperCase() !== 'POST') return false;
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      return !!request.capture
        && typeof request.capture.meetingId === 'string' && request.capture.meetingId.length > 0
        && typeof request.capture.sourceId === 'string' && request.capture.sourceId.length > 0
        && body?.meetingId === request.capture.meetingId
        && body?.sortKey === request.capture.sourceId;
    } catch { return false; }
  };

  const readBlobAsText = async blob => {
    try {
      if (!blob) return '';
      return await blob.text();
    } catch {
      return '';
    }
  };

  const readArrayBufferAsText = buffer => {
    try {
      if (!buffer) return '';
      return new TextDecoder('utf-8').decode(buffer);
    } catch {
      return '';
    }
  };

  const postPayload = async (response, url, capture, request) => {
    try {
      if (!sameCapture(capture) || !isVerifiedTranscriptRequest(url, request)) return;
      const contentType = response.headers.get('content-type') || '';
      const text = await response.clone().text();
      if (!sameCapture(capture) || !text || text.length < 10) return;
      postEvent('transcript-response', { url, contentType, text, meetingId: capture.meetingId, runId: capture.runId, generation: capture.generation });
    } catch {}
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const captureAtStart = activeCapture && { ...activeCapture };
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    const method = args[1]?.method || request?.method || 'GET';
    const response = await originalFetch(...args);
    if (sameCapture(captureAtStart) && isVerifiedTranscriptRequest(url, { transport: 'fetch', method, capture: captureAtStart, body: args[1]?.body })) postPayload(response, url, captureAtStart, { method });
    return response;
  };

  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let requestUrl = '';
    let requestMethod = '';
    let captureAtStart = null;
    let requestBody = null;
    const open = xhr.open;
    xhr.open = function(method, url, ...rest) {
      requestMethod = String(method || 'GET').toUpperCase();
      requestUrl = url || '';
      requestBody = null;
      captureAtStart = null;
      return open.call(this, method, url, ...rest);
    };
    const send = xhr.send;
    xhr.send = function(...args) { requestBody = args[0] ?? null; captureAtStart = activeCapture && { ...activeCapture }; return send.apply(this, args); };
    xhr.addEventListener('load', () => {
      try {
        const capture = captureAtStart;
        const contentType = xhr.getResponseHeader('content-type') || '';
        if (!sameCapture(capture) || xhr.status !== 200 || xhr.responseType !== 'blob'
          || !/^text\/plain(?:;|$)/i.test(contentType)
          || !isVerifiedTranscriptRequest(requestUrl, { transport: 'xhr', method: requestMethod, body: requestBody, capture })) return;
        Promise.resolve().then(async () => {
          let text = '';
          if (!xhr.responseType || xhr.responseType === 'text' || xhr.responseType === '') text = xhr.responseText || '';
          else if (xhr.responseType === 'blob') text = await readBlobAsText(xhr.response);
          else if (xhr.responseType === 'arraybuffer') text = readArrayBufferAsText(xhr.response);
          if (!sameCapture(capture) || !text || text.length < 10) return;
          postEvent('transcript-response', { url: requestUrl, contentType, text, meetingId: capture.meetingId, sourceId: capture.sourceId, runId: capture.runId, generation: capture.generation });
        });
      } catch {}
    });
    return xhr;
  }
  PatchedXHR.UNSENT = OriginalXHR.UNSENT;
  PatchedXHR.OPENED = OriginalXHR.OPENED;
  PatchedXHR.HEADERS_RECEIVED = OriginalXHR.HEADERS_RECEIVED;
  PatchedXHR.LOADING = OriginalXHR.LOADING;
  PatchedXHR.DONE = OriginalXHR.DONE;
  PatchedXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;
})();
