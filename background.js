import { createDownloadSuppression } from './lib/download-suppression.mjs';
import { createSourcePlan, orderSources } from './lib/source-plan.mjs';
import { sendWhenContentReady } from './lib/content-readiness.mjs';

const BASE_DEFAULTS = {
  filenamePattern: '{date} - {time} - {title}',
  downloadSubfolder: '',
  targetOs: 'macos',
  includeMeetingId: false,
  sources: { recordings: true, myNotes: false },
};

const ACTIVE_HOST_RE = /^https:\/\/(?:[^/]+\.)?zoom\.us\/recording\/meeting\/transcript/i;
const NOTES_LIST_RE = /^https:\/\/(?:[^/]+\.)?zoom\.us\/allNotes(?:[/?#]|$)/i;
const CONTENT_SCRIPT_FILES = [
  'lib/core.js',
  'lib/page.js',
  'lib/runtime.js',
  'lib/sources.js',
  'lib/pacing.js',
  'content.js',
];
const NOTES_CONTENT_FILES = ['lib/sources.js', 'my-notes.js'];
const CONTENT_SCRIPT_CSS_FILES = ['content.css'];
const observedDownloads = [];
let activeBatchFolderName = null;
let activeBatchMode = 'legacy';
let activeBatchTabId = null;
const pendingExtensionOwnedFilenames = [];
const expectedNotesExportsByTab = new Map();
const notesDownloadsById = new Map();
let claimedNotesDownloadId = null;
const expectedRecordingUrls = new Set();
const sourceRunsById = new Map();
const sourceRunByOriginTab = new Map();
const sourceRunByWorkerTab = new Map();
let guidedWorkspaceTabId = null;
const guidedSourceTabIds = new Set();
let persistQueue = Promise.resolve();
function persistRuns() {
  const snapshots = [...sourceRunsById.values()].filter(r => !r.finished).map(r => ({ ...r, plan: r.plan.snapshot() }));
  persistQueue = persistQueue.catch(() => {}).then(() => chrome.storage.session.set({ 'ztd:source-runs': snapshots }));
  return persistQueue;
}
const recoveryReady = chrome.storage.session.get(null).then(stored => {
  for (const id of stored['ztd:guided-source-tabs'] || []) if (Number.isInteger(id)) guidedSourceTabIds.add(id);
  const batch = stored['ztd:recording-batch'];
  if (batch) { activeBatchFolderName = batch.folder; activeBatchMode = batch.mode; activeBatchTabId = batch.tabId; }
  for (const url of stored['ztd:recording-native-urls'] || []) expectedRecordingUrls.add(url);
  for (const saved of stored['ztd:source-runs'] || []) {
    const run = { ...saved, plan: createSourcePlan(saved.plan.selected, saved.plan) };
    sourceRunsById.set(run.runId, run); sourceRunByOriginTab.set(run.originTabId, run);
    if (run.workerTabId) sourceRunByWorkerTab.set(run.workerTabId, run);
  }
});
const downloadSuppression = createDownloadSuppression(chrome, item => shouldSuppressNativeZoomDownload(item));

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
  if (!['direct-save', 'direct-save-current-page'].includes(activeBatchMode) || item.byExtensionId) return false;
  return expectedRecordingUrls.has(item.url) || expectedRecordingUrls.has(item.finalUrl);
}
// Chrome DownloadItem omits tabId. Wait for the originating worker's anchor
// metadata, rather than canceling every Zoom transcript in another user tab.
chrome.downloads.onCreated.addListener(item => {
  if (item.byExtensionId || !['direct-save', 'direct-save-current-page'].includes(activeBatchMode)) return;
  chrome.storage.session.get('ztd:recording-native-urls').then(stored => {
    if ((stored['ztd:recording-native-urls'] || []).includes(item.url)) expectedRecordingUrls.add(item.url);
    if (shouldSuppressNativeZoomDownload(item)) downloadSuppression.onCreated(item);
    else setTimeout(() => { if (shouldSuppressNativeZoomDownload(item)) downloadSuppression.onCreated(item); }, 150);
  }).catch(() => {});
});

function recordDownload(item) {
  observedDownloads.push({
    id: item.id,
    filename: item.filename || '',
    basename: basename(item.filename || item.finalUrl || item.url || ''),
    url: /^https:\/\/file-paa\.zoom\.us\//i.test(item.finalUrl || item.url || '') ? '' : item.finalUrl || item.url || '',
    createdAt: Date.now(),
    state: item.state || 'in_progress',
  });
  while (observedDownloads.length > 200) observedDownloads.shift();
}

chrome.downloads.onCreated.addListener(item => {
  recordDownload(item);
  downloadSuppression.onCreated(item);
});

chrome.downloads.onChanged.addListener(delta => {
  if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
    const notify = notesExport => {
      if (!notesExport) return;
      notesDownloadsById.delete(delta.id);
      chrome.storage.session.remove('ztd:notes-download:' + delta.id).catch(() => {});
      chrome.tabs.sendMessage(notesExport.tabId, {
        type: 'zoomTranscriptExtension:myNotesExportFinished',
        payload: { exportId: notesExport.exportId, ok: delta.state.current === 'complete', error: delta.error?.current || null, filename: notesExport.filename },
      }).catch(() => {});
    };
    const notesExport = notesDownloadsById.get(delta.id);
    if (notesExport) notify(notesExport);
    else chrome.storage.session.get('ztd:notes-download:' + delta.id).then(stored => notify(stored['ztd:notes-download:' + delta.id])).catch(() => {});
  }
  const found = observedDownloads.find(d => d.id === delta.id);
  if (found) {
    if (delta.filename?.current) {
      found.filename = delta.filename.current;
      found.basename = basename(delta.filename.current);
    }
    if (delta.state?.current) found.state = delta.state.current;
  }
  downloadSuppression.onChanged(delta);
});

