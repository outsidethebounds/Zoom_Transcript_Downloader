const EXTENSION_NS = 'zoomTranscriptExtension';
const PANEL_ID = 'ztd-panel';
const LAUNCHER_ID = 'ztd-launcher';
const SETTINGS_MODAL_ID = 'ztd-settings-modal';
const PATTERN_HELP_MODAL_ID = 'ztd-pattern-help-modal';
const ROW_SELECTOR = 'tr.zoom-virtual-table__row';
const DOWNLOAD_BUTTON_SELECTOR = 'button[aria-label^="Download "]';
const SAVE_ALL_DELAY_MS = 1500;

let lastRows = [];
let logLines = [];
let currentSettings = null;
let saveAllController = { running: false, stopRequested: false };
let downloadManifest = [];
let rescanTimer = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(message, extra) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}${extra ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`;
  logLines.unshift(line);
  logLines = logLines.slice(0, 120);
  const el = document.getElementById('ztd-log');
  if (el) el.textContent = logLines.join('\n');
  console.log('[ZTD]', message, extra || '');
}

function sanitizeTitle(title) {
  return (title || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '') || 'Untitled Meeting';
}

function parseRowText(text) {
  const compact = (text || '').replace(/\s+/g, ' ').trim();
  const match = compact.match(/^(.*?)\s+(\d{3}\s\d{4}\s\d{4})\s+\S+@\S+\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)\s+\d+\s+days\s+Download\s+Delete$/);
  if (!match) return null;
  return {
    title: match[1].trim(),
    meetingId: match[2].replace(/\s+/g, ''),
    dateText: match[3].trim(),
  };
}

function sampleMeta() {
  return {
    title: 'Weekly Sync',
    meetingId: '12345678901',
    dateText: 'Apr 4, 2026 9:30 AM',
  };
}

function dateParts(dateText) {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return { date: 'unknown-date', time: 'unknown-time' };
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

function buildFilename(meta, settings) {
  const { date, time } = dateParts(meta.dateText);
  let base = (settings.filenamePattern || '{date} - {time} - {title}')
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
    .replaceAll('{title}', sanitizeTitle(meta.title))
    .replaceAll('{meetingId}', meta.meetingId || '');
  base = base.replace(/\s+/g, ' ').trim();
  return `${base}.txt`;
}

function collectRows() {
  const rows = [...document.querySelectorAll(ROW_SELECTOR)].map((row, index) => {
    const button = row.querySelector(DOWNLOAD_BUTTON_SELECTOR);
    const text = (row.innerText || '').trim();
    const meta = parseRowText(text);
    return { index, key: row.getAttribute('data-key') || '', text, meta, hasDownload: !!button, button, row };
  }).filter(r => r.hasDownload && r.meta);
  lastRows = rows;
  return rows;
}

function transcriptCountText() {
  const body = document.body.innerText || '';
  const m = body.match(/(\d+)\s+result\(s\)/i);
  return m ? Number(m[1]) : null;
}

function currentPageNumber() {
  const body = document.body.innerText || '';
  const m = body.match(/Page\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

async function getSettings() { return await chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:getSettings` }); }
async function setSettings(settings) { return await chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:setSettings`, settings }); }

function installPageHook() {
  if (window.__ztdInjectedScript) return;
  window.__ztdInjectedScript = true;
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-hook.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
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

function setStatus(rows) {
  const rowsEl = document.getElementById('ztd-status-rows');
  const total = transcriptCountText();
  const shown = rows.length;
  if (rowsEl) rowsEl.textContent = total ? `${shown}/${total} transcripts` : `${shown} transcript${shown === 1 ? '' : 's'}`;
}

function applyDebugVisibility() {
  const enabled = !!document.getElementById('ztd-debug-toggle')?.checked;
  const wrap = document.getElementById('ztd-debug-wrap');
  if (wrap) wrap.hidden = !enabled;
}

function setSaveAllRunning(isRunning) {
  const saveAll = document.getElementById('ztd-save-all');
  const stop = document.getElementById('ztd-stop-save-all');
  const gen = document.getElementById('ztd-generate-kit-main');
  if (saveAll) saveAll.disabled = isRunning;
  if (gen) gen.disabled = isRunning;
  if (stop) {
    stop.disabled = !isRunning;
    stop.classList.toggle('ztd-active', isRunning);
  }
}

function updatePanelSummary() {
  const out = document.getElementById('ztd-output');
  if (!out || !currentSettings) return;
  out.textContent = JSON.stringify({
    url: location.href,
    visibleRows: lastRows.length,
    totalAvailable: transcriptCountText(),
    currentPage: currentPageNumber(),
    targetOs: currentSettings.targetOs,
    downloadedEntriesTracked: downloadManifest.length,
    perItemDelayMs: SAVE_ALL_DELAY_MS,
    note: 'Use Save all available to trigger downloads across all pages, then Generate rename kit.'
  }, null, 2);
}

function scheduleRescan() {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    const rows = collectRows();
    setStatus(rows);
    updatePanelSummary();
  }, 250);
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
        <pre id="ztd-pattern-help-output"></pre>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#ztd-pattern-help-close').addEventListener('click', () => { modal.hidden = true; });
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
        <div class="ztd-settings-actions">
          <strong>Zoom Downloader Settings</strong>
          <button type="button" class="ztd-secondary" id="ztd-settings-close">Close</button>
        </div>
        <label>Filename pattern <button type="button" class="ztd-secondary" id="ztd-pattern-help">?</button>
          <input type="text" id="ztd-settings-pattern" />
        </label>
        <div><strong>Example output:</strong> <span id="ztd-pattern-example"></span></div>
        <label>Target OS
          <select id="ztd-settings-os">
            <option value="macos">macOS</option>
            <option value="windows">Windows</option>
          </select>
        </label>
        <div class="ztd-settings-actions">
          <button type="button" id="ztd-settings-save">Save settings</button>
        </div>
        <pre id="ztd-settings-output"></pre>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#ztd-settings-close').addEventListener('click', () => { modal.hidden = true; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
    modal.querySelector('#ztd-pattern-help').addEventListener('click', () => {
      const help = ensurePatternHelpModal();
      const pattern = modal.querySelector('#ztd-settings-pattern').value || '{date} - {time} - {title}';
      help.querySelector('#ztd-pattern-help-output').textContent = JSON.stringify({ pattern, example: buildFilename(sampleMeta(), { filenamePattern: pattern }), examples: ['{date} - {time} - {title}','{date} - {title}','{date} - {time} - {title} - {meetingId}'] }, null, 2);
      help.hidden = false;
    });
    modal.querySelector('#ztd-settings-pattern').addEventListener('input', () => {
      const pattern = modal.querySelector('#ztd-settings-pattern').value || '{date} - {time} - {title}';
      modal.querySelector('#ztd-pattern-example').textContent = buildFilename(sampleMeta(), { filenamePattern: pattern });
    });
    modal.querySelector('#ztd-settings-save').addEventListener('click', async () => {
      const settings = { filenamePattern: modal.querySelector('#ztd-settings-pattern').value, targetOs: modal.querySelector('#ztd-settings-os').value };
      await setSettings(settings);
      currentSettings = { ...(currentSettings || {}), ...settings };
      modal.querySelector('#ztd-settings-output').textContent = JSON.stringify({ ok: true, settings }, null, 2);
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
  modal.querySelector('#ztd-settings-os').value = settings.targetOs || 'macos';
  modal.querySelector('#ztd-pattern-example').textContent = buildFilename(sampleMeta(), settings);
  modal.querySelector('#ztd-settings-output').textContent = JSON.stringify(settings, null, 2);
  return modal;
}

async function triggerZoomDownload(item, settings) {
  item.button.click();
  const entry = {
    title: item.meta.title,
    meetingId: item.meta.meetingId,
    dateText: item.meta.dateText,
    targetFilename: buildFilename(item.meta, settings),
    downloadedAt: new Date().toISOString(),
    rowKey: item.key,
    page: currentPageNumber(),
  };
  downloadManifest.push(entry);
  updatePanelSummary();
  log('Triggered Zoom browser download', entry);
  return { ok: true, browserDownloadTriggered: true, targetFilename: entry.targetFilename };
}

function findNextPageButton() {
  return document.querySelector('button.btn-next[aria-label="Next page"][aria-disabled="false"]')
    || document.querySelector('button.btn-next[aria-label="Next page"]:not([aria-disabled="true"])');
}

async function gotoNextPage() {
  const next = findNextPageButton();
  const currentPage = currentPageNumber();
  const beforeKeys = collectRows().map(r => r.key).join('|');
  if (!next || next.disabled) {
    log('No usable next-page button found', { currentPage, disabled: next?.disabled ?? null });
    return false;
  }

  log('Attempting next-page navigation', { currentPage, aria: next.getAttribute('aria-label') || '', text: (next.textContent || '').trim() });
  next.click();

  for (let i = 0; i < 24; i++) {
    await sleep(500);
    const afterPage = currentPageNumber();
    const afterRows = collectRows();
    const afterKeys = afterRows.map(r => r.key).join('|');
    if ((afterPage && currentPage && afterPage !== currentPage) || (afterKeys && afterKeys !== beforeKeys)) {
      log('Next-page navigation succeeded', { from: currentPage, to: afterPage, rows: afterRows.length });
      scheduleRescan();
      return true;
    }
  }

  log('Next-page navigation timed out', { currentPage });
  return false;
}

function generateMacScript(entries) {
  const lines = ['#!/bin/bash', 'set -euo pipefail', '', 'echo "Renaming Zoom transcript files in $(pwd)"', ''];
  entries.forEach((entry, index) => {
    const n = index + 1;
    lines.push(`src=$(ls -1t *.txt | sed -n '${n}p')`);
    lines.push(`if [ -z "$src" ]; then echo "Missing expected source file for entry ${n}"; exit 1; fi`);
    lines.push(`mv -n "$src" ${JSON.stringify(entry.targetFilename)}`);
    lines.push(`echo "Renamed $src -> ${entry.targetFilename.replace(/"/g, '\\"')}"`);
    lines.push('');
  });
  return lines.join('\n') + '\n';
}

