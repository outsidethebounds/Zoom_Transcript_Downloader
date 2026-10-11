import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sources from '../lib/sources.js';
const code = fs.readFileSync(new URL('../my-notes.js', import.meta.url), 'utf8')
  .replace('  addPanel();\n})();', '  globalThis.adapter = { processNotes, readRows, findRowForLabel, clickTranscriptDownload, waitForDom };\n})();');
async function run({ stopAfter = 0, missing = false, scope = null, stopAccessIndex = -1, loginAccessIndex = -1, routeFailureIndex = -1, allAccessible = false } = {}) {
  let clock = 0, detail = null, count = 20, armed = null, saved = 0, root;
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
    async sendMessage(message) { messages.push(message); if (message.type.endsWith(':expectMyNotesExport')) armed = message.payload.exportId; return { ok: true }; },
  } };
  const context = vm.createContext({ chrome, document, location, ZTDSources: sources,
    window: { addEventListener() {}, removeEventListener() {}, postMessage() { count = 32; } },
    history: { back() { queueMicrotask(() => { detail = null; location.pathname = '/allNotes'; count = 20; newRoot(); }); } },
    getComputedStyle: () => ({ overflowY: 'auto' }),
    Date: { now: () => clock },
    setTimeout(f, ms) { if (ms < 35000) queueMicrotask(() => { clock += ms; f(); }); return 1; }, clearTimeout() {},
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() { observers.add(this); } disconnect() { observers.delete(this); } },
    Event: class {}, MouseEvent: class {}, PointerEvent: class {}, console,
  });
  vm.runInContext(code, context);
  const result = await context.adapter.processNotes({ runId: 'production-full', mode: scope ? 'page' : 'all', scope, folderPath: 'Batch/My Notes', worker: true, settings: {} });
  return { result, messages, saved, roots, context, document, observers };
}
const full = await run();
assert.deepEqual(JSON.parse(JSON.stringify({ saved: full.result.saved, skipped: full.result.skipped, failed: full.result.failed, processed: full.result.processed, discovered: full.result.discovered, eligible: full.result.eligible, pending: full.result.pending })),
  { saved: 29, skipped: 3, failed: 0, processed: 29, discovered: 32, eligible: 29, pending: 0 });
assert.equal(full.saved, 29, 'one native export per successful note; no artificial testLimit/scope');
assert.ok(full.roots.length > 50, 'SPA replaces root on every return, including export phase');
assert.equal(full.messages.filter(m => m.type.endsWith(':expectMyNotesExport')).length, 29);
assert.ok(full.messages.filter(m => m.type.endsWith(':expectMyNotesExport')).some(m => m.payload.filename.includes('unknown-date')), 'title-only rows remain in discovery');
assert.equal(full.result.skipReasons['No transcript access control.'], 1);
assert.equal(full.result.skipReasons['No enabled Download transcript control.'], 2);
const accessStop = await run({ stopAccessIndex: 2 });
assert.equal(accessStop.result.stopped, true); assert.equal(accessStop.result.skipped, 0); assert.equal(accessStop.result.pending, 32);
const login = await run({ loginAccessIndex: 2 });
assert.equal(login.result.failed, 0); assert.match(login.result.needsUserAction.reason, /sign-in/);
assert.equal(login.result.pending, 32);
// Old code continued on the final detail page after route timeout, then skipped
// all planned exports because no list rows remained: the reported 0/24/1/0 pattern.
const routeFailure = await run({ routeFailureIndex: 31, allAccessible: true });
assert.equal(routeFailure.result.saved, 0); assert.equal(routeFailure.result.skipped, 0);
assert.equal(routeFailure.result.failed, 1); assert.equal(routeFailure.result.pending, 31);
assert.match(routeFailure.result.error, /detail did not render.*access checking/);
const failure = await run({ missing: true });
assert.equal(failure.result.failed, 1);
assert.match(failure.result.error, /list lookup failed.*Retry My Notes only/);
assert.equal(failure.result.saved, 0, 'preflight failure must not export a partial plan');
assert.equal(failure.result.discovered, failure.result.saved + failure.result.skipped + failure.result.failed + failure.result.pending);
const stopped = await run({ stopAfter: 1 });
assert.equal(stopped.result.saved, 1); assert.equal(stopped.result.stopped, true); assert.equal(stopped.result.pending, 28);
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
console.log('notes-full-run.test.mjs: all tests passed');
