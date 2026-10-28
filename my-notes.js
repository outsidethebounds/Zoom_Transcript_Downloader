(() => {
  const NS = 'zoomTranscriptExtension';
  const recordingCapability = globalThis.ZTDRecordingCapability;
  const PANEL_ID = 'ztd-notes-panel';
  const LIST_SELECTOR = '[role="row"][data-row="item"]';
  const sourcesApi = globalThis.ZTDSources;
  if (globalThis.__ztdNotesLoaded) return;
  globalThis.__ztdNotesLoaded = true;
  if (!sourcesApi || !location.pathname.toLowerCase().includes('/allnotes')) return;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const say = (type, payload) => chrome.runtime.sendMessage({ type: NS + ':' + type, payload });
  let stopRequested = false;
  let guidedNotesScanStopped = false;
  let activeWorker = false;
  let activeWorkerRunId = null;
  let guidedWorkspace = false;
  let guidedWorkspaceStateVersion = 0;
  function shouldApplyInitialGuidedTabState(versionAtRequest) { return guidedWorkspaceStateVersion === versionAtRequest; }
  let panel;
  function setBusy(busy) { for (const id of ['ztd-notes-selected', 'ztd-notes-page']) { const b = panel?.querySelector('#' + id); if (b) b.disabled = busy; } }
  let pendingExportId = null;
  let cancelDirect = null;
  let notesPaginationState = null;
  let lastCollectedNotes = [];
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source === 'ztd-notes-pagination-result' && data.payload && typeof data.payload.sequence === 'number') notesPaginationState = data.payload;
  });
  function requestNotesPaginationState(timeoutMs = 5000) {
    return new Promise(resolve => {
      const requestId = 'notes-state-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const finish = value => { clearTimeout(timer); window.removeEventListener('message', listener); resolve(value); };
      const listener = event => {
        if (event.source === window && event.origin === location.origin && event.data?.source === 'ztd-notes-pagination-state' && event.data.requestId === requestId) finish(event.data.payload || null);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      window.addEventListener('message', listener);
      window.postMessage({ source: 'ztd-notes-pagination-probe', requestId }, location.origin);
    });
  }
  function waitForNotesPaginationAfter(sequence, timeoutMs = 15000) {
    if (notesPaginationState?.sequence > sequence) return Promise.resolve(notesPaginationState);
    return new Promise(resolve => {
      const finish = value => { clearTimeout(timer); window.removeEventListener('message', listener); resolve(value); };
      const listener = event => {
        const state = event.data?.payload;
        if (event.source === window && event.origin === location.origin && event.data?.source === 'ztd-notes-pagination-result' && state?.sequence > sequence) finish(state);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      window.addEventListener('message', listener);
      if (notesPaginationState?.sequence > sequence) finish(notesPaginationState);
    });
  }
  function requestDirect(fileId) {
    if (stopRequested) return Promise.resolve({ kind: 'cancelled' });
    return new Promise(resolve => {
      const requestId = 'direct-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      let timer;
      const finish = value => { clearTimeout(timer); window.removeEventListener('message', listener); cancelDirect = null; resolve(value); };
      const listener = event => {
        if (event.source === window && event.data?.source === 'ztd-notes-direct-response' && event.data.requestId === requestId) finish(event.data);
      };
      cancelDirect = () => { window.postMessage({ source: 'ztd-notes-direct-request', action: 'cancel', requestId }, location.origin); finish({ kind: 'cancelled' }); };
      window.addEventListener('message', listener);
      // Accommodates two bounded Retry-After waits; timeout is a failure, never
      // an invitation to click a native export while a request may still finish.
      timer = setTimeout(() => { window.postMessage({ source: 'ztd-notes-direct-request', action: 'cancel', requestId }, location.origin); finish({ kind: 'failed' }); }, 150000);
      window.postMessage({ source: 'ztd-notes-direct-request', requestId, fileId }, location.origin);
    });
  }
  async function saveDirect(entry, config) {
    for (let refresh = 0; refresh < 2; refresh++) {
      const response = await requestDirect(entry.id);
      if (stopRequested) return { kind: 'cancelled' };
      if (response.kind !== 'ready') return response;
      if (response.expiresAt <= Date.now() + 1000) {
        if (!refresh) continue;
        return { kind: 'failed' };
      }
      const saved = await say('saveMyNotesDirect', { exportId: config.runId + ':' + entry.id, url: response.url, expiresAt: response.expiresAt, filename: entry.targetFilename, folderPath: config.folderPath });
      if (saved?.ok) return { kind: 'saved' };
      if (saved?.cancelled || stopRequested) return { kind: 'cancelled' };
      if (saved?.expired && !refresh) continue;
      return { kind: 'failed', error: saved?.error || undefined, needsUserAction: saved?.needsUserAction === true };
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'ztd-notes-export-metadata' || !pendingExportId) return;
    say('correlateMyNotesExport', { exportId: pendingExportId, url: event.data.url }).catch(() => {});
  });

  function readRows() {
    return [...document.querySelectorAll(LIST_SELECTOR)].map((row, index) => {
      const label = row.getAttribute('aria-label') || '';
      const labelMeta = sourcesApi.parseNoteListLabel(label);
      // The third cell is Zoom's Date created column. Read only that cell so
      // an exact title or relative Last modified label can never masquerade
      // as the note's creation date.
      const dateCell = row.querySelectorAll?.('[role="cell"]')?.[2];
      const exactTimestamp = sourcesApi.parseNoteListTimestamp(dateCell?.innerText || dateCell?.textContent || '');
      const meta = labelMeta || (label.trim()
        ? { title: label.trim(), dateISO: exactTimestamp?.dateISO || 'unknown-date', timeHHMM: exactTimestamp?.timeHHMM || 'unknown-time' }
        : null);
      return meta ? { ...meta, id: row.getAttribute('data-ztd-note-id') || '', occurrenceId: row.getAttribute('data-ztd-occurrence-id') || '', label, index, row } : null;
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
    if (!allPages) return readRows().map(note => ({ ...note, row: undefined }));
    root.scrollTop = 0;
    let state = await requestNotesPaginationState();
    const byKey = new Map();
    const collectVisible = () => readRows().forEach(note => { const key = note.id || note.label; if (key) byKey.set(key, { ...note, row: undefined }); });
    const waitForCollectedCount = expectedCount => {
      collectVisible();
      if (byKey.size >= expectedCount) return Promise.resolve(byKey.size === expectedCount);
      return new Promise(resolve => {
        let timer;
        let observer;
        let settled = false;
        const finish = matched => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          observer?.disconnect();
          resolve(matched);
        };
        observer = new MutationObserver(() => {
          collectVisible();
          if (byKey.size >= expectedCount) finish(byKey.size === expectedCount);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        timer = setTimeout(() => { collectVisible(); finish(byKey.size === expectedCount); }, 5000);
        collectVisible();
        if (byKey.size >= expectedCount) finish(byKey.size === expectedCount);
      });
    };
    const waitForDomChange = timeoutMs => new Promise(resolve => {
      let settled = false;
      let timer;
      const observer = new MutationObserver(() => finish(true));
      const finish = changed => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(changed);
      };
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      timer = setTimeout(() => finish(false), timeoutMs);
    });
    const fail = message => { const error = new Error(message); error.partialNotes = [...byKey.values()]; throw error; };
    if (!state?.valid || state.method !== 'GET' || state.path !== '/api/file/meeting_notes/my_notes' || state.status !== 200 || !Array.isArray(state.requestKeys) || !state.requestKeys.includes('pageSize') || !Number.isFinite(state.totalRows)) fail('The authenticated My Notes API pagination state is unavailable; scan is incomplete.');
    notesPaginationState = state;
    lastCollectedNotes = [];
    // Zoom can render the complete list before this content script starts. If
    // the API has already confirmed its terminal cursor, reconcile those rows
    // immediately instead of forcing scroll/timer cycles in a throttled tab.
    collectVisible();
    if (state.nextPageTokenPresent === false && byKey.size === state.totalRows) {
      lastCollectedNotes = [...byKey.values()];
      return lastCollectedNotes;
    }
    for (let steps = 0; steps < 10000; steps++) {
      if (stopRequested || guidedNotesScanStopped) fail('Scan stopped before the My Notes cursor reached its terminal page.');
      collectVisible();
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
      if (atBottom && state.nextPageTokenPresent === false) {
        // The MAIN-world hook observes the API response before Zoom's React list
        // necessarily commits the corresponding rows. Let that DOM update settle
        // before declaring the terminal inventory count inconsistent.
        if (byKey.size !== state.totalRows && !(await waitForCollectedCount(state.totalRows))) fail('My Notes terminal page count did not match the unique metadata rows collected.');
        lastCollectedNotes = [...byKey.values()];
        return lastCollectedNotes;
      }
      if (atBottom && state.nextPageTokenPresent === true) {
        const previousSequence = state.sequence;
        window.postMessage({ source: 'ztd-notes-load-more' }, location.origin);
        const next = await waitForNotesPaginationAfter(previousSequence);
        if (!next?.valid || next.method !== 'GET' || next.path !== '/api/file/meeting_notes/my_notes' || next.status !== 200 || !Number.isFinite(next.totalRows)) fail('My Notes next-page request did not return a verified page.');
        if (next.sequence <= previousSequence || next.totalRows < state.totalRows || (next.totalRows === state.totalRows && next.nextPageTokenPresent)) fail('My Notes pagination repeated or made no progress; scan is incomplete.');
        state = next;
        notesPaginationState = state;
        continue;
      }
      const oldTop = root.scrollTop;
      root.scrollTop = Math.min(root.scrollHeight, root.scrollTop + Math.max(250, Math.floor(root.clientHeight * .7)));
      root.dispatchEvent(new Event('scroll', { bubbles: true }));
      // Mutation notification is the normal path; keep the no-mutation fallback
      // short so virtualized/pre-rendered rows do not pay seconds per scroll.
      if (root.scrollTop !== oldTop) await waitForDomChange(750);
      collectVisible();
      if (root.scrollTop === oldTop && !(root.scrollTop + root.clientHeight >= root.scrollHeight - 2)) fail('My Notes list stopped before its API terminal signal.');
    }
    fail('My Notes exceeded the safe page/scroll limit before terminal confirmation.');
  }
  async function scanGuidedNotes() {
    guidedNotesScanStopped = false;
    if (isLoginBlocker()) return { ok: false, needsUserAction: true, error: 'Sign in to My Notes in this tab, then rescan.' };
    const keyword = document.querySelector('input[placeholder*="Search keywords"]');
    const dateFilter = [...document.querySelectorAll('[role="combobox"]')].find(el => (el.getAttribute('aria-label') || '').toLowerCase() === 'date');
    if (!keyword || !dateFilter) return { ok: false, error: 'Could not verify My Notes search/date filters; scan is incomplete.' };
    if ((keyword.value || '').trim() || (dateFilter.innerText || '').trim() !== 'Date') return { ok: false, error: 'Clear My Notes search and date filters to scan the complete list.' };
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !document.querySelector(LIST_SELECTOR)) {
      if (isLoginBlocker()) return { ok: false, needsUserAction: true, error: 'Sign in to My Notes in this tab, then rescan.' };
      await sleep(300);
    }
    if (isLoginBlocker()) return { ok: false, needsUserAction: true, error: 'Sign in to My Notes in this tab, then rescan.' };
    let discoveredRows;
    try { discoveredRows = await collectNotes(true); }
    catch (error) {
      const partial = Array.isArray(error.partialNotes) ? error.partialNotes : lastCollectedNotes;
      const assets = partial.map(item => ({ sourceId: item.id || item.label, occurrenceId: item.occurrenceId || '', title: item.title || 'Untitled transcript', date: item.dateISO || '', available: null, availabilityReason: 'Availability is not probed during discovery; it will be confirmed only during an explicit save.' }));
      return { ok: false, incomplete: true, stopped: guidedNotesScanStopped || stopRequested, error: String(error?.message || error), assets, count: assets.length, pages: notesPaginationState?.pages || 0, exhausted: false };
    }
    const assets = discoveredRows.map(item => ({ sourceId: item.id || item.label, occurrenceId: item.occurrenceId || '', title: item.title || 'Untitled transcript', date: item.dateISO || '', available: null, availabilityReason: 'Availability is not probed during discovery; it will be confirmed only during an explicit save.' }));
    const state = notesPaginationState;
    if (!state?.valid || state.nextPageTokenPresent !== false || assets.length !== state.totalRows) return { ok: false, incomplete: true, error: 'My Notes cursor did not reach an authoritative terminal page with a matching inventory count.', assets, count: assets.length, pages: state?.pages || 0, exhausted: false };
    return { ok: true, assets, count: assets.length, pages: state.pages, exhausted: true, listOrigin: location.origin };
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
  function notesPending(config, result) {
    const total = Number.isFinite(config.total) ? config.total : result.discovered;
    return Math.max(0, total - result.saved - result.skipped - result.failed);
  }
  async function processNotes(config) {
    stopRequested = config.stopRequested === true;
    activeWorker = true;
    activeWorkerRunId = config.runId || null;
    const result = { runId: config.runId, source: 'myNotes', saved: 0, skipped: 0, failed: 0, stopped: false, needsUserAction: null, processed: 0, discovered: 0, eligible: 0, directSaved: 0, fallbackSaved: 0, pending: 0, skipReasons: {} };
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
      await say('sourceWorkerProgress', { runId: config.runId, progress: { ...result, pending: notesPending(config, result) }, message: 'Discovered ' + rows.length + ' notes; checking transcript access.' });
      // Plan filenames from every discovered item, before access filtering.
      // Unknown permission metadata is not a denial; export/UI decides access.
      const planned = new Map();
      for (const row of rows) { const key = row.id || row.label; if (!planned.has(key)) planned.set(key, row); }
      entries = sourcesApi.collisionSafeNoteFilenames([...planned.values()], { filenamePattern: config.settings?.filenamePattern });
      result.discovered = entries.length;
      let directAvailable = true;
      let root = scrollRoot();
      for (const entry of entries) {
        if (stopRequested || result.needsUserAction) { result.stopped = stopRequested; break; }
        if (visited.has(entry.id || entry.label)) continue;
        visited.add(entry.id || entry.label);
        if (entry.id && directAvailable) {
          const direct = await saveDirect(entry, config);
          if (isLoginBlocker()) { result.needsUserAction = { url: location.origin + '/allNotes', reason: 'Zoom sign-in is required in the dedicated My Notes worker tab.' }; break; }
          if (direct.kind === 'unavailable') directAvailable = false;
          else {
            if (direct.kind === 'cancelled') { result.stopped = true; break; }
            if (direct.kind === 'login') { result.needsUserAction = { url: location.origin + '/allNotes', reason: 'Zoom sign-in is required in the dedicated My Notes worker tab. Sign in there, then retry My Notes only.' }; break; }
            result.processed += 1;
            if (direct.kind === 'saved') { result.saved += 1; result.directSaved += 1; result.eligible += 1; }
            else if (direct.kind === 'inaccessible') { result.skipped += 1; const reason = 'Export denied or transcript unavailable (HTTP ' + direct.status + ').'; result.skipReasons[reason] = (result.skipReasons[reason] || 0) + 1; }
            else { result.failed += 1; result.error = direct.error || (direct.kind === 'rateLimit' ? 'Zoom rate limit reached; stopped after bounded Retry-After retries. Retry My Notes only later.' : 'Authenticated My Notes export failed; stopped to avoid duplicate or misattributed downloads. Retry My Notes only.'); result.firstError = { stage: 'file-save', category: 'file-save', error: result.error }; if (direct.needsUserAction) result.needsUserAction = { url: location.origin + location.pathname, reason: result.error, downloadAttention: true }; break; }
            await say('sourceWorkerProgress', { runId: config.runId, progress: { ...result, pending: notesPending(config, result) }, message: 'Saved ' + result.saved + ', skipped ' + result.skipped + ', failed ' + result.failed + '.' });
            continue;
          }
        }
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
        if (!noteId || (entry.id && noteId !== entry.id)) { result.skipped += 1; history.back(); await waitForList(); root = scrollRoot(); continue; }
        if (!entry.id && visited.has(noteId)) { result.skipped += 1; history.back(); if (!await waitForList()) throw new Error('My Notes list did not return after duplicate detection.'); root = scrollRoot(); continue; }
        visited.add(noteId);
        const tab = await transcriptTab();
        const download = tab ? await clickTranscriptDownload() : null;
        if (isLoginBlocker()) { result.needsUserAction = { url: location.origin + '/allNotes', reason: 'Zoom sign-in is required in the dedicated My Notes worker tab.' }; break; }
        if (!tab || !download) {
          if (stopRequested) { result.stopped = true; break; }
          result.skipped += 1;
          const reason = !tab ? 'No transcript access control.' : 'No enabled Download transcript control.';
          result.skipReasons[reason] = (result.skipReasons[reason] || 0) + 1;
          history.back(); if (!await waitForList()) throw new Error('My Notes did not return to All notes after access checking. Retry My Notes only.'); root = scrollRoot(); continue;
        }
        result.eligible += 1;
        if (stopRequested) { result.stopped = true; break; }
        const filename = entry.targetFilename;
        const exportId = 'notes-' + Date.now() + '-' + result.processed;
        const armed = await say('expectMyNotesExport', { exportId, filename, folderPath: config.folderPath });
        if (!armed?.ok) throw new Error('My Notes export could not be armed: ' + (armed?.error || 'worker unavailable') + '. Retry My Notes only.');
        if (stopRequested) { await say('clearMyNotesExport', { exportId }); result.stopped = true; break; }
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
        if (finished.ok) { result.saved += 1; result.fallbackSaved += 1; }
        else if (finished.timedOut && isLoginBlocker()) result.needsUserAction = { url: location.origin + location.pathname, reason: 'My Notes export is blocked by a sign-in or permission prompt.' };
        else { result.failed += 1; result.error = finished.error || 'My Notes download was interrupted.'; if (finished.timedOut) { result.error = 'The browser download did not respond in time. Check for an outstanding browser save dialog or Downloads item, close or cancel it if needed, then retry this source.'; await say('cancelMyNotesExport', { exportId }); result.firstError = { stage: 'file-save', category: 'file-save', error: result.error }; result.needsUserAction = { url: location.origin + location.pathname, reason: result.error, downloadAttention: true }; break; } }
        await say('sourceWorkerProgress', { runId: config.runId, progress: { ...result, pending: Math.max(0, result.discovered - result.saved - result.skipped - result.failed) }, message: 'Saved ' + result.saved + ', skipped ' + result.skipped + ', failed ' + result.failed + '.' });
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
      if (pendingExportId) { await say('clearMyNotesExport', { exportId: pendingExportId }).catch(() => {}); pendingExportId = null; }
      result.pending = Math.max(0, result.discovered - result.saved - result.skipped - result.failed);
      result.stopped = result.stopped || stopRequested;
      if (config.worker) await say('sourceWorkerCompleted', result);
      activeWorker = false;
      activeWorkerRunId = null;
      status(result.stopped ? 'Stopped.' : 'My Notes batch finished.');
      updateResults({ myNotes: result });
    }
    return result;
  }
  function addPanel() {
    if (panel || activeWorker) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = '<strong>Zoom Transcript Downloader</strong><div class="ztd-source-options"><label title="'+(recordingCapability?.reason||'Recording export unavailable.')+'"><input type="checkbox" id="ztd-source-recordings" disabled> Recording transcripts (unavailable)</label><label><input type="checkbox" id="ztd-source-notes"> My Notes transcripts</label></div><p id="ztd-recording-export-unavailable" role="status">'+(recordingCapability?.reason||'Recording export unavailable.')+'</p><div class="ztd-source-actions"><button type="button" id="ztd-notes-selected">Save selected sources</button><button type="button" id="ztd-notes-page">Save this page</button><button type="button" id="ztd-notes-stop">Stop</button></div><div id="ztd-notes-status">Ready</div><pre id="ztd-notes-results"></pre>';
    document.body.appendChild(panel);
    panel.hidden = guidedWorkspace;
    const recording = panel.querySelector('#ztd-source-recordings');
    const notes = panel.querySelector('#ztd-source-notes');
    chrome.storage.local.get({ sources: sourcesApi.DEFAULT_SOURCES }).then(({ sources }) => {
      const value = sourcesApi.normalizeSources(sources);
      recording.checked = recordingCapability?.available ? value.recordings : false;
      notes.checked = value.myNotes;
    });
    const save = () => chrome.storage.local.set({ sources: { recordings: recording.checked, myNotes: notes.checked } });
    recording.addEventListener('change', save);
    notes.addEventListener('change', save);
    panel.querySelector('#ztd-notes-selected').addEventListener('click', async () => {
      await save();
      const settings = await chrome.storage.local.get({ filenamePattern: '{date} - {time} - {title}', downloadSubfolder: '' });
      const selected = sourcesApi.orderedSources({ recordings: recording.checked, myNotes: notes.checked });
      if (selected.includes('recordings') && !recordingCapability?.available) { status(recordingCapability?.reason || 'Recording export is unavailable.'); return; }
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
    panel.querySelector('#ztd-notes-stop').addEventListener('click', () => { stopRequested = true; cancelDirect?.(); say('stopSourceRun'); status('Stop requested; no new exports will start.'); });
    return panel;
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === NS + ':setGuidedWorkspace') { guidedWorkspaceStateVersion += 1; guidedWorkspace = message.payload?.active === true; if (panel) panel.hidden = guidedWorkspace; sendResponse({ ok: true }); return false; }
    if (message?.type === NS + ':ping') { sendResponse({ ok: true }); return false; }
    if (message?.type === NS + ':getSourceWorkerState') { sendResponse({ runId: activeWorkerRunId, active: activeWorker }); return false; }
    if (message?.type === NS + ':openPanel') { addPanel(); sendResponse({ ok: true }); return false; }
    if (message?.type === NS + ':scanGuidedNotes') {
      scanGuidedNotes().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    if (message?.type === NS + ':stopGuidedScan') { guidedNotesScanStopped = true; sendResponse({ ok: true }); return false; }
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
    if (message?.type === NS + ':stopSourceWorker') { stopRequested = true; cancelDirect?.(); sendResponse({ ok: true }); return false; }
  });
  const initialGuidedWorkspaceStateVersion = guidedWorkspaceStateVersion;
  chrome.runtime.sendMessage({ type: NS + ':getGuidedTabState' }).then(state => { if (shouldApplyInitialGuidedTabState(initialGuidedWorkspaceStateVersion)) guidedWorkspace = state?.guided === true; if (!guidedWorkspace) addPanel(); }).catch(() => { if (!guidedWorkspace) addPanel(); });
})();
