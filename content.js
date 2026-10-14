(() => {
if (globalThis.__ztdRecordingsLoaded) return;
globalThis.__ztdRecordingsLoaded = true;
const EXTENSION_NS = 'zoomTranscriptExtension';
const PANEL_ID = 'ztd-panel';
const LAUNCHER_ID = 'ztd-launcher';
const SETTINGS_MODAL_ID = 'ztd-settings-modal';
const PATTERN_HELP_MODAL_ID = 'ztd-pattern-help-modal';
const ABOUT_MODAL_ID = 'ztd-about-modal';
const ROW_SELECTOR = 'tr.zoom-virtual-table__row';
const DOWNLOAD_BUTTON_SELECTOR = 'button[aria-label^="Download "]';
// Intentional inter-item pacing; readiness, response, and Retry-After waits remain separate.
const SAVE_ALL_DELAY_MS = globalThis.ZTDPacing?.INTER_ITEM_DELAY_MS || 1500;
async function waitForNextRecordingStart(previousStartMs) {
  if (previousStartMs === null) return Date.now();
  if (globalThis.ZTDPacing) return await globalThis.ZTDPacing.waitForNextStart(previousStartMs, Date.now, sleep);
  const remaining = Math.max(0, SAVE_ALL_DELAY_MS - Math.max(0, Date.now() - previousStartMs));
  if (remaining > 0) await sleep(remaining);
  return Date.now();
}
const TRANSITION_TIMEOUT_MS = 30000;

const {
  parseRowText,
  normalizeMeta,
  buildTargetBase,
  applyCollisionSafeFilenames,
} = globalThis.ZTDCore || {};

const {
  buildDownloadFolderPath,
  sanitizeRelativeFolder,
  scanRows: scanTranscriptRows,
  rowSignature: buildRowSignature,
  transcriptCountText: readTranscriptCount,
  getPaginationState: readPaginationState,
  waitForRowsChange: waitForPageRowsChange,
  gotoFirstPage: navigateToFirstPage,
  gotoNextPage: navigateToNextPage,
} = globalThis.ZTDPage || {};

const runtime = globalThis.ZTDRuntime?.createClient(EXTENSION_NS);
const sourceApi = globalThis.ZTDSources;

let lastRows = [];
let logLines = [];
let currentSettings = null;
let saveAllController = { running: false, stopRequested: false };
let downloadManifest = [];
let rescanTimer = null;
let currentRunId = null;
let stickyPanelMessage = null;
let currentDownloadFolderName = null;
let pendingTranscriptWaiters = [];
let transcriptResponseQueue = [];
let pendingRecordingMetadataScan = null;
let sourceWorkerRun = null;
let sourceRunRequested = false;
let guidedWorkspace = false;
let guidedStatusTimer = null;
function showGuidedStatus(message, persistent = false) {
  if (!guidedWorkspace) return;
  let bubble = document.getElementById('ztd-guided-status');
  if (!bubble) {
    bubble = document.createElement('div'); bubble.id = 'ztd-guided-status'; bubble.setAttribute('role', 'status'); bubble.setAttribute('aria-live', 'polite');
    document.body.appendChild(bubble);
  }
  bubble.textContent = String(message || 'Working'); bubble.hidden = false;
  if (guidedStatusTimer) clearTimeout(guidedStatusTimer);
  guidedStatusTimer = persistent ? null : setTimeout(() => { bubble.hidden = true; }, 4500);
}
function hideGuidedStatus() {
  if (guidedStatusTimer) clearTimeout(guidedStatusTimer); guidedStatusTimer = null;
  const bubble = document.getElementById('ztd-guided-status'); if (bubble) bubble.hidden = true;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function startCoordinatedSourceRun(mode, explicitSelected = null) {
  const settings = await getSettings();
  const selected = Array.isArray(explicitSelected) ? sourceApi.orderedSources(Object.fromEntries(explicitSelected.map(s => [s === 'recordings' ? 'recordings' : 'myNotes', true]))) : mode === 'page' ? ['recordings'] : sourceApi.orderedSources({ recordings: document.querySelector('#ztd-source-recordings')?.checked, myNotes: document.querySelector('#ztd-source-notes')?.checked });
  if (!selected.length) { showToast('Select at least one source.', 'warn'); return; }
  sourceRunRequested = true;
  saveAllController = { running: true, stopRequested: false };
  setSaveAllRunning(true);
  const activity = document.querySelector('#ztd-activity-note');
  if (activity) activity.textContent = 'Starting selected sources in an inactive worker tab.';
  const response = await chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:startSourceRun`, payload: { selected, settings, currentSource: 'recordings', mode, guidedWorkspace: guidedWorkspace === true, originUrl: location.href, scope: mode === 'page' ? { page: getPaginationState().currentPage, rowKeys: scanRows().map(row => row.key) } : null } });
  if (!response?.ok) { sourceRunRequested = false; saveAllController.running = false; setSaveAllRunning(false); showToast(response?.error || 'Could not start the source batch.', 'error'); }
}

function showToast(message, kind = 'info', timeoutMs = 3500) {
  let toast = document.getElementById('ztd-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ztd-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  if (toast.__timer) clearTimeout(toast.__timer);
  toast.__timer = setTimeout(() => {
    toast.hidden = true;
  }, timeoutMs);
}

function log(message, extra) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}${extra ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`;
  logLines.unshift(line);
  logLines = logLines.slice(0, 150);
  const el = document.getElementById('ztd-log');
  if (el) el.textContent = logLines.join('\n');
  console.log('[ZTD]', message, extra || '');
}

function setOutput(value) {
  const out = document.getElementById('ztd-output');
  if (!out) return;
  out.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function debugCheckpoint(message, extra) {
  log(message, extra);
  stickyPanelMessage = {
    checkpoint: message,
    ...(extra && typeof extra === 'object' ? extra : extra ? { detail: String(extra) } : {}),
  };
  setOutput(stickyPanelMessage);
}

function sampleMeta() {
  return {
    title: 'Weekly Sync',
    meetingId: '12345678901',
    dateText: 'Apr 4, 2026 9:30 AM',
  };
}

function currentPattern(modal) {
  return modal.querySelector('#ztd-settings-pattern').value || '{date} - {time} - {title}';
}

function currentDownloadSubfolder(modal) {
  return sanitizeRelativeFolder(modal.querySelector('#ztd-settings-subfolder').value || '');
}

function renderSettingsPreview(modal) {
  const settings = {
    filenamePattern: currentPattern(modal),
    includeMeetingId: modal.querySelector('#ztd-settings-include-meeting-id').checked,
  };
  modal.querySelector('#ztd-pattern-example').textContent = `${buildTargetBase(sampleMeta(), settings)}.txt`;
  modal.querySelector('#ztd-settings-folder-example').textContent = `Downloads/${buildDownloadFolderPath(currentDownloadSubfolder(modal))}`;
}

function currentDestinationPreview(settings = currentSettings) {
  return `Downloads/${buildDownloadFolderPath(settings?.downloadSubfolder || '')}`;
}

function scanRows() {
  return scanTranscriptRows({
    rowSelector: ROW_SELECTOR,
    downloadButtonSelector: DOWNLOAD_BUTTON_SELECTOR,
    parseRowText,
  });
}

// Read only the occurrence key supplied by Zoom's recording-list app model.
// Visible meta.meetingId is the recurring meeting number and is not a matcher.
function requestRecordingMetadataScan(timeoutMs = 60000) {
  if (pendingRecordingMetadataScan) return Promise.reject(new Error('A recording metadata scan is already running.'));
  const requestId = 'scan-' + crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingRecordingMetadataScan?.requestId !== requestId) return;
      pendingRecordingMetadataScan = null;
      reject(new Error('Timed out waiting for the authenticated Zoom recording metadata scan.'));
    }, timeoutMs);
    pendingRecordingMetadataScan = { requestId, resolve, reject, timer };
    window.postMessage({ source: 'ztd-recording-metadata-request', action: 'scan', requestId }, location.origin);
  });
}