function generatePowerShellScript(entries) {
  const lines = ['$files = Get-ChildItem -File *.txt | Sort-Object LastWriteTime -Descending', '$index = 0', ''];
  entries.forEach(entry => {
    lines.push('if ($index -ge $files.Count) { throw "Missing expected source file" }');
    lines.push(`Rename-Item -LiteralPath $files[$index].FullName -NewName ${JSON.stringify(entry.targetFilename)}`);
    lines.push('$index++');
    lines.push('');
  });
  return lines.join('\r\n') + '\r\n';
}

async function generateRenameKit() {
  const settings = await getSettings();
  if (!downloadManifest.length) {
    return { ok: false, error: 'No downloaded transcript entries have been tracked yet. Use Save all available first.' };
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestName = `zoom-transcript-manifest-${timestamp}.json`;
  const scriptName = settings.targetOs === 'windows' ? 'rename_zoom_transcripts.ps1' : 'rename_zoom_transcripts.sh';
  const scriptMime = settings.targetOs === 'windows' ? 'text/plain;charset=utf-8' : 'application/x-sh;charset=utf-8';
  const scriptContent = settings.targetOs === 'windows' ? generatePowerShellScript(downloadManifest) : generateMacScript(downloadManifest);
  const instructions = settings.targetOs === 'windows'
    ? ['Open PowerShell in the download folder', 'Run: powershell -ExecutionPolicy Bypass -File .\\rename_zoom_transcripts.ps1']
    : ['Open Terminal in the download folder', 'Run: chmod +x rename_zoom_transcripts.sh', 'Then: ./rename_zoom_transcripts.sh'];

  const manifestPayload = { generatedAt: new Date().toISOString(), targetOs: settings.targetOs, instructions, entries: downloadManifest };

  const manifestResult = await chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:downloadArtifact`, payload: { filename: manifestName, content: JSON.stringify(manifestPayload, null, 2), mimeType: 'application/json;charset=utf-8' } });
  const scriptResult = await chrome.runtime.sendMessage({ type: `${EXTENSION_NS}:downloadArtifact`, payload: { filename: scriptName, content: scriptContent, mimeType: scriptMime } });
  return { ok: !!(manifestResult?.ok && scriptResult?.ok), manifestResult, scriptResult, instructions, entries: downloadManifest.length };
}

function renderPanel(rows, settings) {
  let panel = document.getElementById(PANEL_ID);
  ensureSettingsModal();
  ensurePatternHelpModal();
  if (!panel) {
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.classList.add('ztd-collapsed');
    panel.innerHTML = `
      <div class="ztd-header">
        <div class="ztd-header-left">
          <strong>Zoom Transcript Downloader</strong>
          <span id="ztd-status-rows" class="ztd-pill">0 transcripts</span>
        </div>
        <div class="ztd-header-right">
          <button type="button" class="ztd-secondary ztd-gear-icon" id="ztd-settings">⚙</button>
          <button type="button" class="ztd-secondary" id="ztd-collapse">Expand</button>
          <button type="button" class="ztd-secondary" id="ztd-close">Close</button>
        </div>
      </div>
      <div class="ztd-controls">
        <button type="button" id="ztd-save-all">Save all available</button>
        <button type="button" id="ztd-generate-kit-main">Generate rename kit</button>
        <button type="button" class="ztd-secondary" id="ztd-stop-save-all">Stop</button>
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
    panel.querySelector('#ztd-collapse').addEventListener('click', event => {
      panel.classList.toggle('ztd-collapsed');
      event.currentTarget.textContent = panel.classList.contains('ztd-collapsed') ? 'Expand' : 'Collapse';
    });
    panel.querySelector('#ztd-debug-toggle').addEventListener('change', applyDebugVisibility);

    async function runGenerateKit() {
      const result = await generateRenameKit();
      panel.querySelector('#ztd-output').textContent = JSON.stringify(result.ok ? {
        message: 'Rename kit generated.',
        instructions: result.instructions,
        entries: result.entries,
        manifestDownload: result.manifestResult,
        scriptDownload: result.scriptResult
      } : result, null, 2);
    }

    panel.querySelector('#ztd-generate-kit-main').addEventListener('click', runGenerateKit);

    panel.querySelector('#ztd-save-all').addEventListener('click', async () => {
      const settingsNow = await getSettings();
      downloadManifest = [];
      updatePanelSummary();
      saveAllController = { running: true, stopRequested: false };
      setSaveAllRunning(true);
      const results = [];
      let pagesVisited = 0;
      try {
        while (true) {
          const rowsNow = collectRows();
          pagesVisited += 1;
          log('Processing page', { page: currentPageNumber(), rows: rowsNow.length, pagesVisited });
          if (!rowsNow.length) break;
          for (let i = 0; i < rowsNow.length; i++) {
            if (saveAllController.stopRequested) {
              results.push({ stopped: true, page: currentPageNumber(), processed: downloadManifest.length });
              panel.querySelector('#ztd-output').textContent = JSON.stringify(results, null, 2);
              return;
            }
            results.push(await triggerZoomDownload(rowsNow[i], settingsNow));
            await sleep(SAVE_ALL_DELAY_MS);
          }
          const moved = await gotoNextPage();
          if (!moved) break;
          await sleep(1000);
        }
      } finally {
        saveAllController.running = false;
        setSaveAllRunning(false);
      }
      panel.querySelector('#ztd-output').textContent = JSON.stringify({ pagesVisited, downloaded: downloadManifest.length, results }, null, 2);
    });

    panel.querySelector('#ztd-stop-save-all').addEventListener('click', () => {
      if (saveAllController.running) {
        saveAllController.stopRequested = true;
        panel.querySelector('#ztd-output').textContent = 'Stop requested. Will halt after the current download trigger.';
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
  if (verbose) log('Panel ready', { rows: rows.length, total: transcriptCountText(), page: currentPageNumber(), targetOs: settings.targetOs, tracked: downloadManifest.length, delayMs: SAVE_ALL_DELAY_MS });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'zoomTranscriptExtension:openPanel') {
    boot(true).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

const observer = new MutationObserver(() => {
  scheduleRescan();
  if (!document.getElementById(PANEL_ID)) ensureLauncher();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
boot().catch(error => log('Initial boot failed', String(error)));
