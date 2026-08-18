const BASE_DEFAULTS = {
  filenamePattern: '{date} - {time} - {title}',
  downloadSubfolder: '',
  targetOs: 'macos',
  includeMeetingId: false,
};

const ACTIVE_HOST_RE = /^https:\/\/(?:[^/]+\.)?zoom\.us\/recording\/meeting\/transcript/i;
const observedDownloads = [];
let activeBatchFolderName = null;
let activeBatchMode = 'legacy';
const suppressedDownloadIds = new Set();
const pendingExtensionOwnedFilenames = [];

async function inferDefaultOs() {
  try {
    const info = await chrome.runtime.getPlatformInfo();
    if (info?.os === 'win') return 'windows';
    if (info?.os === 'mac') return 'macos';
  } catch {}
  return 'macos';
}

function basename(filePath = '') {
  const parts = String(filePath).split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function getBatchDownloadPath(originalFilename = '') {
  const cleanName = basename(originalFilename);
  if (!activeBatchFolderName) return cleanName;
  return `${activeBatchFolderName}/${cleanName}`;
}

function looksLikeZoomTranscriptDownload(item) {
  const haystack = [
    item?.url || '',
    item?.finalUrl || '',
    item?.referrer || '',
    item?.filename || '',
  ].join(' ');
  return /zoom/i.test(haystack) && /transcript|download/i.test(haystack);
}

function isExtensionOwnedDownload(item) {
  const url = String(item?.url || '');
  return url.startsWith('data:text/plain') || url.startsWith('data:application/json') || url.startsWith('data:application/');
}

function shouldSuppressNativeZoomDownload(item) {
  if (activeBatchMode !== 'direct-save') return false;
  if (isExtensionOwnedDownload(item)) return false;
  const haystack = [
    item?.url || '',
    item?.finalUrl || '',
    item?.referrer || '',
    item?.filename || '',
    item?.mime || '',
  ].join(' ');
  return /zoom|blob:/i.test(haystack) && /transcript|download|plain|text|txt/i.test(haystack);
}

function recordDownload(item) {
  observedDownloads.push({
    id: item.id,
    filename: item.filename || '',
    basename: basename(item.filename || item.finalUrl || item.url || ''),
    url: item.finalUrl || item.url || '',
    createdAt: Date.now(),
    state: item.state || 'in_progress',
  });
  while (observedDownloads.length > 200) observedDownloads.shift();
}

chrome.downloads.onCreated.addListener(item => {
  recordDownload(item);
  if (shouldSuppressNativeZoomDownload(item)) {
    suppressedDownloadIds.add(item.id);
    chrome.downloads.cancel(item.id).catch(() => {});
  }
});

chrome.downloads.onChanged.addListener(delta => {
  const found = observedDownloads.find(d => d.id === delta.id);
  if (!found) return;
  if (delta.filename?.current) {
    found.filename = delta.filename.current;
    found.basename = basename(delta.filename.current);
  }
  if (delta.state?.current) {
    found.state = delta.state.current;
  }
  if (suppressedDownloadIds.has(delta.id) && (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) {
    chrome.downloads.removeFile(delta.id).catch(() => {});
    chrome.downloads.erase({ id: delta.id }).catch(() => {});
    suppressedDownloadIds.delete(delta.id);
  }
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (isExtensionOwnedDownload(item)) {
    const hintedFilename = pendingExtensionOwnedFilenames.shift();
    if (hintedFilename) {
      suggest({
        filename: hintedFilename,
        conflictAction: 'uniquify',
      });
      return;
    }
  }
  if (!activeBatchFolderName || !looksLikeZoomTranscriptDownload(item)) {
    suggest();
    return;
  }
  suggest({
    filename: getBatchDownloadPath(item.filename || item.finalUrl || item.url || ''),
    conflictAction: 'uniquify',
  });
});

async function waitForObservedDownload({ afterId = 0, timeoutMs = 20000 }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const candidates = observedDownloads
      .filter(d => d.id > afterId && !/zoom-transcript-manifest|rename_zoom_transcripts/i.test(d.basename))
      .sort((a, b) => a.id - b.id);
    const completed = candidates.find(d => d.state === 'complete' && d.basename);
    if (completed) return completed;
    const fallback = candidates.find(d => d.basename);
    if (Date.now() - started > 4000 && fallback) return fallback;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}

async function setActionForTab(tabId, url) {
  const active = typeof url === 'string' && ACTIVE_HOST_RE.test(url);
  await chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId, color: active ? '#2563eb' : '#6b7280' }).catch(() => {});
}