const directNoteExports = new Map();
const directNoteFilenames = new Map();
async function saveMyNotesDirect(payload, sender) {
  const tabId = sender?.tab?.id;
  const run = sourceRunByWorkerTab.get(tabId);
  if (!run || run.currentSource !== 'myNotes' || run.stopRequested) return { ok: false, cancelled: true };
  const key = tabId + ':' + payload.exportId;
  if (directNoteExports.has(key)) return await directNoteExports.get(key);
  const operation = (async () => {
    let url;
    try { url = new URL(payload.url); } catch { return { ok: false }; }
    if (url.protocol !== 'https:' || url.hostname !== 'file-paa.zoom.us' || !Number.isFinite(payload.expiresAt)) return { ok: false };
    if (payload.expiresAt <= Date.now() + 1000) return { ok: false, expired: true };
    const filename = String(payload.filename || '').replace(/[\/]/g, ' ').trim();
    // The coordinator, not the page, owns the source-folder path.
    const folder = sourceFolderPath(run.rootFolder, 'myNotes');
    if (!filename || payload.folderPath !== folder) return { ok: false };
    if (run.stopRequested) return { ok: false, cancelled: true };
    let id;
    const sourceUrl = url.href;
    directNoteFilenames.set(sourceUrl, folder + '/' + filename);
    try {
      id = await chrome.downloads.download({ url: sourceUrl, filename: folder + '/' + filename, conflictAction: 'uniquify', saveAs: false });
      url = null; // Never persist or log the signed URL.
      const deadline = Date.now() + 35000;
      while (Date.now() < deadline) {
        const [item] = await chrome.downloads.search({ id });
        if (item?.state === 'complete') return item.fileSize === 0 ? { ok: false } : { ok: true, downloadId: id };
        if (item?.state === 'interrupted') return { ok: false, expired: ['SERVER_UNAUTHORIZED', 'SERVER_FORBIDDEN'].includes(item.error) };
        if (run.stopRequested) { await chrome.downloads.cancel(id).catch(() => {}); return { ok: false, cancelled: true }; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await chrome.downloads.cancel(id).catch(() => {});
      return { ok: false };
    } catch { return { ok: false }; }
    finally { directNoteFilenames.delete(sourceUrl); }
  })();
  directNoteExports.set(key, operation);
  const result = await operation;
  // Successful IDs remain deduped until worker completion. Expired interrupted
  // attempts may refresh once; neither failed request ever invokes native UI.
  if (result.expired) directNoteExports.delete(key);
  return result;
}

function noteExportKey(tabId) { return 'ztd:notes-export:' + tabId; }
async function notesUrlHash(url) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function matchesNotesExport(item, expected, urlHashes = []) {
  if (!expected || expected.expiresAt <= Date.now()) return false;
  try { return [item.url, item.finalUrl].filter(Boolean).some(url => new URL(url).hostname === 'file-paa.zoom.us') && ((!!expected.url && (item.url === expected.url || item.finalUrl === expected.url)) || (!!expected.urlHash && urlHashes.includes(expected.urlHash))) && !item.byExtensionId; } catch { return false; }
}
function chooseNotesExport(item, expected, suggest) {
  const filename = expected.folderPath + '/' + expected.filename;
  const { url, ...metadata } = expected;
  const tracked = { ...metadata, filename, tabId: expected.tabId };
  claimedNotesDownloadId = item.id;
  notesDownloadsById.set(item.id, tracked);
  expectedNotesExportsByTab.delete(expected.tabId);
  chrome.storage.session.set({ ['ztd:notes-download:' + item.id]: tracked })
    .then(() => chrome.storage.session.remove(noteExportKey(expected.tabId)))
    .then(() => suggest({ filename, conflictAction: 'uniquify' }))
    .catch(() => suggest({ filename, conflictAction: 'uniquify' }));
}
function chooseFallbackFilename(item, suggest) {
  if (isExtensionOwnedDownload(item)) {
    const hintedFilename = pendingExtensionOwnedFilenames.shift();
    if (hintedFilename) { suggest({ filename: hintedFilename, conflictAction: 'uniquify' }); return; }
  }
  if (item.tabId !== activeBatchTabId || !activeBatchFolderName || !looksLikeZoomTranscriptDownload(item)) { suggest(); return; }
  suggest({ filename: getBatchDownloadPath(item.filename || item.finalUrl || item.url || ''), conflictAction: 'uniquify' });
}
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  (async () => {
    if (item.byExtensionId) {
      const filename = item.byExtensionId === chrome.runtime.id && (directNoteFilenames.get(item.url) || directNoteFilenames.get(item.finalUrl));
      if (filename) suggest({ filename, conflictAction: 'uniquify' });
      else chooseFallbackFilename(item, suggest);
      return;
    }
    const urlHashes = await Promise.all([item.url, item.finalUrl].filter(url => /^https:\/\/file-paa\.zoom\.us\//i.test(url || '')).map(notesUrlHash));
    // Wait briefly for export-response metadata to reach the isolated worker.
    // An exact URL match avoids routing an unrelated manual download.
    for (let attempt = 0; attempt < 15; attempt++) {
      const stored = await chrome.storage.session.get(null);
      const pending = [...expectedNotesExportsByTab.values(), ...Object.entries(stored).filter(([key]) => key.startsWith('ztd:notes-export:')).map(([,value]) => value)].find(e => matchesNotesExport(item, e, urlHashes));
      if (pending && claimedNotesDownloadId !== item.id) { chooseNotesExport(item, pending, suggest); return; }
      if (!Object.keys(stored).some(k => k.startsWith('ztd:notes-export:')) || !/^https:\/\/file-paa\.zoom\.us\//i.test(item.url || '')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    chooseFallbackFilename(item, suggest);
  })().catch(() => chooseFallbackFilename(item, suggest));
  return true;
});

async function setActionForTab(tabId, url) {
  const active = typeof url === 'string' && (ACTIVE_HOST_RE.test(url) || NOTES_LIST_RE.test(url));
  await chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId, color: active ? '#2563eb' : '#6b7280' }).catch(() => {});
}

function isTranscriptPageUrl(url) {
  return typeof url === 'string' && ACTIVE_HOST_RE.test(url);
}
function isNotesListUrl(url) {
  return typeof url === 'string' && NOTES_LIST_RE.test(url);
}

async function pingContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'zoomTranscriptExtension:ping' });
    return !!response?.ok;
  } catch {
    return false;
  }
}

