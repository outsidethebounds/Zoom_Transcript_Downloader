const MAX_SUPPRESSED_DOWNLOADS = 200;
const TERMINAL_STATES = new Set(['complete', 'interrupted']);

export function shouldSuppressNativeTranscriptDownload(item, mode, workerTabId) {
  if (!['direct-save', 'direct-save-current-page'].includes(mode) || typeof workerTabId !== 'number') return false;
  const url = String(item?.url || '');
  if (url.startsWith('data:text/plain') || url.startsWith('data:application/')) return false;
  if (typeof item?.tabId === 'number' && item.tabId !== workerTabId) return false;
  if (item?.byExtensionId) return false;
  const nativeUrl = String(item?.finalUrl || item?.url || '');
  if (!/^blob:https:\/\/(?:[^/]+\.)?zoom\.us\//i.test(nativeUrl) && !/^https:\/\/(?:[^/]+\.)?zoom\.us\/.*(?:transcript|download)/i.test(nativeUrl)) return false;
  const haystack = [item?.url || '', item?.finalUrl || '', item?.referrer || '', item?.filename || '', item?.mime || ''].join(' ');
  return /zoom|blob:/i.test(haystack) && /transcript|download|plain|text|txt/i.test(haystack);
}

/** Track only native downloads explicitly suppressed during an active extension run. */
export function createDownloadSuppression(chrome, shouldSuppress) {
  const suppressedIds = new Set();

  function ignoreFailure(operation) {
    try { Promise.resolve(operation()).catch(() => {}); } catch {}
  }

  function cleanup(id) {
    if (!suppressedIds.has(id)) return;
    // Both APIs are best-effort: cancelled/incomplete downloads may have no file.
    ignoreFailure(() => chrome.downloads.removeFile(id));
    ignoreFailure(() => chrome.downloads.erase({ id }));
    suppressedIds.delete(id);
  }

  function onCreated(item) {
    if (!shouldSuppress(item)) return;
    suppressedIds.add(item.id);
    while (suppressedIds.size > MAX_SUPPRESSED_DOWNLOADS) {
      suppressedIds.delete(suppressedIds.values().next().value);
    }
    ignoreFailure(() => chrome.downloads.cancel(item.id));
    if (TERMINAL_STATES.has(item.state)) cleanup(item.id);
  }

  function onChanged(delta) {
    if (TERMINAL_STATES.has(delta.state?.current)) cleanup(delta.id);
  }

  chrome.downloads.onCreated.addListener(onCreated);
  chrome.downloads.onChanged.addListener(onChanged);

  return {
    onCreated,
    onChanged,
    get size() { return suppressedIds.size; },
  };
}
