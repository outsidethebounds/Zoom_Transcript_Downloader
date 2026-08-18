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

  const looksInteresting = (url, contentType = '') => {
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
