import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../my-notes.js', import.meta.url), 'utf8');
const countStart = source.indexOf('    const waitForCollectedCount = expectedCount => {');
const countEnd = source.indexOf('\n    const waitForDomChange', countStart);
assert.ok(countStart >= 0 && countEnd > countStart, 'count reconciliation helper exists');
const countSource = source.slice(countStart, countEnd).replace(/^    /gm, '');

function countWaitHarness(rows = []) {
  const observers = [];
  const timers = [];
  const byKey = new Map(rows.map(id => [id, { id }]));
  let visible = rows;
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
    fire() { this.callback(); }
  }
  const context = vm.createContext({
    byKey, readRows: () => visible.map(id => ({ id })), MutationObserver: Observer,
    document: { documentElement: {} }, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: () => {},
  });
  vm.runInContext('const collectVisible = () => readRows().forEach(note => { const key = note.id || note.label; if (key) byKey.set(key, { ...note, row: undefined }); });\n' + countSource + '\nglobalThis.waitForCollectedCount = waitForCollectedCount;', context);
  return { wait: context.waitForCollectedCount, expire() { timers.at(-1)(); }, add(ids) { visible = [...visible, ...ids]; observers.at(-1).fire(); }, observers };
}

test('already-rendered unique terminal inventory reconciles synchronously', async () => {
  const h = countWaitHarness(['a', 'b', 'c']);
  assert.equal(await h.wait(3), true);
  assert.equal(h.observers.length, 0, 'no wait/timer when rows match terminal API total');
});

test('partial inventory never passes terminal count reconciliation', async () => {
  const h = countWaitHarness(['a', 'b']);
  const pending = h.wait(3);
  h.expire();
  assert.equal(await pending, false);
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].disconnected, true);
});

test('delayed DOM rows complete through mutation notification', async () => {
  const h = countWaitHarness(['a']);
  const pending = h.wait(3);
  h.add(['b', 'c']);
  assert.equal(await pending, true);
});

test('mutation event resolves without relying on a throttled fallback timer', async () => {
  const h = countWaitHarness(['a']);
  const pending = h.wait(2);
  h.add(['b']);
  assert.equal(await pending, true);
  assert.equal(h.observers[0].disconnected, true);
});