function acceptRecordingMetadataResult(payload) {
  const pending = pendingRecordingMetadataScan;
  if (!pending || payload?.requestId !== pending.requestId) return;
  clearTimeout(pending.timer);
  pendingRecordingMetadataScan = null;
  if (payload.ok !== true || payload.exhausted !== true || !Array.isArray(payload.rows)) {
    pending.reject(new Error(payload.error || 'Zoom recording metadata scan was incomplete.'));
    return;
  }
  const rows = payload.rows.map(row => ({
    sourceId: String(row.sortKey || ''),
    occurrenceId: String(row.meetingId || ''),
    title: String(row.topic || '').trim() || 'Untitled transcript',
    date: String(row.createTime || ''),
    available: typeof row.canDownload === 'boolean' ? row.canDownload : null,
    availabilityReason: typeof row.canDownload === 'boolean' ? 'Zoom API canDownload metadata.' : 'Zoom API did not return availability.',
  }));
  if (rows.some(row => !row.sourceId || !row.occurrenceId)) {
    pending.reject(new Error('Zoom recording metadata omitted an opaque row or occurrence ID.'));
    return;
  }
  pending.resolve({ rows, pages: payload.pages, expectedCount: payload.expectedCount, terminalPage: payload.terminalPage });
}

function collectRows() {
  const rows = scanRows().filter(r => r.hasDownload);
  lastRows = rows;
  return rows;
}

function rowSignature(rows = scanRows()) {
  return buildRowSignature(rows);
}

function transcriptCountText() {
  return readTranscriptCount(document);
}

function getPaginationState() {
  return readPaginationState(document);
}

async function getSettings() { return await runtime.getSettings(); }
async function setSettings(settings) { return await runtime.setSettings(settings); }
async function startDownloadBatch(payload) { return await runtime.startDownloadBatch(payload); }
async function finishDownloadBatch(payload) { return await runtime.finishDownloadBatch(payload); }
async function saveTranscript(payload) { return await runtime.saveTranscript(payload); }

function installPageHook() {
  if (window.__ztdInjectedScript) return;
  window.__ztdInjectedScript = true;
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-hook.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function clearTranscriptResponseQueue() {
  transcriptResponseQueue = [];
}

function flushPendingTranscriptWaiters(error) {
  const waiters = pendingTranscriptWaiters.slice();
  pendingTranscriptWaiters = [];
  waiters.forEach(waiter => {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  });
}

function waitForTranscriptResponse(timeoutMs = 20000) {
  if (transcriptResponseQueue.length) {
    return Promise.resolve(transcriptResponseQueue.shift());
  }
  return new Promise((resolve, reject) => {
    const waiter = {
      resolve(value) {
        clearTimeout(waiter.timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(waiter.timer);
        reject(error);
      },
      timer: setTimeout(() => {
        pendingTranscriptWaiters = pendingTranscriptWaiters.filter(item => item !== waiter);
        reject(new Error('Timed out while waiting for transcript data from the Zoom page.'));
      }, timeoutMs),
    };
    pendingTranscriptWaiters.push(waiter);
  });
}

function handleTranscriptResponseMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'zoom-transcript-extension') return;
  if (data.type === 'recording-metadata-result') {
    acceptRecordingMetadataResult(data.payload);
    return;
  }
  if (data.type === 'native-download-url' && saveAllController.running && sourceWorkerRun) {
    chrome.runtime.sendMessage({ type: EXTENSION_NS + ':expectRecordingNative', payload: { url: data.payload?.url } }).catch(() => {});
    return;
  }
  if (data.type === 'hook-debug') {
    if (pendingTranscriptWaiters.length) {
      log('Page hook observed network event', data.payload || {});
    }
    return;
  }
  if (data.type !== 'transcript-response') return;
  const payload = data.payload;
  if (!payload?.text || payload.text.length < 10) return;
  if (pendingTranscriptWaiters.length) {
    pendingTranscriptWaiters.shift().resolve(payload);
    return;
  }
  transcriptResponseQueue.push(payload);
  transcriptResponseQueue = transcriptResponseQueue.slice(-5);
}

function ensureLauncher() {
  let launcher = document.getElementById(LAUNCHER_ID);
  if (!launcher) {
    launcher = document.createElement('button');
    launcher.id = LAUNCHER_ID;
    launcher.type = 'button';
    launcher.textContent = 'Zoom Downloader';
    launcher.addEventListener('click', () => boot(true));
    document.body.appendChild(launcher);
  }
  launcher.style.display = guidedWorkspace || document.getElementById(PANEL_ID) ? 'none' : 'block';
}

function getPanelStats(rows) {
  const totalText = transcriptCountText();
  const total = Number(totalText) || 0;
  const downloadable = rows.length;
  const visibleParsed = scanRows();
  const unavailable = Math.max(0, visibleParsed.length - downloadable);
  const percent = total ? Math.max(0, Math.min(100, Math.round((downloadable / total) * 100))) : 0;
  return {
    total,
    totalText,
    downloadable,
    unavailable,
    percent,
  };
}

function setStatus(rows) {
  const stats = getPanelStats(rows);
  const statusMain = document.getElementById('ztd-status-main');
  const statusSecondary = document.getElementById('ztd-status-secondary');

  if (statusMain) statusMain.textContent = stats.total ? `${stats.downloadable} of ${stats.total} ready` : `${stats.downloadable} ready`;
  if (statusSecondary) {
    statusSecondary.textContent = stats.unavailable
      ? `${stats.unavailable} unavailable on this page`
      : 'All visible transcripts on this page are ready to save';
  }
}

function applyDebugVisibility() {
  const enabled = !!document.getElementById('ztd-debug-toggle')?.checked;
  const wrap = document.getElementById('ztd-debug-wrap');
  if (wrap) wrap.hidden = !enabled;
}

