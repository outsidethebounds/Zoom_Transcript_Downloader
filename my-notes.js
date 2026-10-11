(() => {
  const NS = 'zoomTranscriptExtension';
  const PANEL_ID = 'ztd-notes-panel';
  const LIST_SELECTOR = '[role="row"][data-row="item"]';
  const sourcesApi = globalThis.ZTDSources;
  if (globalThis.__ztdNotesLoaded) return;
  globalThis.__ztdNotesLoaded = true;
  if (!sourcesApi || !location.pathname.toLowerCase().includes('/allnotes')) return;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const say = (type, payload) => chrome.runtime.sendMessage({ type: NS + ':' + type, payload });
  let stopRequested = false;
  let activeWorker = false;
  let panel;
  function setBusy(busy) { for (const id of ['ztd-notes-selected', 'ztd-notes-page']) { const b = panel?.querySelector('#' + id); if (b) b.disabled = busy; } }
  let pendingExportId = null;
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'ztd-notes-export-metadata' || !pendingExportId) return;
    say('correlateMyNotesExport', { exportId: pendingExportId, url: event.data.url }).catch(() => {});
  });

  function readRows() {
    return [...document.querySelectorAll(LIST_SELECTOR)].map((row, index) => {
      const label = row.getAttribute('aria-label') || '';
      const meta = sourcesApi.parseNoteListLabel(label) || (label.trim() ? { title: label.trim(), dateISO: 'unknown-date', timeHHMM: 'unknown-time' } : null);
      return meta ? { ...meta, id: row.getAttribute('data-ztd-note-id') || '', label, index, row } : null;
    }).filter(Boolean);
  }
  function scrollRoot() {
    let node = document.querySelector(LIST_SELECTOR);
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (node.scrollHeight > node.clientHeight + 40 && /(auto|scroll)/.test(style.overflowY)) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  async function collectNotes(allPages) {
    const root = scrollRoot();
    if (allPages) { root.scrollTop = 0; await sleep(300); }
    const byKey = new Map();
    let unchanged = 0;
    for (let page = 0; page < (allPages ? 1000 : 1); page++) {
      readRows().forEach(note => byKey.set(note.id || note.label, { ...note, row: undefined }));
      if (!allPages) break;
      const before = byKey.size;
      const oldTop = root.scrollTop;
      root.scrollTop = Math.min(root.scrollHeight, root.scrollTop + Math.max(250, Math.floor(root.clientHeight * .7)));
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) window.postMessage({ source: 'ztd-notes-load-more' }, location.origin);
      await sleep(850);
      readRows().forEach(note => byKey.set(note.id || note.label, { ...note, row: undefined }));
      if (byKey.size === before && root.scrollTop === oldTop) unchanged += 1;
      else unchanged = 0;
      if (unchanged >= 2) break;
      if (stopRequested) break;
    }
    return [...byKey.values()];
  }
  function isLoginBlocker() {
    const path = location.pathname.toLowerCase();
    if (/login|signin|sign-in|sso/.test(path)) return true;
    return !!document.querySelector('input[type="password"]');
  }
  function currentNoteId() {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length === 1 && !/allnotes/i.test(parts[0]) ? parts[0] : '';
  }
  async function clickTranscriptDownload(retry = true) {
    const annotated = document.querySelector('button[data-ztd-download-transcript="true"]');
    if (annotated && !annotated.disabled && annotated.getAttribute('aria-disabled') !== 'true') return annotated;
    const candidates = [...document.querySelectorAll('button,[role="button"]')];
    for (const button of candidates) {
      if (!button.getAttribute('aria-describedby') && !button.getAttribute('aria-label') && !button.title) continue;
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') continue;
      if ((button.textContent || '').trim() && !/download/i.test(button.textContent)) continue;
      const rect = button.getBoundingClientRect();
      const pointer = { bubbles: true, pointerType: 'mouse', clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      const describedBy = button.getAttribute('aria-describedby');
      const direct = [button.getAttribute('aria-label'), button.getAttribute('title'), button.getAttribute('data-tooltip')].filter(Boolean).join(' ');
      let help = describedBy ? document.getElementById(describedBy)?.textContent || '' : '';
      if (/download transcript/i.test(direct + ' ' + help)) return button;
      button.dispatchEvent(new PointerEvent('pointerover', pointer));
      button.dispatchEvent(new PointerEvent('pointermove', pointer));
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(800);
      const tip = describedBy ? document.getElementById(describedBy)?.textContent || '' : '';
      // Only this button's tooltip can identify an export control.
      help = tip;
      button.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
      if (/download transcript/i.test(direct + ' ' + help)) return button;
    }
    if (retry && !stopRequested) { await sleep(1500); return clickTranscriptDownload(false); }
    return null;
  }
  // Hidden worker tabs throttle chained timers (eventually to one minute).
  // Route/control readiness is a DOM event, not a sleep/polling budget.
  function waitForDom(read, timeoutMs) {
    return new Promise(resolve => {
      const initial = read();
      if (initial !== null) { resolve(initial); return; }
      let observer;
      let timeout;
      const finish = value => {
        observer?.disconnect();
        clearTimeout(timeout);
        window.removeEventListener('popstate', check);
        resolve(value);
      };
      const check = () => { const value = read(); if (value !== null) finish(value); };
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      window.addEventListener('popstate', check);
      timeout = setTimeout(() => finish(false), timeoutMs);
      check();
    });
  }
  async function waitForRoute(oldPath, timeoutMs = 12000, expectedId = '') {
    return waitForDom(() => {
      if (isLoginBlocker()) return true;
      return location.pathname !== oldPath && (!expectedId || currentNoteId() === expectedId) && !document.querySelector(LIST_SELECTOR) && document.querySelector('button[aria-label^="Rename file (current:"]') ? true : null;
    }, timeoutMs);
  }
  async function waitForList(timeoutMs = 12000) {
    return waitForDom(() => {
      if (isLoginBlocker()) return false;
      return location.pathname.toLowerCase().includes('/allnotes') && document.querySelector(LIST_SELECTOR) && !document.querySelector('button[aria-label^="Rename file (current:"]') ? true : null;
    }, timeoutMs);
  }
  async function transcriptTab() {
    let tab;
    await waitForDom(() => {
      if (stopRequested || isLoginBlocker()) return false;
      tab = [...document.querySelectorAll('button,[role="tab"]')].find(el => (el.textContent || '').trim() === 'Transcript');
      return tab ? true : null;
    }, 12000);
    return tab;
  }
  function status(message) {
    const node = panel?.querySelector('#ztd-notes-status');
    if (node) node.textContent = message;
  }
  function updateResults(result) {
    const node = panel?.querySelector('#ztd-notes-results');
    if (node) node.textContent = JSON.stringify(result, null, 2);
  }
  async function findRowForLabel(label, root, allPages, id = '') {
    // SPA route transitions replace the scroll element; never scroll a detached root.
    root = scrollRoot();
    const current = [...document.querySelectorAll(LIST_SELECTOR)].find(el => id ? el.getAttribute('data-ztd-note-id') === id : el.getAttribute('aria-label') === label);
    if (current) return current;
    root.scrollTop = 0;
    await sleep(300);
    for (let step = 0; step < (allPages ? 300 : 1); step++) {
      const row = [...document.querySelectorAll(LIST_SELECTOR)].find(el => id ? el.getAttribute('data-ztd-note-id') === id : el.getAttribute('aria-label') === label);
      if (row) return row;
      if (!allPages) return null;
      const before = root.scrollTop;
      const jump = Math.max(250, Math.floor(root.clientHeight * 0.7));
      root.scrollTop = Math.min(root.scrollHeight, before + jump);
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) window.postMessage({ source: 'ztd-notes-load-more' }, location.origin);
      await sleep(850);
      if (root.scrollTop === before) {
        // onLoadMore/render may complete after the scroll position stops changing.
        await sleep(850);
        const last = [...document.querySelectorAll(LIST_SELECTOR)].find(el => id ? el.getAttribute('data-ztd-note-id') === id : el.getAttribute('aria-label') === label);
        return last || null;
      }
    }
    return null;
  }
  async function processNotes(config) {
    stopRequested = config.stopRequested === true;
    activeWorker = true;
    const result = { runId: config.runId, source: 'myNotes', saved: 0, skipped: 0, failed: 0, stopped: false, needsUserAction: null, processed: 0, discovered: 0, eligible: 0, pending: 0, skipReasons: {} };
    let entries = [];
    const visited = new Set();
    try {
      status('Waiting for the My Notes list to finish loading.');
      if (!await waitForList(30000)) {
        if (isLoginBlocker()) result.needsUserAction = { url: location.origin + location.pathname, reason: 'Zoom sign-in is required in the dedicated My Notes worker tab.' };
        else { result.failed += 1; result.error = 'My Notes list did not render within 30 seconds.'; }
        return result;
      }
      const allPages = config.mode !== 'page';
      const discoveredRows = config.scope?.notes || (config.scope?.labels ? config.scope.labels.map(label => ({ ...sourcesApi.parseNoteListLabel(label), label })) : await collectNotes(allPages));
      const rows = config.testLimit ? discoveredRows.slice(0, config.testLimit) : discoveredRows;
      result.discovered = rows.length;
      await say('sourceWorkerProgress', { runId: config.runId, message: 'Discovered ' + rows.length + ' notes; checking transcript access.' });
      let root = scrollRoot();
      root.scrollTop = 0;
      const eligible = [];
      for (let index = 0; index < rows.length; index++) {
        if (stopRequested) { result.stopped = true; break; }
        const candidate = rows[index];
        const row = await findRowForLabel(candidate.label, root, true, candidate.id);
        if (!row) throw new Error('My Notes list lookup failed during ' + (entries.length ? 'export' : 'access checking') + '; could not rediscover a planned note. Retry My Notes only.');
        const listPath = location.pathname;
        row.click();
        if (!await waitForRoute(listPath, 12000, candidate.id)) throw new Error('My Notes detail did not render for the planned note during access checking. Retry My Notes only.');
        if (isLoginBlocker()) {
          result.needsUserAction = { url: location.origin + location.pathname, reason: 'Zoom sign-in is required in the dedicated My Notes worker tab.' };
          break;
        }
        const noteId = currentNoteId();
        if (candidate.id && candidate.id !== noteId) { result.failed += 1; history.back(); await waitForList(); root = scrollRoot(); continue; }
        if (!noteId || visited.has(noteId)) { result.skipped += 1; history.back(); await waitForList(); root = scrollRoot(); continue; }
        visited.add(noteId);
        const tab = await transcriptTab();
        const download = tab ? await clickTranscriptDownload() : null;
        if (stopRequested) { result.stopped = true; break; }
        if (isLoginBlocker()) { result.needsUserAction = { url: location.origin + location.pathname, reason: 'Sign in to Zoom in this My Notes worker tab, then retry My Notes only.' }; break; }
        if (!tab || !download) {
          result.skipped += 1;
          const reason = !tab ? 'No transcript access control.' : 'No enabled Download transcript control.';
          result.skipReasons[reason] = (result.skipReasons[reason] || 0) + 1;
        }
        else eligible.push({ ...candidate, id: noteId });
        history.back();
        if (!await waitForList()) {
          if (isLoginBlocker()) { result.needsUserAction = { url: location.origin + location.pathname, reason: 'Sign in to Zoom in this My Notes worker tab, then retry My Notes only.' }; break; }
          throw new Error('My Notes did not return to All notes after a detail visit/export. Retry My Notes only; completed downloads are preserved.');
        }
        root = scrollRoot();
      }
      entries = sourcesApi.collisionSafeNoteFilenames(sourcesApi.dedupeNotes(eligible), { filenamePattern: config.settings?.filenamePattern });
      result.eligible = entries.length;
      if (result.needsUserAction || result.stopped) return result;
      await say('sourceWorkerProgress', { runId: config.runId, message: 'Found ' + entries.length + ' exportable transcripts; skipped ' + result.skipped + '.' });
      root = scrollRoot();
      root.scrollTop = 0;
      for (const entry of entries) {
        if (stopRequested || result.needsUserAction) { result.stopped = stopRequested; break; }
        const row = await findRowForLabel(entry.label, root, true, entry.id);
        if (!row) throw new Error('My Notes list lookup failed during ' + (entries.length ? 'export' : 'access checking') + '; could not rediscover a planned note. Retry My Notes only.');
        const listPath = location.pathname;
        row.click();
        if (!await waitForRoute(listPath, 12000, entry.id)) throw new Error('My Notes detail did not render for the planned note during export. Retry My Notes only.');
        if (isLoginBlocker()) {
          result.needsUserAction = { url: location.origin + location.pathname, reason: 'Zoom sign-in is required in the dedicated My Notes worker tab.' };
          break;
        }
        const noteId = currentNoteId();
        if (!noteId || noteId !== entry.id) { result.skipped += 1; history.back(); await waitForList(); root = scrollRoot(); continue; }
        const tab = await transcriptTab();
        const download = tab ? await clickTranscriptDownload() : null;
        if (!tab || !download) { result.skipped += 1; history.back(); await waitForList(); root = scrollRoot(); continue; }
        if (stopRequested) { result.stopped = true; break; }
        const filename = entry.targetFilename;
        const exportId = 'notes-' + Date.now() + '-' + result.processed;
        const armed = await say('expectMyNotesExport', { exportId, filename, folderPath: config.folderPath });
        if (!armed?.ok) throw new Error('My Notes export could not be armed: ' + (armed?.error || 'worker unavailable') + '. Retry My Notes only.');
        status('My Notes: exporting ' + filename);
        const finishedPromise = new Promise(resolve => {
          const timeout = setTimeout(() => { chrome.runtime.onMessage.removeListener(listener); resolve({ ok: false, timedOut: true }); }, 35000);
          const listener = message => {
            if (message?.type !== NS + ':myNotesExportFinished' || message.payload?.exportId !== exportId) return;
            clearTimeout(timeout); chrome.runtime.onMessage.removeListener(listener); resolve(message.payload);
          };
          chrome.runtime.onMessage.addListener(listener);
        });
        pendingExportId = exportId;
        download.click();
        const finished = await finishedPromise;
        pendingExportId = null;
        await say('clearMyNotesExport', { exportId });
        result.processed += 1;
        if (finished.ok) result.saved += 1;
        else if (finished.timedOut && isLoginBlocker()) result.needsUserAction = { url: location.origin + location.pathname, reason: 'My Notes export is blocked by a sign-in or permission prompt.' };
        else { result.failed += 1; result.error = finished.error || 'My Notes download was interrupted.'; if (finished.timedOut) { result.error = 'Export did not complete in time; stopped to avoid attributing a late download to another note.'; break; } }
        await say('sourceWorkerProgress', { runId: config.runId, message: 'Saved ' + result.saved + ', skipped ' + result.skipped + ', failed ' + result.failed + '.' });
        history.back();
        if (!await waitForList()) {
          if (isLoginBlocker()) { result.needsUserAction = { url: location.origin + location.pathname, reason: 'Sign in to Zoom in this My Notes worker tab, then retry My Notes only.' }; break; }
          throw new Error('My Notes did not return to All notes after a detail visit/export. Retry My Notes only; completed downloads are preserved.');
        }
        root = scrollRoot();
      }
    } catch (error) {
      result.failed += 1;
      result.error = String(error);
    } finally {
      result.pending = Math.max(0, result.discovered - result.saved - result.skipped - result.failed);
      result.stopped = result.stopped || stopRequested;
      activeWorker = false;
      if (config.worker) await say('sourceWorkerCompleted', result);
      status(result.stopped ? 'Stopped.' : 'My Notes batch finished.');
      updateResults({ myNotes: result });
    }
    return result;
  }
  function addPanel() {
    if (panel || activeWorker) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = '<strong>Zoom Transcript Downloader</strong><div class="ztd-source-options"><label><input type="checkbox" id="ztd-source-recordings"> Recording transcripts</label><label><input type="checkbox" id="ztd-source-notes"> My Notes transcripts</label></div><div class="ztd-source-actions"><button type="button" id="ztd-notes-selected">Save selected sources</button><button type="button" id="ztd-notes-page">Save this page</button><button type="button" id="ztd-notes-stop">Stop</button></div><div id="ztd-notes-status">Ready</div><pre id="ztd-notes-results"></pre>';
    document.body.appendChild(panel);
    const recording = panel.querySelector('#ztd-source-recordings');
    const notes = panel.querySelector('#ztd-source-notes');
    chrome.storage.local.get({ sources: sourcesApi.DEFAULT_SOURCES }).then(({ sources }) => {
      const value = sourcesApi.normalizeSources(sources);
      recording.checked = value.recordings;
      notes.checked = value.myNotes;
    });
    const save = () => chrome.storage.local.set({ sources: { recordings: recording.checked, myNotes: notes.checked } });
    recording.addEventListener('change', save);
    notes.addEventListener('change', save);
    panel.querySelector('#ztd-notes-selected').addEventListener('click', async () => {
      await save();
      const settings = await chrome.storage.local.get({ filenamePattern: '{date} - {time} - {title}', downloadSubfolder: '' });
      const selected = sourcesApi.orderedSources({ recordings: recording.checked, myNotes: notes.checked });
      setBusy(!!selected.length);
      status(selected.length ? 'Starting selected sources…' : 'Select at least one source.');
      const reply = await say('startSourceRun', { selected, settings, currentSource: 'myNotes', mode: 'all', originUrl: location.href });
      if (!reply?.ok) { setBusy(false); status(reply?.error || 'Could not start the batch.'); }
    });
    panel.querySelector('#ztd-notes-page').addEventListener('click', async () => {
      const settings = await chrome.storage.local.get({ filenamePattern: '{date} - {time} - {title}', downloadSubfolder: '' });
      setBusy(true);
      const reply = await say('startSourceRun', { selected: ['myNotes'], settings, currentSource: 'myNotes', mode: 'page', originUrl: location.href, scope: { notes: readRows().map(({ row, ...meta }) => meta) } });
      if (!reply?.ok) { setBusy(false); status(reply?.error || 'Could not start the batch.'); }
    });
    panel.querySelector('#ztd-notes-stop').addEventListener('click', () => { stopRequested = true; say('stopSourceRun'); status('Stop requested; finishing current export.'); });
    return panel;
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === NS + ':ping') { sendResponse({ ok: true }); return false; }
    if (message?.type === NS + ':openPanel') { addPanel(); sendResponse({ ok: true }); return false; }
    if (message?.type === NS + ':workerStartMyNotes') {
      activeWorker = true;
      panel?.remove(); panel = null;
      sendResponse({ ok: true });
      processNotes({ ...message.payload, worker: true }).catch(() => {});
      return false;
    }
    if (message?.type === NS + ':sourceRunProgress') {
      status((message.payload?.source === 'myNotes' ? 'My Notes: ' : 'Recordings: ') + (message.payload?.message || message.payload?.state || 'Working'));
      return false;
    }
    if (message?.type === NS + ':sourceRunFinished' || message?.type === NS + ':sourceRunPaused') {
      const payload = message.payload || {};
      setBusy(false);
      status(payload.needsUserAction ? 'Action needed: ' + payload.needsUserAction.reason + ' (' + payload.needsUserAction.url + ')' : payload.results?.myNotes?.error ? 'My Notes failed: ' + payload.results.myNotes.error : 'Batch finished.');
      updateResults({ sources: payload.results || {}, needsUserAction: payload.needsUserAction || null, folder: payload.folderName });
      return false;
    }
    if (message?.type === NS + ':stopSourceWorker') { stopRequested = true; sendResponse({ ok: true }); return false; }
  });
  addPanel();
})();
