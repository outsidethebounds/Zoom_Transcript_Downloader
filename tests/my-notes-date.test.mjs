import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sources from '../lib/sources.js';

const code = fs.readFileSync(new URL('../my-notes.js', import.meta.url), 'utf8')
  .replace("  const initialGuidedWorkspaceStateVersion = guidedWorkspaceStateVersion;\n  chrome.runtime.sendMessage({ type: NS + ':getGuidedTabState' }).then(state => { if (shouldApplyInitialGuidedTabState(initialGuidedWorkspaceStateVersion)) guidedWorkspace = state?.guided === true; if (!guidedWorkspace) addPanel(); }).catch(() => { if (!guidedWorkspace) addPanel(); });\n})();", '  globalThis.adapter = { readRows };\n})();');

const rows = [
  { label: 'Recent title', cells: ['Recent title', '3 participants', 'Oct 27 2026 16:42', '14 hours ago'] },
  { label: 'Legacy title 2026-10-09 14:03(GMT-4:00)', cells: ['Legacy title', '2 participants', 'Oct 10 2026 15:04', '17 days ago'] },
  { label: 'Malformed date title', cells: ['Malformed date title', '', 'Feb 31 2026 25:99', 'yesterday'] },
  { label: 'Undated title', cells: ['Undated title', '', 'Recently', '2 hours ago'] },
];
const document = {
  querySelectorAll(selector) {
    if (!selector.includes('data-row')) return [];
    return rows.map((item, index) => ({
      getAttribute(name) { return name === 'aria-label' ? item.label : name === 'data-ztd-note-id' ? 'opaque-' + index : null; },
      querySelectorAll() { return item.cells.map(textContent => ({ textContent })); },
    }));
  },
};
const context = vm.createContext({ document, location: { pathname: '/allNotes' }, ZTDSources: sources, window: { addEventListener() {}, removeEventListener() {} }, chrome: { runtime: { onMessage: { addListener() {} } } } });
vm.runInContext(code, context);
const found = context.adapter.readRows();
assert.deepEqual(JSON.parse(JSON.stringify(found.map(({ title, dateISO, timeHHMM }) => ({ title, dateISO, timeHHMM })))), [
  { title: 'Recent title', dateISO: '2026-10-27', timeHHMM: '1642' },
  { title: 'Legacy title', dateISO: '2026-10-09', timeHHMM: '1403' },
  { title: 'Malformed date title', dateISO: 'unknown-date', timeHHMM: 'unknown-time' },
  { title: 'Undated title', dateISO: 'unknown-date', timeHHMM: 'unknown-time' },
]);
assert.deepEqual(sources.parseNoteListTimestamp('Oct 27 2026 16:42'), { dateISO: '2026-10-27', timeHHMM: '1642' });
assert.equal(sources.parseNoteListTimestamp('14 hours ago'), null, 'relative modified time is not converted into a guessed date');
assert.equal(sources.parseNoteListTimestamp('Feb 31 2026 16:42'), null, 'invalid calendar dates are rejected even with a valid clock');
assert.equal(sources.parseNoteListTimestamp('Feb 28 2026 25:42'), null, 'invalid clocks are rejected for a valid calendar date');
assert.equal(sources.parseNoteListTimestamp('Oct 27 2026 4:42 PM'), null, '12-hour timestamps are outside the observed format');
assert.equal(sources.parseNoteListTimestamp('Oct 27 2026 16:42 UTC'), null, 'timezone suffixes are outside the observed format');
console.log('my-notes-date.test.mjs: all tests passed');