function setSaveAllRunning(isRunning) {
  const saveAll = document.getElementById('ztd-save-all');
  const savePage = document.getElementById('ztd-save-page');
  const stop = document.getElementById('ztd-stop-save-all');
  if (saveAll) saveAll.disabled = isRunning;
  if (savePage) savePage.disabled = isRunning;
  if (stop) {
    stop.disabled = !isRunning;
    stop.classList.toggle('ztd-active', isRunning);
  }
}

function updatePanelSummary() {
  const out = document.getElementById('ztd-output');
  const destination = document.getElementById('ztd-destination');
  const activity = document.getElementById('ztd-activity-note');
  if (destination && currentSettings) {
    destination.textContent = currentDestinationPreview();
  }
  if (!out || !currentSettings) return;
  if (stickyPanelMessage) {
    const message = typeof stickyPanelMessage === 'string'
      ? stickyPanelMessage
      : [stickyPanelMessage.message, stickyPanelMessage.detail].filter(Boolean).join('\n');
    if (activity) activity.textContent = message;
    out.textContent = message;
    return;
  }
  const pagination = getPaginationState();
  const visibleParsed = scanRows();
  const unavailableVisible = Math.max(0, visibleParsed.length - lastRows.length);
  const summaryLines = [
    `Viewing page ${pagination.currentPage} of ${pagination.totalPages}.`,
    `${lastRows.length} downloadable row${lastRows.length === 1 ? '' : 's'} detected on this page.`,
    unavailableVisible ? `${unavailableVisible} row${unavailableVisible === 1 ? '' : 's'} currently unavailable.` : 'No unavailable rows detected on this page.',
    `Saved ${downloadManifest.length} transcript${downloadManifest.length === 1 ? '' : 's'} in this session.`,
    `Meeting ID in filenames: ${currentSettings.includeMeetingId ? 'On' : 'Off'}.`,
  ];
  const detail = {
    url: location.href,
    visibleRows: lastRows.length,
    visibleUnavailableRows: unavailableVisible,
    totalAvailable: transcriptCountText(),
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    includeMeetingId: !!currentSettings.includeMeetingId,
    savedEntriesTracked: downloadManifest.length,
    perItemDelayMs: SAVE_ALL_DELAY_MS,
    note: 'V2 plans filenames across all pages first, then captures transcript text and saves each file directly with its final name.'
  };
  if (activity) activity.textContent = summaryLines.join(' ');
  out.textContent = `${summaryLines.join('\n')}\n\n${JSON.stringify(detail, null, 2)}`;
}

function scheduleRescan() {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    const rows = collectRows();
    setStatus(rows);
    updatePanelSummary();
  }, 250);
}

async function waitForRowsChange(previousSignature, timeoutMs = TRANSITION_TIMEOUT_MS) {
  return await waitForPageRowsChange({
    previousSignature,
    timeoutMs,
    sleep,
    scanRows,
    rowSignature,
  });
}

function ensurePatternHelpModal() {
  let modal = document.getElementById(PATTERN_HELP_MODAL_ID);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = PATTERN_HELP_MODAL_ID;
    modal.hidden = true;
    modal.innerHTML = `
      <div id="ztd-pattern-help-card">
        <div class="ztd-help-actions">
          <strong>Filename Pattern Help</strong>
          <button type="button" class="ztd-secondary" id="ztd-pattern-help-close">Close</button>
        </div>
        <table>
          <thead><tr><th>Token</th><th>Meaning</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td>{date}</td><td>Meeting date in YYYY-MM-DD</td><td>2026-04-04</td></tr>
            <tr><td>{time}</td><td>Meeting time in HHMM</td><td>0930</td></tr>
            <tr><td>{title}</td><td>Sanitized meeting title</td><td>Weekly Sync</td></tr>
            <tr><td>{meetingId}</td><td>Zoom meeting ID</td><td>12345678901</td></tr>
          </tbody>
        </table>
        <div id="ztd-pattern-help-output"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#ztd-pattern-help-close').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
  }
  return modal;
}

function ensureAboutModal() {
  let modal = document.getElementById(ABOUT_MODAL_ID);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = ABOUT_MODAL_ID;
    modal.hidden = true;
    modal.innerHTML = `
      <div id="ztd-about-card">
        <div class="ztd-help-actions">
          <strong>Help & About</strong>
          <button type="button" class="ztd-secondary" id="ztd-about-close">Close</button>
        </div>
        <div class="ztd-about-body">
          <p>Created by Blake Stover</p>
          <p><a href="mailto:bstover@gmail.com">bstover@gmail.com</a></p>
          <p><a href="https://github.com/outsidethebounds/Zoom_Transcript_Downloader" target="_blank" rel="noopener noreferrer">GitHub Repository</a></p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#ztd-about-close').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
  }
  return modal;
}

