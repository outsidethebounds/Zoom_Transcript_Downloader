import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../my-notes-hook.js', import.meta.url), 'utf8');
const NOTES_URL = 'https://us01mynotes.zoom.us/api/file/meeting_notes/my_notes?pageSize=25';

function fixture(fetchImpl) {
  const handlers = new Set();
  const location = { origin: 'https://us01mynotes.zoom.us', href: 'https://us01mynotes.zoom.us/allNotes' };
  const window = {
    addEventListener(type, handler) { if (type === 'message') handlers.add(handler); },
    removeEventListener(type, handler) { if (type === 'message') handlers.delete(handler); },
    postMessage(data) {
      for (const handler of [...handlers]) handler({ source: window, origin: location.origin, data });
    },
    fetch: fetchImpl,
  };
  class FakeXHR {
    constructor() { this.listeners = new Map(); this.status = 0; this.responseType = ''; this.responseText = ''; }
    open(method, url) { this.method = method; this.url = url; }
    send(body) { this.body = body; }
    addEventListener(type, handler) { const set = this.listeners.get(type) || new Set(); set.add(handler); this.listeners.set(type, set); }
    getResponseHeader(name) { return name.toLowerCase() === 'content-type' ? 'application/json' : null; }
    respond(payload) {
      this.status = 200;
      this.responseText = JSON.stringify(payload);
      for (const handler of [...(this.listeners.get('load') || [])]) handler.call(this);
    }
  }
  class FakeMutationObserver { observe() {} disconnect() {} }
  class FakeFormData {}
  class FakeAnchor {}
  FakeAnchor.prototype.click = function click() {};
  const document = { documentElement: {}, querySelector: () => null, querySelectorAll: () => [] };
  const context = vm.createContext({
    window, document, location, XMLHttpRequest: FakeXHR, HTMLAnchorElement: FakeAnchor,
    MutationObserver: FakeMutationObserver, FormData: FakeFormData, URL, URLSearchParams,
    setTimeout, clearTimeout, console,
  });
  vm.runInContext(source, context);
  async function paginationState() {
    const requestId = 'test-' + Math.random();
    return await new Promise(resolve => {
      const onMessage = event => {
        if (event.source !== window || event.data?.source !== 'ztd-notes-pagination-state' || event.data.requestId !== requestId) return;
        window.removeEventListener('message', onMessage);
        resolve(event.data.payload || null);
      };
      window.addEventListener('message', onMessage);
      window.postMessage({ source: 'ztd-notes-pagination-probe', requestId }, location.origin);
    });
  }
  return { window, FakeXHR, paginationState };
}

function response(rowCount) {
  return {
    status: 200,
    headers: { get: () => 'application/json' },
    clone() { return { json: async () => ({ notesList: Array.from({ length: rowCount }, () => ({})), nextPageToken: '' }) }; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('late first-page fetch response cannot reset a newer pagination epoch', async () => {
  const pending = [];
  const app = fixture(() => { const d = deferred(); pending.push(d); return d.promise; });
  const older = app.window.fetch(NOTES_URL);
  const newer = app.window.fetch(NOTES_URL);

  pending[1].resolve(response(2));
  await newer;
  const stateAfterNewer = await app.paginationState();
  assert.equal(stateAfterNewer.totalRows, 2);
  assert.equal(stateAfterNewer.pages, 1);

  pending[0].resolve(response(5));
  await older;
  const stateAfterOlder = await app.paginationState();
  assert.deepEqual(stateAfterOlder, stateAfterNewer, 'superseded response must not overwrite the active list state');
});

test('empty pageToken starts a fresh counter epoch', async () => {
  const pending = [];
  const app = fixture(() => { const d = deferred(); pending.push(d); return d.promise; });
  const first = app.window.fetch(NOTES_URL);
  pending[0].resolve(response(5));
  await first;
  assert.equal((await app.paginationState()).totalRows, 5);

  const second = app.window.fetch(NOTES_URL + '&pageToken=');
  pending[1].resolve(response(2));
  await second;
  const state = await app.paginationState();
  assert.equal(state.totalRows, 2, 'old list rows must not leak into a fresh first-page count');
  assert.equal(state.pages, 1);
});

test('late first-page XHR response with an empty token cannot reset a newer pagination epoch', async () => {
  const app = fixture(() => Promise.reject(new Error('unused')));
  const emptyTokenUrl = NOTES_URL + '&pageToken=';
  const older = new app.FakeXHR(); older.open('GET', emptyTokenUrl); older.send();
  const newer = new app.FakeXHR(); newer.open('GET', emptyTokenUrl); newer.send();

  newer.respond({ notesList: [{}, {}], nextPageToken: '' });
  const stateAfterNewer = await app.paginationState();
  assert.equal(stateAfterNewer.totalRows, 2);
  assert.equal(stateAfterNewer.pages, 1);

  older.respond({ notesList: [{}, {}, {}, {}, {}], nextPageToken: '' });
  const stateAfterOlder = await app.paginationState();
  assert.deepEqual(stateAfterOlder, stateAfterNewer, 'superseded response must not overwrite the active list state');
});
