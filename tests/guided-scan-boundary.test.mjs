import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const content = read('content.js');
const notes = read('my-notes.js');
const hook = read('page-hook.js');
const workspace = read('workspace.js');
const background = read('background.js');

function blockAfter(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'expected source marker: ' + marker);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '\u0000') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unclosed block: ' + marker);
}

test('guided metadata discovery is isolated from export APIs', () => {
  const recordingScan = blockAfter(content, 'async function scanGuidedRecordingInventory');
  const notesScan = blockAfter(notes, 'async function scanGuidedNotes');
  assert.match(recordingScan, /requestRecordingMetadataScan/);
  assert.match(notesScan, /readRows\(\)/);
  for (const scan of [recordingScan, notesScan]) {
    assert.doesNotMatch(scan, /downloads\.download|startSourceRun|startGuidedDownload|processNotes\(/);
  }
  assert.match(hook, /RECORDING_LIST_PATH = '\/rest\/meeting\/transcript\/user\/list'/);
  assert.match(hook, /RECORDING_FIELDS = \['meetingId', 'sortKey', 'topic', 'createTime', 'canDownload'\]/);
  assert.doesNotMatch(hook.slice(hook.indexOf('Metadata-only bridge'), hook.indexOf('const originalAnchorClick')), /transcriptBody|signedUrl/);
});

test('recording metadata scan calls no mocked download or coordinator API', async () => {
  const scan = blockAfter(content, 'async function scanGuidedRecordingInventory');
  let downloads = 0, coordinatorStarts = 0;
  const sandbox = {
    guidedRecordingScanStopped: false,
    location: { pathname: '/recording/meeting/transcript' },
    document: { querySelector(selector) { if (selector === 'input[type="password"]') return null; return selector.startsWith('input') ? { value: '' } : { innerText: 'From-To' }; } },
    requestRecordingMetadataScan: async () => ({ rows: [{ sortKey: 'opaque-row', meetingId: 'occurrence', topic: 'Mock', createTime: '2026-01-01', canDownload: true }], expectedCount: 1, pages: 1 }),
    chrome: { downloads: { download() { downloads++; } }, runtime: { sendMessage() { coordinatorStarts++; } } },
    Number, String, Array, Object, Promise, Error, Date,
  };
  const result = await vm.runInNewContext('(' + scan + ')()', sandbox);
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(downloads, 0);
  assert.equal(coordinatorStarts, 0);
});

test('workspace starts a batch only from explicit reviewed-download path', () => {
  const scanFlow = blockAfter(workspace, 'async function runScans');
  const saveFlow = blockAfter(workspace, 'async function saveReviewed');
  const primary = blockAfter(workspace, 'async function primary');
  assert.doesNotMatch(scanFlow, /startGuidedDownload|startSourceRun/);
  assert.match(saveFlow, /startGuidedDownload/);
  assert.match(saveFlow, /if\(activeRun\|\|scanBusy\)return/);
  assert.match(primary, /if\(scanBusy\|\|activeRun\)return/);
  assert.match(primary, /await saveReviewed\(\)/);
  assert.equal((workspace.match(/startGuidedDownload/g) || []).length, 1);
  assert.match(background, /type === 'zoomTranscriptExtension:startSourceRun'/);
});