function ensureSettingsModal() {
  let modal = document.getElementById(SETTINGS_MODAL_ID);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = SETTINGS_MODAL_ID;
    modal.hidden = true;
    modal.innerHTML = `
      <div id="ztd-settings-card">
        <div class="ztd-settings-header">
          <div class="ztd-settings-hero">
            <div class="ztd-settings-eyebrow">Preferences</div>
            <strong>Save settings</strong>
            <p class="ztd-settings-subtitle">Choose how transcript files are named and where they land inside your Downloads folder.</p>
          </div>
          <button type="button" class="ztd-secondary" id="ztd-settings-close">Close</button>
        </div>
        <div class="ztd-settings-layout">
          <section class="ztd-settings-section">
            <div class="ztd-settings-section-head">
              <div>
                <div class="ztd-settings-section-title">Filename pattern</div>
                <div class="ztd-settings-note">Use tokens to keep transcript filenames readable and consistent.</div>
              </div>
              <button type="button" class="ztd-secondary ztd-help-chip" id="ztd-pattern-help">Pattern help</button>
            </div>
            <label class="ztd-field">
              <span class="ztd-field-label">Pattern</span>
              <input type="text" id="ztd-settings-pattern" />
            </label>
            <div class="ztd-preset-row" aria-label="Suggested filename patterns">
              <button type="button" class="ztd-secondary ztd-preset-chip" data-pattern="{date} - {time} - {title}">Meeting default</button>
              <button type="button" class="ztd-secondary ztd-preset-chip" data-pattern="{date} - {title}">Compact</button>
              <button type="button" class="ztd-secondary ztd-preset-chip" data-pattern="{date} - {time} - {title} - {meetingId}">With ID</button>
            </div>
            <div class="ztd-preview-card">
              <div class="ztd-preview-label">Example filename</div>
              <code id="ztd-pattern-example"></code>
            </div>
          </section>
          <section class="ztd-settings-section">
            <div class="ztd-settings-section-head">
              <div>
                <div class="ztd-settings-section-title">Save destination</div>
                <div class="ztd-settings-note">The extension saves inside your browser's normal Downloads location, then adds an optional subfolder.</div>
              </div>
            </div>
            <div class="ztd-destination-root">
              <span class="ztd-root-pill">Browser root</span>
              <strong>Downloads</strong>
            </div>
            <label class="ztd-field">
              <span class="ztd-field-label">Folder inside Downloads</span>
              <input type="text" id="ztd-settings-subfolder" placeholder="Optional, for example Work/Zoom" />
            </label>
            <div class="ztd-settings-callout">
              Browser extensions cannot save outside the browser's configured Downloads folder. This field only adds a subfolder underneath it.
            </div>
            <div class="ztd-preview-card">
              <div class="ztd-preview-label">Files will save to</div>
              <code id="ztd-settings-folder-example"></code>
            </div>
          </section>
          <section class="ztd-settings-section">
            <div class="ztd-settings-section-head">
              <div>
                <div class="ztd-settings-section-title">Filename safety</div>
                <div class="ztd-settings-note">Add extra uniqueness when meeting titles repeat.</div>
              </div>
            </div>
            <div class="ztd-toggle-card">
              <label class="ztd-checkbox-row">
                <input type="checkbox" id="ztd-settings-include-meeting-id" />
                <span>
                  <strong>Include meeting ID in every filename</strong>
                  <span class="ztd-settings-note">Useful when similar meeting titles might otherwise collide.</span>
                </span>
              </label>
            </div>
          </section>
        </div>
        <div class="ztd-settings-footer">
          <button type="button" class="ztd-secondary" id="ztd-settings-cancel">Cancel</button>
          <div id="ztd-settings-save-status" class="ztd-settings-note" hidden></div>
          <button type="button" id="ztd-settings-save">Save settings</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#ztd-settings-close').addEventListener('click', () => { modal.hidden = true; });
    modal.querySelector('#ztd-settings-cancel').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
    modal.querySelector('#ztd-pattern-help').addEventListener('click', () => {
      const help = ensurePatternHelpModal();
      const pattern = currentPattern(modal);
      const example = `${buildTargetBase(sampleMeta(), { filenamePattern: pattern, includeMeetingId: modal.querySelector('#ztd-settings-include-meeting-id').checked })}.txt`;
      help.querySelector('#ztd-pattern-help-output').innerHTML = `
        <p><strong>Current pattern:</strong> <code>${escapeHtml(pattern)}</code></p>
        <p><strong>Example:</strong> <code>${escapeHtml(example)}</code></p>
        <p><strong>Try these:</strong></p>
        <ul>
          <li><code>{date} - {time} - {title}</code></li>
          <li><code>{date} - {title}</code></li>
          <li><code>{date} - {time} - {title} - {meetingId}</code></li>
        </ul>
      `;
      help.hidden = false;
    });
    modal.querySelectorAll('.ztd-preset-chip').forEach(button => {
      button.addEventListener('click', () => {
        modal.querySelector('#ztd-settings-pattern').value = button.dataset.pattern || '';
        renderSettingsPreview(modal);
      });
    });
    modal.querySelector('#ztd-settings-pattern').addEventListener('input', () => renderSettingsPreview(modal));
    modal.querySelector('#ztd-settings-subfolder').addEventListener('input', () => renderSettingsPreview(modal));
    modal.querySelector('#ztd-settings-include-meeting-id').addEventListener('change', () => renderSettingsPreview(modal));
    modal.querySelector('#ztd-settings-save').addEventListener('click', async () => {
      const settings = {
        filenamePattern: currentPattern(modal),
        downloadSubfolder: currentDownloadSubfolder(modal),
        includeMeetingId: modal.querySelector('#ztd-settings-include-meeting-id').checked,
      };
      await setSettings(settings);
      currentSettings = { ...(currentSettings || {}), ...settings };
      const status = modal.querySelector('#ztd-settings-save-status');
      status.hidden = false;
      status.textContent = `Saved. Future transcript files will use this pattern and save to Downloads/${buildDownloadFolderPath(settings.downloadSubfolder)}.`;
      updatePanelSummary();
      log('Settings updated', settings);
    });
  }
  return modal;
}

async function populateSettingsModal() {
  const modal = ensureSettingsModal();
  const settings = await getSettings();
  modal.querySelector('#ztd-settings-pattern').value = settings.filenamePattern || '';
  modal.querySelector('#ztd-settings-subfolder').value = settings.downloadSubfolder || '';
  modal.querySelector('#ztd-settings-include-meeting-id').checked = !!settings.includeMeetingId;
  renderSettingsPreview(modal);
  modal.querySelector('#ztd-settings-save-status').hidden = true;
  modal.querySelector('#ztd-settings-save-status').textContent = '';
  return modal;
}

function buildPlannedEntry(item, settings, page) {
  return {
    runId: currentRunId,
    title: item.meta.title,
    meetingId: item.meta.meetingId,
    dateText: item.meta.dateText,
    page,
    rowKey: item.key,
    targetBase: buildTargetBase(item.meta, settings),
    ...normalizeMeta(item.meta),
  };
}

function rowsMatchPlan(currentRows, plannedEntries) {
  if (currentRows.length !== plannedEntries.length) return false;
  return currentRows.every((row, index) => {
    const planned = plannedEntries[index];
    return !!planned
      && row.key === planned.rowKey
      && row.meta?.meetingId === planned.meetingId
      && row.meta?.dateText === planned.dateText
      && row.meta?.title === planned.title;
  });
}

async function collectDownloadPlan(settings) {
  const plannedEntries = [];
  const visitedSignatures = new Set();
  let pagesVisited = 0;
  let skippedUnavailable = 0;
  let pageNumber = 1;

  while (true) {
    if (saveAllController.stopRequested) {
      return { ok: false, stopped: true, error: 'Stopped during planning.' };
    }
    const allRowsNow = scanRows();
    const rowsNow = allRowsNow.filter(r => r.hasDownload);
    const unavailableNow = Math.max(0, allRowsNow.length - rowsNow.length);
    const signature = rowSignature(allRowsNow);
    const pagination = getPaginationState();

    if (!allRowsNow.length) {
      return { ok: false, error: 'No transcript rows were found while planning the download pass.', page: pageNumber };
    }
    if (visitedSignatures.has(signature)) {
      return { ok: false, error: 'Detected duplicate page signature while planning downloads. Aborting to avoid looping.', pagesVisited, skippedUnavailable };
    }

    visitedSignatures.add(signature);
    pagesVisited += 1;
    skippedUnavailable += unavailableNow;
    rowsNow.forEach(row => plannedEntries.push(buildPlannedEntry(row, settings, pageNumber)));

    log('Planned page', {
      page: pageNumber,
      totalPages: pagination.totalPages,
      downloadableRows: rowsNow.length,
      unavailableRows: unavailableNow,
      plannedEntries: plannedEntries.length,
    });

    if (sourceWorkerRun?.testLimit && plannedEntries.length >= sourceWorkerRun.testLimit) break;
    const moved = await gotoNextPage();
    if (!moved.ok) break;
    await sleep(800);
    pageNumber += 1;
  }

  return {
    ok: true,
    entries: applyCollisionSafeFilenames(plannedEntries, settings),
    pagesVisited,
    skippedUnavailable,
  };
}

let guidedRecordingScanStopped = false;
async function scanGuidedRecordingInventory() {
  guidedRecordingScanStopped = false;
  if (/login|signin|sign-in|sso/i.test(location.pathname) || document.querySelector('input[type="password"]')) return { ok: false, needsUserAction: true, error: 'Zoom sign-in is required before recording metadata can be scanned.' };
  const search = document.querySelector('input[placeholder="Search by topic or meeting ID"]');
  const period = document.querySelector('[role="combobox"][aria-label="Select a period of time"]');
  if (!search || !period) return { ok: false, error: 'Could not verify Zoom search/date controls; scan is incomplete.' };
  if ((search.value || '').trim() || (period.innerText || '').replace(/\s+/g, '') !== 'From-To') return { ok: false, error: 'Clear the Zoom date and search filters to scan the complete recordings list.' };
  let apiScan;
  try { apiScan = await requestRecordingMetadataScan(); }
  catch (error) { return { ok: false, error: String(error?.message || error) }; }
  if (guidedRecordingScanStopped) return { ok: false, stopped: true, error: 'Scan stopped before metadata pagination was exhausted.' };
  const assets = apiScan.rows;
  const expected = apiScan.expectedCount;
  const pages = apiScan.pages;
  const availableCount = assets.filter(asset => asset.available === true).length;
  const unavailableCount = assets.filter(asset => asset.available === false).length;
  if (Number.isFinite(expected) && expected !== assets.length) return { ok: false, assets, count: assets.length, pages, expectedCount: expected, error: 'Zoom reports ' + expected + ' rows but the authenticated API returned ' + assets.length + '.' };
  return { ok: true, assets, count: assets.length, pages, expectedCount: expected, availableCount, unavailableCount, exhausted: true };
}
async function saveTranscriptRow(item, plannedEntry) {
  clearTranscriptResponseQueue();
  log('About to click transcript row', {
    title: item.meta.title,
    meetingId: item.meta.meetingId,
    page: plannedEntry.page,
    targetFilename: plannedEntry.targetFilename,
  });
  item.button.scrollIntoView({ block: 'center', inline: 'nearest' });
  item.button.click();
  log('Clicked transcript row', { title: item.meta.title, targetFilename: plannedEntry.targetFilename });
  log('Waiting for transcript response', { title: item.meta.title, targetFilename: plannedEntry.targetFilename });
  const response = await waitForTranscriptResponse(20000);
  log('Transcript response received', {
    title: item.meta.title,
    targetFilename: plannedEntry.targetFilename,
    responseUrl: response?.url || null,
    contentType: response?.contentType || '',
    textLength: response?.text?.length || 0,
  });
  const saved = await saveTranscript({
    filename: plannedEntry.targetFilename,
    content: response.text,
    mimeType: 'text/plain;charset=utf-8',
  });

  const entry = {
    ...plannedEntry,
    sourceUrl: response.url || null,
    sourceContentType: response.contentType || '',
    savedFilename: saved?.filename || plannedEntry.targetFilename,
    savedDownloadId: saved?.downloadId || null,
  };

  if (saved?.ok) downloadManifest.push(entry);
  if (sourceWorkerRun) chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:sourceWorkerProgress`, payload: { runId: sourceWorkerRun.runId, progress: { saved: downloadManifest.length, skipped: skippedUnavailable, failed: 0, pending: Number.isFinite(sourceWorkerRun.total) ? Math.max(0, sourceWorkerRun.total - downloadManifest.length - skippedUnavailable) : null }, message: 'Saved ' + downloadManifest.length + ' recording transcript' + (downloadManifest.length === 1 ? '' : 's') + ' so far.' } }).catch(() => {});
  updatePanelSummary();
  log('Saved transcript with final filename', entry);

  if (!saved?.ok) {
    return { ok: false, error: saved?.error || 'Failed to save transcript file.', entry };
  }
  return { ok: true, savedFilename: entry.savedFilename, targetFilename: plannedEntry.targetFilename };
}

