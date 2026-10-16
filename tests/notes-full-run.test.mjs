import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sources from '../lib/sources.js';
const code = fs.readFileSync(new URL('../my-notes.js', import.meta.url), 'utf8')
  .replace("  const initialGuidedWorkspaceStateVersion = guidedWorkspaceStateVersion;\n  chrome.runtime.sendMessage({ type: NS + ':getGuidedTabState' }).then(state => { if (shouldApplyInitialGuidedTabState(initialGuidedWorkspaceStateVersion)) guidedWorkspace = state?.guided === true; if (!guidedWorkspace) addPanel(); }).catch(() => { if (!guidedWorkspace) addPanel(); });\n})();", '  globalThis.adapter = { processNotes, readRows, findRowForLabel, clickTranscriptDownload, waitForDom };\n})();');
async function run({ stopAfter = 0, missing = false, scope = null, stopAccessIndex = -1, loginAccessIndex = -1, routeFailureIndex = -1, allAccessible = false, direct = false, directKind = 'ready', stopDirect = false, expireOnce = false, expireAlways = false, lateDirect = false } = {}) {
  let directRequests = 0, directSaves = 0;
  let clock = 0, detail = null, count = 20, armed = null, saved = 0, root;
  const windowListeners = new Set();
  const listeners = new Set(), messages = [], roots = [], observers = new Set();
  const location = { pathname: '/allNotes', origin: 'https://us01mynotes.zoom.us' };
  const notes = Array.from({ length: 32 }, (_, index) => ({
    id: 'opaque-' + index,
    label: index % 5 === 0 ? 'Undated note ' + index : 'Note ' + index + ' 2026-10-11 10:00(GMT-4:00)',
    // Production metadata mixes ordinary notes and meeting-linked notes; UI decides access.
    metadata: { hasPermission: index === 18 ? false : index === 30 ? undefined : true, recording: null },
  }));
  function newRoot() {
    if (root) root.isConnected = false;
    root = { isConnected: true, clientHeight: 500, scrollHeight: 1500, scrollTop: 0,
      dispatchEvent() { if (this.isConnected && this.scrollTop > 0) count = 32; }, parentElement: null };
    roots.push(root);
    for (const observer of [...observers]) observer.callback();
  }
  newRoot();
  const listRows = () => detail ? [] : notes.slice(0, count).filter(n => !missing || roots.length === 1 || n.id !== 'opaque-21').map(n => ({
    parentElement: root,
    getAttribute: key => key === 'aria-label' ? n.label : key === 'data-ztd-note-id' ? n.id : null,
    click() {
      detail = n; location.pathname = '/' + n.id; root.isConnected = false;
      const index = Number(n.id.split('-')[1]);
      if (index === loginAccessIndex) location.pathname = '/login';
      if (index === stopAccessIndex) for (const listener of [...listeners]) listener({ type: 'zoomTranscriptExtension:stopSourceWorker' }, {}, () => {});
    },
  }));
  const tab = { textContent: 'Transcript', getAttribute() { return null; } };
  const download = {
    disabled: false, textContent: '', getAttribute: key => key === 'data-ztd-download-transcript' ? 'true' : null,
    click() {
      assert.ok(armed && listeners.size, 'completion wait must be registered before clicking');
      assert.equal(location.pathname, '/' + detail.id, 'export belongs to selected stable ID');
      const ignored = { type: 'zoomTranscriptExtension:myNotesExportFinished', payload: { exportId: 'unrelated', ok: true } };
      for (const listener of [...listeners]) listener(ignored);
      for (const listener of [...listeners]) listener({ type: 'zoomTranscriptExtension:myNotesExportFinished', payload: { exportId: armed, ok: true } });
      saved++;
      if (saved === stopAfter) for (const listener of [...listeners]) listener({ type: 'zoomTranscriptExtension:stopSourceWorker' }, {}, () => {});
    },
  };
  const enabled = () => detail && (allAccessible || ![5, 10, 18].includes(Number(detail.id.split('-')[1])));
  const document = {
    body: {}, documentElement: root, scrollingElement: root,
    querySelector(selector) {
      if (selector.includes('data-row')) return listRows()[0] || null;
      if (selector.includes('Rename file')) return detail && Number(detail.id.split('-')[1]) !== routeFailureIndex ? {} : null;
      if (selector.includes('data-ztd-download-transcript')) return enabled() ? download : null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('data-row')) return listRows();
      if (selector.includes('button')) return detail && (allAccessible || detail.id !== 'opaque-10') ? [tab, ...(enabled() ? [download] : [])] : [];
      return [];
    }, getElementById() { return null; },
  };
  const chrome = { runtime: {
    onMessage: { addListener: f => listeners.add(f), removeListener: f => listeners.delete(f) },
    async sendMessage(message) { messages.push(message);
      if (message.type.endsWith(':saveMyNotesDirect')) {
        assert.equal(detail, null, 'direct export never opens detail');
        directSaves++;
        if (expireAlways || (expireOnce && directSaves === 1)) return { ok: false, expired: true };
        saved++;
        if (saved === stopAfter) for (const listener of [...listeners]) listener({ type: 'zoomTranscriptExtension:stopSourceWorker' }, {}, () => {});
      }
      if (message.type.endsWith(':expectMyNotesExport')) armed = message.payload.exportId; return { ok: true }; },
  } };
  let pagination = { valid: true, method: 'GET', path: '/api/file/meeting_notes/my_notes', status: 200, mime: 'application/json', requestKeys: ['meetingInfoRequired','pageSize'], notesCount: 20, nextPageTokenPresent: true, sequence: 1, pages: 1, totalRows: 20 };
  const context = vm.createContext({ chrome, document, location, ZTDSources: sources,
    window: { addEventListener(type, fn) { if (type === 'message') windowListeners.add(fn); }, removeEventListener(type, fn) { windowListeners.delete(fn); }, postMessage(data) { if (data.source === 'ztd-notes-pagination-probe') queueMicrotask(() => { for (const fn of windowListeners) fn({ source: this, origin: location.origin, data: { source: 'ztd-notes-pagination-state', requestId: data.requestId, payload: pagination } }); }); if (data.source === 'ztd-notes-load-more') { count = 32; pagination = { valid: true, method: 'GET', path: '/api/file/meeting_notes/my_notes', status: 200, mime: 'application/json', requestKeys: ['meetingInfoRequired','pageSize','pageToken'], notesCount: 12, nextPageTokenPresent: false, sequence: pagination.sequence + 1, pages: 2, totalRows: 32 }; queueMicrotask(() => { for (const fn of windowListeners) fn({ source: this, origin: location.origin, data: { source: 'ztd-notes-pagination-result', payload: pagination } }); }); } if (data.source === 'ztd-notes-direct-request' && data.action !== 'cancel') {
        directRequests++;
        if (stopDirect) for (const listener of [...listeners]) listener({ type: 'zoomTranscriptExtension:stopSourceWorker' }, {}, () => {});
        queueMicrotask(() => { for (const fn of windowListeners) fn({source:context.window,data:{source:'ztd-notes-direct-response',requestId:data.requestId,kind:direct?directKind:'unavailable',status:directKind==='inaccessible'?403:401,url:'https://file-paa.zoom.us/ephemeral',expiresAt:1e12}}); });
      } } },
    history: { back() { queueMicrotask(() => { detail = null; location.pathname = '/allNotes'; count = 20; newRoot(); }); } },
    getComputedStyle: () => ({ overflowY: 'auto' }),
    Date: { now: () => clock },
    setTimeout(f, ms) { if (ms < 35000) setImmediate(() => { clock += ms; f(); }); return 1; }, clearTimeout() {},
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() { observers.add(this); } disconnect() { observers.delete(this); } },
    Event: class {}, MouseEvent: class {}, PointerEvent: class {}, console,
  });
  vm.runInContext(code, context);
  const result = await context.adapter.processNotes({ runId: 'production-full', mode: scope ? 'page' : 'all', scope, folderPath: 'Batch/My Notes', worker: true, settings: {} });
  return { result, messages, saved, directRequests, directSaves, roots, context, document, observers };
}
const full = await run();
assert.deepEqual(JSON.parse(JSON.stringify({ saved: full.result.saved, skipped: full.result.skipped, failed: full.result.failed, processed: full.result.processed, discovered: full.result.discovered, eligible: full.result.eligible, pending: full.result.pending })),
  { saved: 29, skipped: 3, failed: 0, processed: 29, discovered: 32, eligible: 29, pending: 0 });
