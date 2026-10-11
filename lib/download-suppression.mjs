const MAX_SUPPRESSED_DOWNLOADS = 200;
const TERMINAL_STATES = new Set(['complete', 'interrupted']);

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