async function saveVisiblePage(settingsNow) {
  const pagination = getPaginationState();
  const allRowsNow = scanRows();
  const rowsNow = allRowsNow.filter(r => r.hasDownload);
  const unavailableNow = Math.max(0, allRowsNow.length - rowsNow.length);

  if (!allRowsNow.length) {
    debugCheckpoint('Current-page save found no transcript rows', {
      error: 'No transcript rows were found on the current page.',
      page: pagination.currentPage,
    });
    return { ok: false, error: 'No transcript rows were found on the current page.' };
  }

  const plannedEntries = applyCollisionSafeFilenames(
    rowsNow.map(row => buildPlannedEntry(row, settingsNow, pagination.currentPage)),
    settingsNow
  );

  const results = [];
  let previousItemStartMs = null;
  for (let i = 0; i < rowsNow.length; i++) {
    if (sourceWorkerRun?.testLimit && results.length >= sourceWorkerRun.testLimit) break;
    if (saveAllController.stopRequested) {
      return {
        ok: false,
        stopped: true,
        page: pagination.currentPage,
        plannedEntries,
        skippedUnavailable: unavailableNow,
        results,
      };
    }
    debugCheckpoint('Saving current-page transcript row', {
      page: pagination.currentPage,
      rowIndex: i,
      rowKey: rowsNow[i].key,
      title: rowsNow[i].meta?.title || '',
      targetFilename: plannedEntries[i]?.targetFilename || null,
    });
    previousItemStartMs = await waitForNextRecordingStart(previousItemStartMs);
    try { results.push(await saveTranscriptRow(rowsNow[i], plannedEntries[i])); } catch (error) { results.push({ ok: false, error: String(error) }); }
  }

  return {
    ok: true,
    page: pagination.currentPage,
    plannedEntries,
    skippedUnavailable: unavailableNow,
    results,
  };
}

async function gotoFirstPage() {
  return await navigateToFirstPage({
    getPaginationState,
    rowSignature,
    scanRows,
    waitForRowsChange,
    log,
  });
}

async function gotoNextPage() {
  return await navigateToNextPage({
    getPaginationState,
    rowSignature,
    waitForRowsChange,
    log,
  });
}