async function ensureExtensionUi(tabId, url) {
  const notesPage = typeof url === 'string' && NOTES_LIST_RE.test(url);
  if (!notesPage && !isTranscriptPageUrl(url)) return false;
  if (notesPage) await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['lib/notes-direct.js', 'my-notes-hook.js'] });
  if (await pingContentScript(tabId)) return true;
  await injectContentScript(tabId, notesPage);
  return await pingContentScript(tabId);
}

async function injectContentScript(tabId, notesPage) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_SCRIPT_CSS_FILES }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, files: notesPage ? NOTES_CONTENT_FILES : CONTENT_SCRIPT_FILES });
}

async function sendToReadyContentScript(tabId, url, message) {
  const notesPage = isNotesListUrl(url);
  return sendWhenContentReady({
    ping: () => pingContentScript(tabId),
    inject: async () => {
      // Stale tabs after an extension reload may lack the isolated listener.
      // These manifest-listed scripts have guards and are safe to reinject.
      if (notesPage) await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['lib/notes-direct.js', 'my-notes-hook.js'] });
      await injectContentScript(tabId, notesPage);
    },
    send: () => chrome.tabs.sendMessage(tabId, message),
    pause: ms => new Promise(resolve => setTimeout(resolve, ms)),
  });
}

function sanitizeSubfolder(path = '') {
  return String(path).split(/[\\/]+/).map(part => part.trim()).filter(part => part && part !== '.' && part !== '..').map(part => part.replace(/[<>:"\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[ .]+$/g, '')).filter(Boolean).join('/');
}
function datedBatchFolder(subfolder = '') {
  const d = new Date();
  const name = 'ZoomTranscripts-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + d.getFullYear();
  const prefix = sanitizeSubfolder(subfolder);
  return prefix ? prefix + '/' + name : name;
}
function sourceFolderPath(root, source) {
  return root + '/' + (source === 'recordings' ? 'Recordings' : 'My Notes');
}
function sanitizeSourceWorkerProgress(progress) {
  return Object.fromEntries(['saved', 'skipped', 'failed', 'processed', 'discovered', 'eligible', 'pending', 'directSaved', 'fallbackSaved'].map(key => [key, progress[key] == null ? null : Math.max(0, Number(progress[key]) || 0)]));
}
function sourceRunNotice(run, type, payload = {}) {
  if (typeof run.originTabId !== 'number') return;
  chrome.tabs.sendMessage(run.originTabId, { type: 'zoomTranscriptExtension:' + type, payload: { runId: run.runId, guided: run.guided === true, ...payload } }).catch(() => {});
}
async function closeOwnedWorkerIfStillOnSource(run, tabId) {
  if (typeof tabId !== 'number' || run.workerTabOwned !== true) return false;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const stillOnSource = tab && (run.currentSource === 'recordings' ? isTranscriptPageUrl(tab.url) : isNotesListUrl(tab.url));
  if (!stillOnSource) return false;
  await chrome.tabs.remove(tabId).catch(() => {});
  return true;
}
async function finishSourceRun(run, extra = {}) {
  if (run.finished) return;
  run.finished = true;
  if (run.guided) {
    const rawResults = { ...(run.results || {}) };
    if (extra.interrupted && run.currentSource && !rawResults[run.currentSource]) { const progress = run.currentSource === 'myNotes' ? run.notesProgress : run.recordingsProgress; if (progress) rawResults[run.currentSource] = progress; }
    const results = Object.fromEntries(Object.entries(rawResults).map(([source, result]) => [source, {
      saved: Math.max(0, Number(result?.saved) || 0), skipped: Math.max(0, Number(result?.skipped) || 0),
      failed: Math.max(0, Number(result?.failed) || 0), pending: Math.max(0, Number(result?.pending) || 0), error: Boolean(result?.error),
    }]));
    await chrome.storage.session.set({ 'ztd:last-guided-terminal': { runId: run.runId, results, interrupted: extra.interrupted === true, stopped: extra.stopped === true, needsUserAction: Boolean(extra.needsUserAction), completedAt: Date.now() } }).catch(() => {});
  }
  if (run.workerTabId) sourceRunByWorkerTab.delete(run.workerTabId);
  if (run.workerTabId && !extra.keepWorker) await closeOwnedWorkerIfStillOnSource(run, run.workerTabId);
  sourceRunByOriginTab.delete(run.originTabId);
  sourceRunsById.delete(run.runId);
  await persistRuns();
  sourceRunNotice(run, extra.needsUserAction ? 'sourceRunPaused' : 'sourceRunFinished', { results: run.results, folderName: run.rootFolder, ...extra });
}
async function startNextSource(run) {
  if (run.finished) return;
  if (run.plan.stopped || run.stopRequested) { await finishSourceRun(run, { stopped: true }); return; }
  const source = run.plan.next();
  if (!source) { await finishSourceRun(run); return; }
  run.currentSource = source;
  run.workerStarted = false;
  await persistRuns();
  const targetUrl = source === 'recordings' ? run.recordingUrl : run.notesUrl;
  if (!targetUrl) {
    await finishSourceRun(run, { needsUserAction: { url: run.originUrl, reason: source === 'recordings' ? 'Open the Zoom recording-transcripts list in this signed-in profile once, then start the selected-sources batch again.' : 'Open My Notes > All notes in this signed-in profile and retry.' } });
    return;
  }
  sourceRunNotice(run, 'sourceRunProgress', { source, state: 'starting', message: 'Opening the ' + (source === 'recordings' ? 'recordings' : 'My Notes') + ' worker tab.' });
  try {
    const origin = source === 'recordings' ? await chrome.tabs.get(run.originTabId).catch(() => null) : null;
    const tabs = run.guided ? await chrome.tabs.query({}) : [];
    const reusableSource = source === 'recordings' ? origin : tabs.find(candidate => isNotesListUrl(candidate.url) && candidate.status === 'complete');
    // Reuse an already-loaded transcript list for guided work and the legacy
    // all-recordings action. Keep the page-scoped legacy action isolated so its
    // captured page scope is never replaced by a list worker.
    const reusable = reusableSource && reusableSource.status === 'complete' && (
      source === 'recordings'
        ? reusableSource.id === run.originTabId && isTranscriptPageUrl(reusableSource.url) && (run.guided || run.mode !== 'page')
        : run.guided && isNotesListUrl(reusableSource.url)
    );
    const tab = reusable ? reusableSource : await chrome.tabs.create({ url: targetUrl, active: false, openerTabId: run.originTabId });
    run.workerTabOwned = !reusable;
    run.workerTabId = tab.id;
    sourceRunByWorkerTab.set(tab.id, run);
    await persistRuns();
    const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);
    if (currentTab.status === 'complete') await startSourceWorkerInTab(run, tab.id, currentTab.url || tab.url || targetUrl);
  } catch (error) {
    run.plan.complete(source, { saved: 0, skipped: 0, failed: 1, error: String(error) });
    run.results = run.plan.results;
    await startNextSource(run);
  }
}
async function startSourceWorkerInTab(run, tabId, url) {
  if (run.finished || run.workerTabId !== tabId || run.workerStarted) return;
  run.workerStarted = true;
  await persistRuns();
  try {
    if (/\/(?:login|signin|sign-in|sso)(?:[/?#]|$)/i.test(url)) {
      await handleSourceWorkerResult(tabId, { runId: run.runId, source: run.currentSource, saved: 0, skipped: 0, failed: 0, needsUserAction: { url: String(url).split(/[?#]/)[0], reason: 'Zoom sign-in is required in the dedicated worker tab.' } });
      return;
    }
    if ((run.currentSource === 'recordings' && !isTranscriptPageUrl(url)) || (run.currentSource === 'myNotes' && !isNotesListUrl(url))) {
      await handleSourceWorkerResult(tabId, { runId: run.runId, source: run.currentSource, saved: 0, skipped: 0, failed: 0, needsUserAction: { url: String(url).split(/[?#]/)[0], reason: 'Open the signed-in Zoom source list in this worker tab, then retry.' } }); return;
    }
    // Suppress the legacy panel in guided or extension-owned worker tabs before
    // reinjection/messages; a reused legacy origin keeps its manual panel visible.
    const suppressLegacyPanel = run.guided || run.workerTabOwned === true;
    await chrome.tabs.sendMessage(tabId, { type: 'zoomTranscriptExtension:setGuidedWorkspace', payload: { active: suppressLegacyPanel } }).catch(() => {});
    await ensureExtensionUi(tabId, url);
    await chrome.tabs.sendMessage(tabId, { type: 'zoomTranscriptExtension:setGuidedWorkspace', payload: { active: suppressLegacyPanel } }).catch(() => {});
    const source = run.currentSource;
    const folderName = sourceFolderPath(run.rootFolder, source);
    const message = source === 'recordings'
      ? { type: 'zoomTranscriptExtension:workerStartRecordings', payload: { runId: run.runId, mode: run.mode, folderName, settings: run.settings, testLimit: run.testLimit, scope: run.scope, total: run.totals?.recordings } }
      : { type: 'zoomTranscriptExtension:workerStartMyNotes', payload: { runId: run.runId, mode: run.mode, folderName, folderPath: folderName, settings: run.settings, testLimit: run.testLimit, scope: run.scope, total: run.totals?.myNotes } };
    await sendToReadyContentScript(tabId, url, message);
  } catch (error) {
    run.plan.complete(run.currentSource, { saved: 0, skipped: 0, failed: 1, error: 'Could not start the source worker: ' + String(error) });
    run.results = run.plan.results;
    sourceRunByWorkerTab.delete(tabId);
    await closeOwnedWorkerIfStillOnSource(run, tabId);
    run.workerTabId = null;
    await startNextSource(run);
  }
}
async function beginSourceRun(payload, sender, sendResponse) {
  await recoveryReady;
  const originTabId = sender?.tab?.id;
  if (typeof originTabId !== 'number') { sendResponse({ ok: false, error: 'The source run must start from a Zoom tab.' }); return; }
  const selected = orderSources(payload?.selected);
  if (!selected.length) { sendResponse({ ok: false, error: 'Select at least one transcript source.' }); return; }
  if (sourceRunsById.size) { sendResponse({ ok: false, error: 'A source batch is already running in this tab.' }); return; }
  const originUrl = String(payload.originUrl || sender.tab.url || '').split('#')[0];
  let recordingUrl = isTranscriptPageUrl(originUrl) ? originUrl : '';
  let notesUrl = isNotesListUrl(originUrl) ? originUrl : '';
  const stored = await chrome.storage.local.get({ recordingListUrl: '', notesListUrl: '' });
  recordingUrl ||= isTranscriptPageUrl(stored.recordingListUrl) ? stored.recordingListUrl : '';
  if (!recordingUrl) { const tabs = await chrome.tabs.query({}); recordingUrl = tabs.find(t => isTranscriptPageUrl(t.url))?.url || 'https://app.zoom.us/recording/meeting/transcript'; }
  notesUrl ||= isNotesListUrl(stored.notesListUrl) ? stored.notesListUrl : 'https://us01mynotes.zoom.us/allNotes';
  if (payload.currentSource === 'myNotes' && isNotesListUrl(originUrl)) notesUrl = originUrl;
  if (payload.currentSource === 'recordings' && isTranscriptPageUrl(originUrl)) recordingUrl = originUrl;
  const runId = 'sources-' + Date.now() + '-' + originTabId;
  const run = { runId, originTabId, originUrl, rootFolder: datedBatchFolder(payload.settings?.downloadSubfolder), settings: payload.settings || {}, totals: payload.totals || {}, mode: payload.mode === 'page' ? 'page' : 'all', plan: createSourcePlan(selected), results: {}, scope: payload.scope || null, testLimit: Number.isInteger(payload.testLimit) ? Math.max(1, Math.min(payload.testLimit, 3)) : null, stopRequested: false, finished: false, workerTabId: null, workerStarted: false, guided: payload.guidedWorkspace === true, recordingUrl, notesUrl };
  sourceRunsById.set(runId, run);
  sourceRunByOriginTab.set(originTabId, run);
  await persistRuns();
  sendResponse({ ok: true, runId, folderName: run.rootFolder });
  await startNextSource(run);
}
async function stopSourceRun(originTabId) {
  await recoveryReady;
  const run = sourceRunByOriginTab.get(originTabId);
  if (!run) return;
  run.stopRequested = true;
  run.plan.stop();
  await persistRuns();
  sourceRunNotice(run, 'sourceRunProgress', { source: run.currentSource, state: 'stopping', message: 'Stop requested. Waiting for the current safe operation.', progress: run.currentSource === 'myNotes' ? run.notesProgress || null : run.recordingsProgress || null });
  if (run.workerTabId) chrome.tabs.sendMessage(run.workerTabId, { type: 'zoomTranscriptExtension:stopSourceWorker' }).catch(() => {});
  else await finishSourceRun(run, { stopped: true });
}
function normalizeSourceWorkerResult(run, source, result = {}) {
  const normalized = { ...result };
  const total = Number(run?.totals?.[source]);
  if (Number.isFinite(total)) {
    const accounted = Math.max(0, Number(normalized.saved) || 0) + Math.max(0, Number(normalized.skipped) || 0) + Math.max(0, Number(normalized.failed) || 0);
    const minimumPending = Math.max(0, total - accounted);
    if (!Number.isFinite(normalized.pending) || normalized.pending < minimumPending) normalized.pending = minimumPending;
  }
  return normalized;
}
async function handleSourceWorkerResult(tabId, result) {
  await recoveryReady;
  const run = sourceRunByWorkerTab.get(tabId);
  if (!run || run.finished || result?.runId !== run.runId || result?.source !== run.currentSource) return;
  result = normalizeSourceWorkerResult(run, run.currentSource, result || {});
  run.plan.complete(run.currentSource, result);
  run.results = run.plan.results;
  sourceRunNotice(run, 'sourceRunProgress', { source: run.currentSource, result: run.results[run.currentSource], state: 'complete' });
  const userAction = result?.needsUserAction;
  if (userAction) {
    await finishSourceRun(run, { needsUserAction: userAction, keepWorker: true, workerTabId: tabId });
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    return;
  }
  sourceRunByWorkerTab.delete(tabId);
  await closeOwnedWorkerIfStillOnSource(run, tabId);
  run.workerTabId = null;
  run.workerStarted = false;
  await startNextSource(run);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const workspaceUrl = chrome.runtime.getURL?.('workspace.html');
  if (workspaceUrl && String(tab.url || changeInfo.url || '').split(/[?#]/)[0] === workspaceUrl) guidedWorkspaceTabId = tabId;
  if (changeInfo.status === 'complete' || changeInfo.url) {
    const url = String(tab.url || changeInfo.url || '').split(/[?#]/)[0];
    if (isTranscriptPageUrl(url)) chrome.storage.local.set({ recordingListUrl: url }).catch(() => {});
    if (isNotesListUrl(url)) chrome.storage.local.set({ notesListUrl: url }).catch(() => {});
    recoveryReady.then(async () => {
      const run = sourceRunByWorkerTab.get(tabId);
      if (!run) return;
      if (run.currentSource === 'myNotes' && run.workerStarted && /\/(?:login|signin|sign-in|sso)(?:[/?#]|$)/i.test(url)) {
        if (run.pausingForLogin) return;
        run.pausingForLogin = true;
        run.stopRequested = true;
        await handleSourceWorkerResult(tabId, { saved: 0, skipped: 0, failed: 0, ...run.notesProgress, runId: run.runId, source: 'myNotes', needsUserAction: { url, reason: 'Zoom sign-in is required in this My Notes worker tab. Sign in there, then retry My Notes only; existing downloads are preserved.' } });
      } else if (changeInfo.status === 'complete') await startSourceWorkerInTab(run, tabId, url);
    }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === guidedWorkspaceTabId) {
    // Source tabs remain part of the guided workflow after its workspace closes.
    // Do not restore legacy panels: that caused a flash/reappearance during worker cleanup.
    guidedWorkspaceTabId = null;
  }
  guidedSourceTabIds.delete(tabId);
  chrome.storage.session.set({ 'ztd:guided-source-tabs': [...guidedSourceTabIds] }).catch(() => {});
  for (const key of directNoteExports.keys()) if (key.startsWith(tabId + ':')) directNoteExports.delete(key);
  recoveryReady.then(async () => {
  const workerRun = sourceRunByWorkerTab.get(tabId);
  if (workerRun && !workerRun.finished) { sourceRunByWorkerTab.delete(tabId); workerRun.workerTabId = null; await finishSourceRun(workerRun, { stopped: true, error: 'Worker tab closed.' }); }
  const originRun = sourceRunByOriginTab.get(tabId);
  if (originRun) await stopSourceRun(tabId);
}); });

async function refreshAllTabs() {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  await Promise.all((tabs || []).filter(t => typeof t.id === 'number').map(t => setActionForTab(t.id, t.url)));
}

chrome.runtime.onInstalled.addListener(async details => {
  const targetOs = await inferDefaultOs();
  const defaults = { ...BASE_DEFAULTS, targetOs };
  const current = await chrome.storage.local.get(defaults);
  await chrome.storage.local.set({ ...defaults, ...current });
  await refreshAllTabs();
  const installed = await chrome.storage.local.get('ztd:workspace-opened');
  if (details?.reason === 'install' && !installed['ztd:workspace-opened']) {
    await chrome.storage.local.set({ 'ztd:workspace-opened': true });
    await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html'), active: true }).catch(() => {});
  }
});

refreshAllTabs().catch(() => {});
chrome.runtime.onStartup?.addListener(async () => {
  const targetOs = await inferDefaultOs();
  const current = await chrome.storage.local.get(BASE_DEFAULTS);
  if (!current.targetOs) await chrome.storage.local.set({ targetOs });
  refreshAllTabs().catch(() => {});
});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('workspace.html');
  const existing = await chrome.tabs.query({ url: url + '*' });
  if (existing[0]?.id != null) await chrome.tabs.update(existing[0].id, { active: true });
  else await chrome.tabs.create({ url, active: true });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    setActionForTab(tabId, changeInfo.url || tab.url).catch(() => {});
    if ((changeInfo.status === 'complete' || changeInfo.url) && isTranscriptPageUrl(changeInfo.url || tab.url)) {
      ensureExtensionUi(tabId, changeInfo.url || tab.url).catch(() => {});
    }
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
  if (message?.type === 'zoomTranscriptExtension:guidedWorkspaceOpened') { guidedWorkspaceTabId = _sender?.tab?.id ?? null; sendResponse({ ok: true }); return false; }
  if (message?.type === 'zoomTranscriptExtension:getGuidedRunState') {
    recoveryReady.then(async () => {
      const run = [...sourceRunsById.values()].find(item => item.guided && !item.finished);
      if (!run) { const stored = await chrome.storage.session.get('ztd:last-guided-terminal'); sendResponse({ active: null, terminal: stored['ztd:last-guided-terminal'] || null }); return; }
      if (!Number.isInteger(run.workerTabId)) { sendResponse({ active: { runId: run.runId, source: run.currentSource, starting: true }, terminal: null }); return; }
      const tab = await chrome.tabs.get(run.workerTabId).catch(() => null);
      if (!tab) { await finishSourceRun(run, { interrupted: true }); const stored = await chrome.storage.session.get('ztd:last-guided-terminal'); sendResponse({ active: null, terminal: stored['ztd:last-guided-terminal'] || null }); return; }
      if (tab.status !== 'complete') { sendResponse({ active: { runId: run.runId, source: run.currentSource, unverified: true }, terminal: null }); return; }
      const worker = await chrome.tabs.sendMessage(run.workerTabId, { type: 'zoomTranscriptExtension:getSourceWorkerState' }).catch(() => null);
      if (worker?.runId === run.runId && worker.active === true) { sendResponse({ active: { runId: run.runId, source: run.currentSource, active: true, progress: (run.currentSource === 'myNotes' ? run.notesProgress : run.recordingsProgress) || null }, terminal: null }); return; }
      if (!worker) { sendResponse({ active: { runId: run.runId, source: run.currentSource, unverified: true }, terminal: null }); return; }
      await finishSourceRun(run, { interrupted: true }); const stored = await chrome.storage.session.get('ztd:last-guided-terminal'); sendResponse({ active: null, terminal: stored['ztd:last-guided-terminal'] || null });
    }).catch(() => sendResponse({ active: null, terminal: null, unavailable: true }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:ackGuidedTerminal') {
    chrome.storage.session.get('ztd:last-guided-terminal').then(async stored => { const terminal = stored['ztd:last-guided-terminal']; if (terminal?.runId === message.payload?.runId) await chrome.storage.session.remove('ztd:last-guided-terminal'); sendResponse({ ok: terminal?.runId === message.payload?.runId }); }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:guidedSourceTab') {
    recoveryReady.then(async () => { const id = message.payload?.tabId; if (Number.isInteger(id)) { guidedSourceTabIds.add(id); await chrome.storage.session.set({ 'ztd:guided-source-tabs': [...guidedSourceTabIds] }); } sendResponse({ ok: Number.isInteger(id) }); }).catch(() => sendResponse({ ok: false })); return true;
  }
  if (message?.type === 'zoomTranscriptExtension:getGuidedTabState') {
    recoveryReady.then(async () => {
      const tab = _sender?.tab;
      const cached = guidedWorkspaceTabId != null || guidedSourceTabIds.has(tab?.id) || sourceRunByWorkerTab.has(tab?.id);
      if (cached) { sendResponse({ guided: true }); return; }
      // Runtime/session flags disappear when Chrome reloads the extension. While
      // its guided workspace is open, recognize source pages from live tabs; do
      // not persist a stale per-tab false/true marker.
      const workspaceUrl = chrome.runtime.getURL('workspace.html');
      const tabs = await chrome.tabs.query({});
      const workspaceOpen = tabs.some(item => String(item.url || '').split(/[?#]/)[0] === workspaceUrl);
      sendResponse({ guided: workspaceOpen && (isTranscriptPageUrl(tab?.url) || isNotesListUrl(tab?.url)) });
    }).catch(() => sendResponse({ guided: false })); return true;
  }
  if (message?.type === 'zoomTranscriptExtension:startSourceRun') {
    beginSourceRun(message.payload || {}, _sender, sendResponse).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:stopSourceRun') {
    stopSourceRun(_sender?.tab?.id).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:sourceWorkerProgress') {
    recoveryReady.then(async () => {
      const run = sourceRunByWorkerTab.get(_sender?.tab?.id);
      if (run && message.payload?.runId === run.runId) {
        if (message.payload?.progress) {
          const progress = message.payload.progress;
          const sanitized = sanitizeSourceWorkerProgress(progress);
          if (run.currentSource === 'myNotes') run.notesProgress = sanitized; else if (run.currentSource === 'recordings') run.recordingsProgress = sanitized;
          await persistRuns();
        }
        sourceRunNotice(run, 'sourceRunProgress', { source: run.currentSource, state: 'running', message: message.payload?.message || 'Working', progress: run.currentSource === 'myNotes' ? run.notesProgress || null : run.recordingsProgress || null });
      }
      sendResponse({ ok: !!run });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:sourceWorkerCompleted') {
    handleSourceWorkerResult(_sender?.tab?.id, message.payload || {}).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:getSettings') {
    inferDefaultOs().then(targetOs => chrome.storage.local.get({ ...BASE_DEFAULTS, targetOs }).then(sendResponse));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:setSettings') {
    chrome.storage.local.set(message.settings || {}).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:saveMyNotesDirect') {
    saveMyNotesDirect(message.payload || {}, _sender).then(sendResponse).catch(() => sendResponse({ ok: false })); return true;
  }
  if (message?.type === 'zoomTranscriptExtension:correlateMyNotesExport') {
    const tabId = _sender?.tab?.id;
    chrome.storage.session.get(noteExportKey(tabId)).then(async stored => {
      const expected = expectedNotesExportsByTab.get(tabId) || stored[noteExportKey(tabId)];
      const url = String(message.payload?.url || '');
      if (expected?.exportId !== message.payload?.exportId || !/^https:\/\/file-paa\.zoom\.us\//i.test(url)) { sendResponse({ ok: false }); return; }
      expected.url = url; expected.urlHash = await notesUrlHash(url); expectedNotesExportsByTab.set(tabId, expected);
      const { url: signedUrl, ...metadata } = expected;
      await chrome.storage.session.set({ [noteExportKey(tabId)]: metadata });
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false })); return true;
  }
  if (message?.type === 'zoomTranscriptExtension:clearMyNotesExport') {
    const tabId = _sender?.tab?.id;
    expectedNotesExportsByTab.delete(tabId);
    chrome.storage.session.remove(noteExportKey(tabId)).then(() => sendResponse({ ok: true })); return true;
  }
  if (message?.type === 'zoomTranscriptExtension:expectMyNotesExport') {
    const tabId = _sender?.tab?.id;
    if (typeof tabId !== 'number' || !sourceRunByWorkerTab.has(tabId) || !message.payload?.filename || !message.payload?.folderPath) {
      sendResponse({ ok: false, error: 'My Notes export requires a worker tab and final path.' });
      return false;
    }
    const expected = {
      exportId: String(message.payload.exportId || Date.now()),
      filename: String(message.payload.filename).replace(/[\\/]/g, ' ').trim(),
      folderPath: String(message.payload.folderPath).split(/[\\/]+/).filter(part => part && part !== '.' && part !== '..').join('/'),
      expiresAt: Date.now() + 45000,
      tabId,
      origin: new URL(_sender.tab.url).origin,
    };
    expectedNotesExportsByTab.set(tabId, expected);
    chrome.storage.session.set({ [noteExportKey(tabId)]: expected }).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:expectRecordingNative') {
    const url = String(message.payload?.url || '');
    if (_sender?.tab?.id !== activeBatchTabId || !/^(?:blob:|https:)/.test(url)) { sendResponse({ ok: false }); return false; }
    expectedRecordingUrls.add(url);
    chrome.storage.session.set({ 'ztd:recording-native-urls': [...expectedRecordingUrls] }).then(() => sendResponse({ ok: true })); return true;
  }
  if (message?.type === 'zoomTranscriptExtension:startDownloadBatch') {
    expectedRecordingUrls.clear();
    chrome.storage.session.remove('ztd:recording-native-urls').catch(() => {});
    activeBatchFolderName = message.payload?.folderName || null;
    activeBatchMode = message.payload?.mode || 'legacy';
    activeBatchTabId = _sender?.tab?.id ?? null;
    chrome.storage.session.set({ 'ztd:recording-batch': { folder: activeBatchFolderName, mode: activeBatchMode, tabId: activeBatchTabId } }).then(() => sendResponse({ ok: true, folderName: activeBatchFolderName, mode: activeBatchMode }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:finishDownloadBatch') {
    expectedRecordingUrls.clear();
    chrome.storage.session.remove('ztd:recording-native-urls').catch(() => {});
    activeBatchFolderName = null;
    activeBatchMode = 'legacy';
    activeBatchTabId = null;
    chrome.storage.session.remove('ztd:recording-batch').catch(() => {});
    pendingExtensionOwnedFilenames.length = 0;
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:saveTranscript') {
    const { filename, content, mimeType } = message.payload || {};
    const url = makeDataUrl(content || '', mimeType || 'text/plain;charset=utf-8');
    const downloadFilename = getBatchDownloadPath(filename || '');
    pendingExtensionOwnedFilenames.push(downloadFilename);
    chrome.downloads.download({ url, filename: downloadFilename, saveAs: false, conflictAction: 'uniquify' })
      .then(async downloadId => {
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          const [item] = await chrome.downloads.search({ id: downloadId });
          if (item?.state === 'complete') { sendResponse({ ok: true, downloadId, filename: downloadFilename }); return; }
          if (item?.state === 'interrupted') throw new Error('Transcript download interrupted.');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Transcript download did not complete within 30 seconds.');
      })
      .catch(error => {
        pendingExtensionOwnedFilenames.pop();
        sendResponse({ ok: false, error: String(error), filename: downloadFilename });
      });
    return true;
  }
});