async function refreshAllTabs() {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  await Promise.all((tabs || []).filter(t => typeof t.id === 'number').map(t => setActionForTab(t.id, t.url)));
}

chrome.runtime.onInstalled.addListener(async () => {
  const targetOs = await inferDefaultOs();
  const defaults = { ...BASE_DEFAULTS, targetOs };
  const current = await chrome.storage.local.get(defaults);
  await chrome.storage.local.set({ ...defaults, ...current });
  await refreshAllTabs();
});

refreshAllTabs().catch(() => {});
chrome.runtime.onStartup?.addListener(async () => {
  const targetOs = await inferDefaultOs();
  const current = await chrome.storage.local.get(BASE_DEFAULTS);
  if (!current.targetOs) await chrome.storage.local.set({ targetOs });
  refreshAllTabs().catch(() => {});
});

chrome.action.onClicked.addListener(async tab => {
  if (tab?.id == null) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'zoomTranscriptExtension:openPanel' }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    setActionForTab(tabId, changeInfo.url || tab.url).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) setActionForTab(tabId, tab.url).catch(() => {});
});

function makeDataUrl(content, mime = 'text/plain;charset=utf-8') {
  return `data:${mime};base64,${btoa(unescape(encodeURIComponent(content)))}`;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'zoomTranscriptExtension:getSettings') {
    inferDefaultOs().then(targetOs => chrome.storage.local.get({ ...BASE_DEFAULTS, targetOs }).then(sendResponse));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:setSettings') {
    chrome.storage.local.set(message.settings || {}).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:getLatestDownloadId') {
    const maxId = observedDownloads.length ? Math.max(...observedDownloads.map(d => d.id)) : 0;
    sendResponse({ ok: true, maxId });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:waitForObservedDownload') {
    waitForObservedDownload(message.payload || {})
      .then(download => sendResponse({ ok: !!download, download }))
      .catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:startDownloadBatch') {
    activeBatchFolderName = message.payload?.folderName || null;
    activeBatchMode = message.payload?.mode || 'legacy';
    sendResponse({ ok: true, folderName: activeBatchFolderName, mode: activeBatchMode });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:finishDownloadBatch') {
    activeBatchFolderName = null;
    activeBatchMode = 'legacy';
    suppressedDownloadIds.clear();
    pendingExtensionOwnedFilenames.length = 0;
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:downloadArtifact') {
    const { filename, content, mimeType } = message.payload || {};
    const url = makeDataUrl(content || '', mimeType || 'text/plain;charset=utf-8');
    const downloadFilename = getBatchDownloadPath(filename || '');
    pendingExtensionOwnedFilenames.push(downloadFilename);
    chrome.downloads.download({ url, filename: downloadFilename, saveAs: false, conflictAction: 'uniquify' })
      .then(downloadId => sendResponse({ ok: true, downloadId, filename: downloadFilename }))
      .catch(error => {
        pendingExtensionOwnedFilenames.pop();
        sendResponse({ ok: false, error: String(error), filename: downloadFilename });
      });
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:saveTranscript') {
    const { filename, content, mimeType } = message.payload || {};
    const url = makeDataUrl(content || '', mimeType || 'text/plain;charset=utf-8');
    const downloadFilename = getBatchDownloadPath(filename || '');
    pendingExtensionOwnedFilenames.push(downloadFilename);
    chrome.downloads.download({ url, filename: downloadFilename, saveAs: false, conflictAction: 'uniquify' })
      .then(downloadId => sendResponse({ ok: true, downloadId, filename: downloadFilename }))
      .catch(error => {
        pendingExtensionOwnedFilenames.pop();
        sendResponse({ ok: false, error: String(error), filename: downloadFilename });
      });
    return true;
  }
});
