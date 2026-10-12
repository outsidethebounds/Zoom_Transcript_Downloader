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
  window.addEventListener('message', event => {
    if (event.source === window && event.data?.source === 'ztd-recording-worker-control') directSaveWorker = event.data.active === true;
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

  const looksInteresting = (url, contentType = '') => {
    try { if (new URL(url, location.href).pathname === RECORDING_LIST_PATH) return false; } catch {}
    const haystack = `${url || ''} ${contentType || ''}`.toLowerCase();
    return /transcript|download|caption|recording|meeting|plain|text|json|vtt|txt/.test(haystack);
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

  const postPayload = async (response, url) => {
    try {
      const clone = response.clone();
      const text = await clone.text();
      if (!text || text.length < 10) return;
      const contentType = response.headers.get('content-type') || '';
      postEvent('hook-debug', {
        stage: 'fetch-text-captured',
        url,
        contentType,
        textLength: text.length,
      });
      postEvent('transcript-response', {
        url,
        contentType,
        text,
      });
    } catch {}
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const contentType = response.headers.get('content-type') || '';
      if (looksInteresting(url, contentType)) {
        postEvent('hook-debug', {
          stage: 'fetch-response-observed',
          url,
          status: response.status,
          contentType,
        });
        postPayload(response, url);
      }
    } catch {}
    return response;
  };

  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let requestUrl = '';
    const open = xhr.open;
    xhr.open = function(method, url, ...rest) {
      requestUrl = url || '';
      return open.call(this, method, url, ...rest);
    };
    xhr.addEventListener('load', () => {
      try {
        const contentType = xhr.getResponseHeader('content-type') || '';
        if (!looksInteresting(requestUrl, contentType)) return;
        postEvent('hook-debug', {
          stage: 'xhr-response-observed',
          url: requestUrl,
          status: xhr.status,
          contentType,
          responseType: xhr.responseType || 'text',
        });
        Promise.resolve().then(async () => {
          let text = '';
          if (!xhr.responseType || xhr.responseType === 'text' || xhr.responseType === '') {
            text = xhr.responseText || '';
          } else if (xhr.responseType === 'blob') {
            text = await readBlobAsText(xhr.response);
          } else if (xhr.responseType === 'arraybuffer') {
            text = readArrayBufferAsText(xhr.response);
          }
          if (!text || text.length < 10) {
            postEvent('hook-debug', {
              stage: 'xhr-text-missing',
              url: requestUrl,
              contentType,
              responseType: xhr.responseType || 'text',
            });
            return;
          }
          postEvent('hook-debug', {
            stage: 'xhr-text-captured',
            url: requestUrl,
            contentType,
            responseType: xhr.responseType || 'text',
            textLength: text.length,
          });
          postEvent('transcript-response', {
            url: requestUrl,
            contentType,
            text,
          });
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