function renderPanel(rows, settings) {
  let panel = document.getElementById(PANEL_ID);
  ensureSettingsModal();
  ensurePatternHelpModal();
  ensureAboutModal();
  if (!panel) {
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.classList.add('ztd-collapsed');
    panel.innerHTML = `
      <div class="ztd-header">
        <div class="ztd-header-left">
          <div class="ztd-title-block">
            <strong><span class="ztd-title-zoom">Zoom</span> Transcript Downloader</strong>
          </div>
        </div>
      </div>
      <div class="ztd-status-card">
        <div class="ztd-status-icon" aria-hidden="true">✓</div>
        <div class="ztd-status-copy">
          <div id="ztd-status-main" class="ztd-status-main">0 ready</div>
          <div id="ztd-status-secondary" class="ztd-status-secondary">Waiting for transcript rows</div>
        </div>
      </div>
      <div class="ztd-source-options">
        <div class="ztd-section-label">Sources</div>
        <label><input type="checkbox" id="ztd-source-recordings"> Recording transcripts</label>
        <label><input type="checkbox" id="ztd-source-notes"> My Notes transcripts</label>
      </div>
      <div class="ztd-controls">
        <div class="ztd-button-with-help">
          <button
            type="button"
            id="ztd-save-all"
            aria-describedby="ztd-save-all-tooltip"
          >Save selected sources</button>
          <span class="ztd-inline-tooltip" id="ztd-save-all-tooltip" role="tooltip">
            Saves every available transcript across all pages, not just the page you are viewing now.
          </span>
        </div>
        <button type="button" class="ztd-secondary-action" id="ztd-save-page" title="Save only this source's visible list">Save this page</button>
        <button type="button" class="ztd-danger" id="ztd-stop-save-all">Stop</button>
      </div>
      <div class="ztd-meta-section">
        <div class="ztd-section-label">Save location</div>
        <div class="ztd-destination-card">
          <span id="ztd-destination"></span>
        </div>
      </div>
      <div class="ztd-activity-card">
        <div class="ztd-section-label">Activity</div>
        <div id="ztd-activity-note" class="ztd-activity-note"></div>
      </div>
      <div class="ztd-footer-actions">
        <button type="button" class="ztd-icon-button ztd-icon-settings" id="ztd-settings" title="Settings" aria-label="Open settings"><span class="ztd-icon-glyph" aria-hidden="true">⚙</span></button>
        <button type="button" class="ztd-icon-button ztd-icon-help" id="ztd-readme-help" title="Help and About" aria-label="Open help and about">ⓘ</button>
        <button type="button" class="ztd-icon-button ztd-icon-expand" id="ztd-collapse" title="Expand panel" aria-label="Expand panel">⇱</button>
        <button type="button" class="ztd-icon-button ztd-icon-close" id="ztd-close" title="Close panel" aria-label="Close panel">✕</button>
      </div>
      <pre id="ztd-output"></pre>
      <div class="ztd-spacer" style="height:10px"></div>
      <div class="ztd-debug-row">
        <label><input type="checkbox" id="ztd-debug-toggle"> Show debug</label>
      </div>
      <div id="ztd-debug-wrap" hidden>
        <pre id="ztd-log"></pre>
      </div>
    `;
    document.body.appendChild(panel);
    panel.hidden = guidedWorkspace;

    panel.querySelector('#ztd-close').addEventListener('click', () => { panel.remove(); ensureLauncher(); });
    panel.querySelector('#ztd-settings').addEventListener('click', async () => { const settingsModal = await populateSettingsModal(); settingsModal.hidden = false; });
    panel.querySelector('#ztd-readme-help').addEventListener('click', () => {
      ensureAboutModal().hidden = false;
    });
    panel.querySelector('#ztd-collapse').addEventListener('click', event => {
      panel.classList.toggle('ztd-collapsed');
      const collapsed = panel.classList.contains('ztd-collapsed');
      event.currentTarget.textContent = collapsed ? '⇱' : '⇲';
      event.currentTarget.title = collapsed ? 'Expand panel' : 'Collapse panel';
      event.currentTarget.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
    });
    panel.querySelector('#ztd-debug-toggle').addEventListener('change', applyDebugVisibility);
    const sourceRecordings = panel.querySelector('#ztd-source-recordings');
    const sourceNotes = panel.querySelector('#ztd-source-notes');
    const storedSources = sourceApi?.normalizeSources(settings.sources);
    sourceRecordings.checked = storedSources?.recordings ?? true;
    sourceNotes.checked = storedSources?.myNotes ?? false;
    const persistSources = async () => {
      const sources = { recordings: sourceRecordings.checked, myNotes: sourceNotes.checked };
      await setSettings({ sources });
      currentSettings = { ...(currentSettings || {}), sources };
    };
    sourceRecordings.addEventListener('change', persistSources);
    sourceNotes.addEventListener('change', persistSources);

    panel.querySelector('#ztd-save-all').addEventListener('click', async () => {
      if (!sourceWorkerRun) { await startCoordinatedSourceRun('all'); return; }
      const settingsNow = sourceWorkerRun?.settings || await getSettings();
      currentDownloadFolderName = sourceWorkerRun?.folderName || buildDownloadFolderPath(settingsNow.downloadSubfolder);
      stickyPanelMessage = {
        ok: true,
        message: 'Download job is running.',
        detail: 'Keep this tab open while transcripts are captured and saved with final names. You can use Stop to halt after the current item.',
        folderName: currentDownloadFolderName
      };
      currentRunId = `run-${Date.now()}`;
      window.postMessage({ source: 'ztd-recording-worker-control', active: true }, location.origin);
      await startDownloadBatch({ runId: currentRunId, folderName: currentDownloadFolderName, mode: 'direct-save' });
      downloadManifest = [];
      updatePanelSummary();
      saveAllController = { running: true, stopRequested: sourceWorkerRun?.stopRequested === true };
      setSaveAllRunning(true);
      showToast(`Download job started. Files will be saved in Downloads/${currentDownloadFolderName}.`, 'info', 5000);

      const results = [];
      let plannedEntries = [];
      let pagesVisited = 0;
      let skippedUnavailable = 0;
      let savePageNumber = 1;
      let workerError = null;

      try {
        debugCheckpoint('Resetting to page 1 before planning download', {
          runId: currentRunId,
          folderName: currentDownloadFolderName,
        });
        const reset = await gotoFirstPage();
        if (!reset.ok) {
          workerError = reset.error;
          debugCheckpoint('Reset to page 1 before planning failed', { error: reset.error });
          return;
        }

        await sleep(800);
        scheduleRescan();

        debugCheckpoint('Planning final filenames across all pages');
        const plan = await collectDownloadPlan(settingsNow);
        if (!plan.ok) {
          workerError = plan.error;
          debugCheckpoint('Planning failed', plan);
          return;
        }

        plannedEntries = plan.entries;
        pagesVisited = plan.pagesVisited;
        skippedUnavailable = plan.skippedUnavailable;
        debugCheckpoint('Planning complete', {
          plannedEntries: plannedEntries.length,
          pagesVisited,
          skippedUnavailable,
        });

        debugCheckpoint('Resetting to page 1 before save pass');
        const resetForSave = await gotoFirstPage();
        if (!resetForSave.ok) {
          workerError = resetForSave.error;
          debugCheckpoint('Reset to page 1 before save pass failed', { error: resetForSave.error });
          return;
        }

        await sleep(800);
        debugCheckpoint('Save pass starting', {
          plannedEntries: plannedEntries.length,
          pagesVisited,
        });

        let previousItemStartMs = null;
        while (true) {
          const allRowsNow = scanRows();
          const rowsNow = allRowsNow.filter(r => r.hasDownload);
          const pagination = getPaginationState();

          if (!allRowsNow.length) {
            debugCheckpoint('Save pass found no transcript rows', {
              page: savePageNumber,
              error: 'No transcript rows were found after page reset/navigation.',
            });
            return;
          }

          const pageEntries = plannedEntries.filter(entry => entry.page === savePageNumber);
          debugCheckpoint('Checking live page against plan', {
            page: savePageNumber,
            totalPages: pagination.totalPages,
            expectedRows: pageEntries.length,
            actualRows: rowsNow.length,
          });
          if (!rowsMatchPlan(rowsNow, pageEntries)) {
            debugCheckpoint('Live page does not match planned rows', {
              error: 'The live Zoom page no longer matches the planned transcript list. Refresh and try again.',
              page: savePageNumber,
              expectedRows: pageEntries.length,
              actualRows: rowsNow.length,
              plannedRowKeys: pageEntries.map(entry => entry.rowKey),
              actualRowKeys: rowsNow.map(row => row.key),
            });
            return;
          }

          debugCheckpoint('Live page matched plan', {
            page: savePageNumber,
            rows: rowsNow.length,
            savedSoFar: downloadManifest.length,
          });
          log('Saving page', {
            page: savePageNumber,
            totalPages: pagination.totalPages,
            downloadableRows: rowsNow.length,
            savedSoFar: downloadManifest.length,
          });

          for (let i = 0; i < rowsNow.length; i++) {
    if (sourceWorkerRun?.testLimit && results.length >= sourceWorkerRun.testLimit) break;
            if (saveAllController.stopRequested) {
              results.push({ stopped: true, page: savePageNumber, processed: downloadManifest.length, skippedUnavailable });
              setOutput(results);
              return;
            }
            debugCheckpoint('Saving transcript row', {
              page: savePageNumber,
              rowIndex: i,
              rowKey: rowsNow[i].key,
              title: rowsNow[i].meta?.title || '',
              targetFilename: pageEntries[i]?.targetFilename || null,
            });
            previousItemStartMs = await waitForNextRecordingStart(previousItemStartMs);
            try { results.push(await saveTranscriptRow(rowsNow[i], pageEntries[i])); } catch (error) { results.push({ ok: false, error: String(error) }); }
          }

          if (sourceWorkerRun?.testLimit && results.length >= sourceWorkerRun.testLimit) break;
          const moved = await gotoNextPage();
          if (!moved.ok) break;
          savePageNumber += 1;
          debugCheckpoint('Moved to next page for save pass', {
            nextPage: savePageNumber,
          });
          await sleep(800);
        }
      } finally {
        window.postMessage({ source: 'ztd-recording-worker-control', active: false }, location.origin);
        flushPendingTranscriptWaiters(new Error('Download batch finished before transcript capture completed.'));
        await finishDownloadBatch({ runId: currentRunId }).catch(() => {});
        if (sourceWorkerRun) {
          const failed = results.filter(result => result && result.ok === false).length;
          await chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:sourceWorkerCompleted`, payload: { runId: sourceWorkerRun.runId, source: 'recordings', saved: results.filter(result => result?.ok).length, skipped: skippedUnavailable, failed: failed + (workerError && !saveAllController.stopRequested ? 1 : 0), error: workerError, stopped: saveAllController.stopRequested } }).catch(() => {});
          sourceWorkerRun = null;
        }
        saveAllController.running = false;
        setSaveAllRunning(false);
      }

      stickyPanelMessage = null;
      const completionSummary = {
        pagesVisited,
        planned: plannedEntries.length,
        downloaded: downloadManifest.length,
        skippedUnavailable,
        results,
      };
      panel.querySelector('#ztd-activity-note').textContent = `Finished processing ${plannedEntries.length} planned transcript${plannedEntries.length === 1 ? '' : 's'} across ${pagesVisited} page${pagesVisited === 1 ? '' : 's'}. Saved ${downloadManifest.length}.`;
      panel.querySelector('#ztd-output').textContent = JSON.stringify(completionSummary, null, 2);
      showToast(`Download job finished. Saved ${downloadManifest.length} transcript${downloadManifest.length === 1 ? '' : 's'} with final filenames.`, 'success', 5000);
    });

    panel.querySelector('#ztd-save-page').addEventListener('click', async () => {
      if (!sourceWorkerRun) { await startCoordinatedSourceRun('page'); return; }
      const settingsNow = sourceWorkerRun?.settings || await getSettings();
      const pagination = getPaginationState();
      currentDownloadFolderName = sourceWorkerRun?.folderName || buildDownloadFolderPath(settingsNow.downloadSubfolder);
      stickyPanelMessage = {
        ok: true,
        message: `Saving transcripts from page ${pagination.currentPage}.`,
        detail: 'Only the transcripts visible on this page will be captured and saved.',
        folderName: currentDownloadFolderName
      };
      currentRunId = `run-${Date.now()}`;
      window.postMessage({ source: 'ztd-recording-worker-control', active: true }, location.origin);
      await startDownloadBatch({ runId: currentRunId, folderName: currentDownloadFolderName, mode: 'direct-save-current-page' });
      downloadManifest = [];
      updatePanelSummary();
      saveAllController = { running: true, stopRequested: sourceWorkerRun?.stopRequested === true };
      setSaveAllRunning(true);
      showToast(`Current-page save started. Files will be saved in Downloads/${currentDownloadFolderName}.`, 'info', 5000);

      let result;
      try {
        if (sourceWorkerRun?.scope?.page > 1) {
          for (let p = 1; p < sourceWorkerRun.scope.page; p++) { const moved = await gotoNextPage(); if (!moved.ok) throw new Error('Could not restore the originating page.'); await sleep(800); }
        }
        if (sourceWorkerRun?.scope?.rowKeys && JSON.stringify(scanRows().map(r => r.key)) !== JSON.stringify(sourceWorkerRun.scope.rowKeys)) throw new Error('The worker list no longer matches the originating visible page.');
        result = await saveVisiblePage(settingsNow);
        if (!result.ok) {
          debugCheckpoint('Current-page save failed', result);
          return;
        }
        stickyPanelMessage = null;
        panel.querySelector('#ztd-activity-note').textContent = `Finished saving page ${result.page}. Saved ${downloadManifest.length} transcript${downloadManifest.length === 1 ? '' : 's'} from the current page.`;
        panel.querySelector('#ztd-output').textContent = JSON.stringify({
          page: result.page,
          planned: result.plannedEntries.length,
          downloaded: downloadManifest.length,
          skippedUnavailable: result.skippedUnavailable,
          results: result.results,
        }, null, 2);
        showToast(`Current page finished. Saved ${downloadManifest.length} transcript${downloadManifest.length === 1 ? '' : 's'}.`, 'success', 5000);
      } finally {
        window.postMessage({ source: 'ztd-recording-worker-control', active: false }, location.origin);
        flushPendingTranscriptWaiters(new Error('Current-page save finished before transcript capture completed.'));
        await finishDownloadBatch({ runId: currentRunId }).catch(() => {});
        if (sourceWorkerRun) {
          const failed = (result?.results || []).filter(item => item && item.ok === false).length;
          await chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:sourceWorkerCompleted`, payload: { runId: sourceWorkerRun.runId, source: 'recordings', saved: (result?.results || []).filter(item => item?.ok).length, skipped: result?.skippedUnavailable || 0, failed: failed || (!result?.ok && !saveAllController.stopRequested ? 1 : 0), stopped: saveAllController.stopRequested } }).catch(() => {});
          sourceWorkerRun = null;
        }
        saveAllController.running = false;
        setSaveAllRunning(false);
      }
    });

    panel.querySelector('#ztd-stop-save-all').addEventListener('click', () => {
      if (sourceRunRequested) {
        chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:stopSourceRun` }).catch(() => {});
        stickyPanelMessage = 'Stop requested. The current export will finish before the batch stops.';
        panel.querySelector('#ztd-activity-note').textContent = stickyPanelMessage;
        panel.querySelector('#ztd-output').textContent = stickyPanelMessage;
        return;
      }
      if (saveAllController.running) {
        saveAllController.stopRequested = true;
        stickyPanelMessage = 'Stop requested. Will halt after the current transcript finishes saving.';
        panel.querySelector('#ztd-activity-note').textContent = stickyPanelMessage;
        panel.querySelector('#ztd-output').textContent = stickyPanelMessage;
        showToast('Stop requested. The job will halt after the current item.', 'warn', 4000);
      }
    });
  }

  currentSettings = settings;
  ensureLauncher();
  setStatus(rows);
  updatePanelSummary();
  const logEl = document.getElementById('ztd-log');
  if (logEl) logEl.textContent = logLines.join('\n');
  applyDebugVisibility();
  setSaveAllRunning(saveAllController.running);
}

async function boot(verbose = false) {
  installPageHook();
  ensureLauncher();
  const settings = await getSettings();
  const rows = collectRows();
  renderPanel(rows, settings);
  scheduleRescan();
  if (verbose) {
    log('Panel ready', {
      rows: rows.length,
      total: transcriptCountText(),
      pagination: getPaginationState(),
      tracked: downloadManifest.length,
      delayMs: SAVE_ALL_DELAY_MS,
    });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'zoomTranscriptExtension:setGuidedWorkspace') {
    guidedWorkspace = message.payload?.active === true;
    const panel = document.getElementById(PANEL_ID); if (panel) panel.hidden = guidedWorkspace;
    const launcher = document.getElementById(LAUNCHER_ID); if (launcher) launcher.style.display = guidedWorkspace ? 'none' : (panel ? 'none' : 'block');
    sendResponse({ ok: true }); return false;
  }
  if (message?.type === 'zoomTranscriptExtension:ping') {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:scanGuidedRecordings') {
    scanGuidedRecordingInventory().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'zoomTranscriptExtension:stopGuidedScan') { guidedRecordingScanStopped = true; const pending = pendingRecordingMetadataScan; if (pending) { clearTimeout(pending.timer); pendingRecordingMetadataScan = null; pending.reject(new Error('Scan stopped before metadata pagination was exhausted.')); } sendResponse({ ok: true }); return false; }
  if (message?.type === 'zoomTranscriptExtension:startGuidedDownload') {
    startCoordinatedSourceRun('all', message.payload?.selected || []);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:stopGuidedDownload') {
    chrome.runtime.sendMessage({ type: 'zoomTranscriptExtension:stopSourceRun' }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:getSourceWorkerState') {
    sendResponse({ runId: sourceWorkerRun?.runId || currentRunId || null, active: sourceRunRequested === true || saveAllController.running === true });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:workerStartRecordings') {
    sourceWorkerRun = message.payload || {};
    currentRunId = sourceWorkerRun.runId || ('worker-' + Date.now());
    sendResponse({ ok: true });
    (async () => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !scanRows().length && !saveAllController.stopRequested) await sleep(200);
      await boot(true);
      const selector = sourceWorkerRun.mode === 'page' ? '#ztd-save-page' : '#ztd-save-all';
      document.querySelector(selector)?.click();
    })().catch(() => {});
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:stopSourceWorker') {
    saveAllController.stopRequested = true;
    if (sourceWorkerRun) sourceWorkerRun.stopRequested = true;
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:sourceRunProgress') {
    if (message.payload?.guided === true) showGuidedStatus((message.payload?.source === 'recordings' ? 'Recording transcripts: ' : 'My Notes: ') + (message.payload?.message || message.payload?.state || 'Working'), true);
    chrome.runtime.sendMessage({ type: 'zoomTranscriptExtension:guidedStatus', payload: { message: (message.payload?.source === 'recordings' ? 'Recording transcripts: ' : 'My Notes: ') + (message.payload?.message || message.payload?.state || 'Working') } }).catch(() => {});
    const activity = document.querySelector('#ztd-activity-note');
    if (activity) activity.textContent = (message.payload?.source === 'recordings' ? 'Recording transcripts: ' : 'My Notes transcripts: ') + (message.payload?.message || message.payload?.state || 'Working');
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:sourceRunFinished' || message?.type === 'zoomTranscriptExtension:sourceRunPaused') {
    if (message.payload?.guided === true) { if (message.payload?.needsUserAction) showGuidedStatus('Action needed: ' + message.payload.needsUserAction.reason, true); else hideGuidedStatus(); }
    chrome.runtime.sendMessage({ type: 'zoomTranscriptExtension:guidedFinished', payload: { message: message.payload?.needsUserAction ? 'Action needed: ' + message.payload.needsUserAction.reason : 'Downloads finished. Review saved, unavailable, failed, and pending totals for each source.', results: message.payload?.results, needsUserAction: message.payload?.needsUserAction || null } }).catch(() => {});
    sourceRunRequested = false;
    saveAllController.running = false;
    setSaveAllRunning(false);
    const payload = message.payload || {};
    const summary = { folder: payload.folderName, sources: payload.results, needsUserAction: payload.needsUserAction || null };
    const sourceError = Object.entries(payload.results || {}).find(([, result]) => result?.error);
    const activity = document.querySelector('#ztd-activity-note');
    if (activity) activity.textContent = payload.needsUserAction ? 'Action needed: ' + payload.needsUserAction.reason + ' (' + payload.needsUserAction.url + ')' : sourceError ? (sourceError[0] === 'myNotes' ? 'My Notes' : 'Recordings') + ' failed: ' + sourceError[1].error : 'Source batch finished. See per-source saved / skipped / failed counts below.';
    setOutput(summary);
    if (payload.needsUserAction) showToast('Action needed in the dedicated Zoom worker tab.', 'warn', 8000);
    else if (sourceError) showToast('A source failed. See the error and completed-download counts below.', 'warn', 8000);
    else showToast('Selected source batch finished.', 'success', 5000);
    return false;
  }
  if (message?.type === 'zoomTranscriptExtension:openPanel') {
    boot(true).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

window.addEventListener('message', handleTranscriptResponseMessage);

const observer = new MutationObserver(() => {
  scheduleRescan();
  if (!document.getElementById(PANEL_ID)) ensureLauncher();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:getGuidedTabState` }).then(state => { guidedWorkspace = state?.guided === true; return boot(); }).catch(() => boot()).catch(error => log('Initial boot failed', String(error)));

})();
