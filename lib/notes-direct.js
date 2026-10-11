// MAIN-world capability adapter. Uses Zoom's own authenticated, cluster-aware
// export function; never extracts credentials or constructs an API fetch.
(() => {
  const ENDPOINT = '/api/bridge/my_notes/transcript/export';
  const capabilities = new WeakMap();
  function discover(root) {
    if (capabilities.has(root)) return capabilities.get(root);
    const candidates = [];
    for (const key of Object.keys(root)) {
      if (!key.startsWith('webpackChunk') || !Array.isArray(root[key])) continue;
      let runtime;
      root[key].push([['ztd-capability-' + Date.now()], {}, value => { runtime = value; }]);
      if (!runtime?.m) continue;
      for (const [id, factory] of Object.entries(runtime.m)) {
        const body = String(factory);
        // A tiny endpoint-specific API module, not a UI handler that might click
        // an anchor (which would create a second native download).
        if (!body.includes(ENDPOINT) || body.length > 3000 || !body.includes('.post(') || ['createElement', '.click(', 'signedUrl'].some(s => body.includes(s))) continue;
        try {
          for (const fn of Object.values(runtime(id))) {
            const code = typeof fn === 'function' ? String(fn) : '';
            if (code.includes(ENDPOINT) && code.includes('.post(') && !['createElement', '.click('].some(s => code.includes(s))) candidates.push(fn);
          }
        } catch { /* Changed build: use the UI instead. */ }
      }
    }
    const fn = candidates.length === 1 ? candidates[0] : null;
    if (fn) capabilities.set(root, fn);
    return fn;
  }
  function classify(error) {
    const status = Number(error?.response?.status || error?.status || error?.statusCode || 0);
    const headers = error?.response?.headers || error?.headers;
    const retry = headers?.get?.('Retry-After') ?? headers?.['retry-after'] ?? headers?.['Retry-After'];
    return { kind: status === 401 ? 'login' : [403, 404].includes(status) ? 'inaccessible' : status === 429 ? 'rateLimit' : [405, 501].includes(status) ? 'unavailable' : 'failed', status, retryAfter: typeof retry === 'string' || typeof retry === 'number' ? String(retry) : null };
  }
  function retryDelay(value, attempt, now = Date.now()) {
    if (value != null) {
      const seconds = Number(value);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
      if (Number.isFinite(delay)) return Math.max(1000, delay);
    }
    return 1000 * 2 ** attempt;
  }
  async function exportNote(fn, fileId, cancelled, delay) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (cancelled()) return { kind: 'cancelled' };
      try {
        const response = await fn({ fileId });
        if (cancelled()) return { kind: 'cancelled' };
        // Observed app-client schema: the response itself, not Axios data.
        if (!response || typeof response.signedUrl !== 'string' || typeof response.expiresAt !== 'string') return { kind: 'unavailable' };
        const url = new URL(response.signedUrl);
        const expiresAt = Date.parse(response.expiresAt);
        if (url.protocol !== 'https:' || url.hostname !== 'file-paa.zoom.us' || !Number.isFinite(expiresAt)) return { kind: 'unavailable' };
        return { kind: 'ready', url: url.href, expiresAt };
      } catch (error) {
        if (cancelled()) return { kind: 'cancelled' };
        const failure = classify(error);
        if (failure.kind !== 'rateLimit' || attempt === 2) return failure;
        const wait = retryDelay(failure.retryAfter, attempt);
        // Do not violate a long Retry-After by capping and retrying early.
        if (wait > 60000) return failure;
        await delay(wait);
      }
    }
  }
  globalThis.ZTDNotesDirect = { discover, classify, retryDelay, exportNote };
})();
