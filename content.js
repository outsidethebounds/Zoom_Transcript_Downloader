const EXTENSION_NS = 'zoomTranscriptExtension';
const PANEL_ID = 'ztd-panel';
const LAUNCHER_ID = 'ztd-launcher';
const SETTINGS_MODAL_ID = 'ztd-settings-modal';
const PATTERN_HELP_MODAL_ID = 'ztd-pattern-help-modal';
const ABOUT_MODAL_ID = 'ztd-about-modal';
const ROW_SELECTOR = 'tr.zoom-virtual-table__row';
const DOWNLOAD_BUTTON_SELECTOR = 'button[aria-label^="Download "]';
const SAVE_ALL_DELAY_MS = 600;
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
  launcher.style.display = document.getElementById(PANEL_ID) ? 'none' : 'block';
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

  downloadManifest.push(entry);
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
  for (let i = 0; i < rowsNow.length; i++) {
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
    results.push(await saveTranscriptRow(rowsNow[i], plannedEntries[i]));
    await sleep(SAVE_ALL_DELAY_MS);
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
      <div class="ztd-controls">
        <div class="ztd-button-with-help">
          <button
            type="button"
            id="ztd-save-all"
            aria-describedby="ztd-save-all-tooltip"
          >Save all</button>
          <span class="ztd-inline-tooltip" id="ztd-save-all-tooltip" role="tooltip">
            Saves every available transcript across all pages, not just the page you are viewing now.
          </span>
        </div>
        <button type="button" class="ztd-secondary-action" id="ztd-save-page" title="Save only the transcripts available on the current page">Save page</button>
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

    panel.querySelector('#ztd-save-all').addEventListener('click', async () => {
      const settingsNow = await getSettings();
      currentDownloadFolderName = buildDownloadFolderPath(settingsNow.downloadSubfolder);
      stickyPanelMessage = {
        ok: true,
        message: 'Download job is running.',
        detail: 'Keep this tab open while transcripts are captured and saved with final names. You can use Stop to halt after the current item.',
        folderName: currentDownloadFolderName
      };
      currentRunId = `run-${Date.now()}`;
      await startDownloadBatch({ runId: currentRunId, folderName: currentDownloadFolderName, mode: 'direct-save' });
      downloadManifest = [];
      updatePanelSummary();
      saveAllController = { running: true, stopRequested: false };
      setSaveAllRunning(true);
      showToast(`Download job started. Files will be saved in Downloads/${currentDownloadFolderName}.`, 'info', 5000);

      const results = [];
      let plannedEntries = [];
      let pagesVisited = 0;
      let skippedUnavailable = 0;
      let savePageNumber = 1;

      try {
        debugCheckpoint('Resetting to page 1 before planning download', {
          runId: currentRunId,
          folderName: currentDownloadFolderName,
        });
        const reset = await gotoFirstPage();
        if (!reset.ok) {
          debugCheckpoint('Reset to page 1 before planning failed', { error: reset.error });
          return;
        }

        await sleep(800);
        scheduleRescan();

        debugCheckpoint('Planning final filenames across all pages');
        const plan = await collectDownloadPlan(settingsNow);
        if (!plan.ok) {
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
          debugCheckpoint('Reset to page 1 before save pass failed', { error: resetForSave.error });
          return;
        }

        await sleep(800);
        debugCheckpoint('Save pass starting', {
          plannedEntries: plannedEntries.length,
          pagesVisited,
        });

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
            results.push(await saveTranscriptRow(rowsNow[i], pageEntries[i]));
            await sleep(SAVE_ALL_DELAY_MS);
          }

          const moved = await gotoNextPage();
          if (!moved.ok) break;
          savePageNumber += 1;
          debugCheckpoint('Moved to next page for save pass', {
            nextPage: savePageNumber,
          });
          await sleep(800);
        }
      } finally {
        flushPendingTranscriptWaiters(new Error('Download batch finished before transcript capture completed.'));
        await finishDownloadBatch({ runId: currentRunId }).catch(() => {});
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
      const settingsNow = await getSettings();
      const pagination = getPaginationState();
      currentDownloadFolderName = buildDownloadFolderPath(settingsNow.downloadSubfolder);
      stickyPanelMessage = {
        ok: true,
        message: `Saving transcripts from page ${pagination.currentPage}.`,
        detail: 'Only the transcripts visible on this page will be captured and saved.',
        folderName: currentDownloadFolderName
      };
      currentRunId = `run-${Date.now()}`;
      await startDownloadBatch({ runId: currentRunId, folderName: currentDownloadFolderName, mode: 'direct-save-current-page' });
      downloadManifest = [];
      updatePanelSummary();
      saveAllController = { running: true, stopRequested: false };
      setSaveAllRunning(true);
      showToast(`Current-page save started. Files will be saved in Downloads/${currentDownloadFolderName}.`, 'info', 5000);

      try {
        const result = await saveVisiblePage(settingsNow);
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
        flushPendingTranscriptWaiters(new Error('Current-page save finished before transcript capture completed.'));
        await finishDownloadBatch({ runId: currentRunId }).catch(() => {});
        saveAllController.running = false;
        setSaveAllRunning(false);
      }
    });

    panel.querySelector('#ztd-stop-save-all').addEventListener('click', () => {
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
  if (message?.type === 'zoomTranscriptExtension:ping') {
    sendResponse({ ok: true });
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

boot().catch(error => log('Initial boot failed', String(error)));
