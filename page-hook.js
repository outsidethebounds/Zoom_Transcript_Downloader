(() => {
  if (window.__ztdPageHookInstalled) return;
  window.__ztdPageHookInstalled = true;

  const postPayload = async (response, url) => {
    try {
      const clone = response.clone();
      const text = await clone.text();
      if (!text || text.length < 10) return;
      window.postMessage({
        source: 'zoom-transcript-extension',
        type: 'transcript-response',
        payload: {
          url,
          contentType: response.headers.get('content-type') || '',
          text,
        },
      }, '*');
    } catch {}
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (/transcript|download/i.test(url)) {
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
        if (!/transcript|download/i.test(requestUrl)) return;
        const text = xhr.responseText;
        if (!text || text.length < 10) return;
        window.postMessage({
          source: 'zoom-transcript-extension',
          type: 'transcript-response',
          payload: {
            url: requestUrl,
            contentType: xhr.getResponseHeader('content-type') || '',
            text,
          },
        }, '*');
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