assert.equal(full.saved, 29, 'one native export per successful note; no artificial testLimit/scope');
assert.ok(full.roots.length > 30, 'SPA replaces root on every return, in the single fallback pass');
assert.equal(full.messages.filter(m => m.type.endsWith(':expectMyNotesExport')).length, 29);
assert.ok(full.messages.filter(m => m.type.endsWith(':expectMyNotesExport')).some(m => m.payload.filename.includes('unknown-date')), 'title-only rows remain in discovery');
assert.equal(full.result.skipReasons['No transcript access control.'], 1);
assert.equal(full.result.skipReasons['No enabled Download transcript control.'], 2);
const accessStop = await run({ stopAccessIndex: 2 });
assert.equal(accessStop.result.stopped, true); assert.equal(accessStop.result.skipped, 0); assert.equal(accessStop.result.pending, 30);
const login = await run({ loginAccessIndex: 2 });
assert.equal(login.result.failed, 0); assert.match(login.result.needsUserAction.reason, /sign-in/);
assert.equal(login.result.pending, 30);
// Old code continued on the final detail page after route timeout, then skipped
// all planned exports because no list rows remained: the reported 0/24/1/0 pattern.
const routeFailure = await run({ routeFailureIndex: 31, allAccessible: true });
assert.equal(routeFailure.result.saved, 31); assert.equal(routeFailure.result.skipped, 0);
assert.equal(routeFailure.result.failed, 1); assert.equal(routeFailure.result.pending, 0);
assert.match(routeFailure.result.error, /detail did not render.*export/);
const failure = await run({ missing: true });
assert.equal(failure.result.failed, 1);
assert.match(failure.result.error, /list lookup failed.*Retry My Notes only/);
assert.equal(failure.result.saved, 18, 'lookup failure preserves already completed exports');
assert.equal(failure.result.discovered, failure.result.saved + failure.result.skipped + failure.result.failed + failure.result.pending);
const stopped = await run({ stopAfter: 1 });
assert.equal(stopped.result.saved, 1); assert.equal(stopped.result.stopped, true); assert.equal(stopped.result.pending, 31);
const page = await run({ scope: { notes: [{ id: 'opaque-30', label: 'Undated note 30', title: 'Undated note 30', dateISO: 'unknown-date' }] } });
assert.equal(page.result.saved, 1, 'unknown permission schema is not default-denied when UI permits export');
assert.equal(page.result.discovered, 1, 'current-page scope is preserved');
// An inactive worker must become ready from DOM changes even if Chrome freezes timers.
full.context.setTimeout = () => 1;
let ready = false;
const eventWait = full.context.adapter.waitForDom(() => ready ? true : null, 12000);
ready = true;
for (const observer of [...full.observers]) observer.callback();
assert.equal(await eventWait, true, 'DOM readiness must not depend on a chained polling timer');
assert.equal(full.observers.size, 0, 'readiness observer cleans up after resolution');
const directFull = await run({direct:true});
assert.equal(directFull.result.saved,32);assert.equal(directFull.result.directSaved,32);assert.equal(directFull.result.fallbackSaved,0);
assert.equal(directFull.roots.length,1,'no detail navigation/preflight from list IDs');
assert.equal(directFull.directRequests,32);assert.equal(directFull.directSaves,32);
assert.equal(directFull.messages.filter(m=>m.type.endsWith(':expectMyNotesExport')).length,0,'no native arm/click in direct mode');
const directStop = await run({direct:true,stopAfter:1});
assert.equal(directStop.result.saved,1);assert.equal(directStop.result.pending,31);assert.equal(directStop.directRequests,1);
const late = await run({direct:true,stopDirect:true});
assert.equal(late.result.stopped,true);assert.equal(late.result.saved,0);assert.equal(late.directSaves,0);assert.equal(late.directRequests,1,'late response ignored, no next request');
const expired = await run({direct:true,expireOnce:true,scope:{notes:[{id:'opaque-1',label:'Note 1',title:'Note 1'}]}});
assert.equal(expired.result.saved,1);assert.equal(expired.directRequests,2);assert.equal(expired.result.fallbackSaved,0,'refresh once without native fallback');
const denied = await run({direct:true,directKind:'inaccessible'});
assert.equal(denied.result.skipped,32);assert.equal(denied.result.failed,0);assert.equal(denied.roots.length,1,'403 never invokes UI');
const directLogin = await run({direct:true,directKind:'login'});
assert.equal(directLogin.result.needsUserAction.reason.includes('sign-in'),true);assert.equal(directLogin.result.failed,0);assert.equal(directLogin.directRequests,1);
const rate = await run({direct:true,directKind:'rateLimit'});
assert.equal(rate.result.failed,1);assert.equal(rate.directRequests,1);assert.equal(rate.roots.length,1,'rate limit does not fall back aggressively');
const idless = await run({scope:{notes:[{label:'Note 1 2026-10-11 10:00(GMT-4:00)',title:'Note 1'}]}});
assert.equal(idless.result.discovered,1);assert.equal(idless.result.fallbackSaved,1,'missing list ID uses label lookup and validates native detail rather than dropping discovery');
assert.equal(idless.directRequests,0);
const alwaysExpired = await run({direct:true,expireAlways:true,scope:{notes:[{id:'opaque-1',label:'Note 1',title:'Note 1'}]}});
assert.equal(alwaysExpired.result.failed,1);assert.equal(alwaysExpired.result.saved,0);assert.equal(alwaysExpired.directRequests,2);assert.equal(alwaysExpired.directSaves,2);
assert.equal(alwaysExpired.result.fallbackSaved,0,'expired signed files never cause an extra native download');
console.log('notes-full-run.test.mjs: all tests passed');
