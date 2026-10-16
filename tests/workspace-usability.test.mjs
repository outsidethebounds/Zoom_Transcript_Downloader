import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { sourceFolderPath, sanitizeDownloadSubfolder } from '../lib/download-settings.mjs';
import { buildInventory, canSaveReviewed, reviewedTargetsMatch } from '../lib/guided-inventory.mjs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const workspace = read('workspace.js');
const content = read('content.js');

function extractContent(startMarker, endMarker, suffix) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `found content marker ${startMarker}`);
  return content.slice(start, end) + '\n' + suffix;
}

function extract(startMarker, endMarker, suffix) {
  const start = workspace.indexOf(startMarker);
  const end = workspace.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `found ${startMarker}`);
  return workspace.slice(start, end) + '\n' + suffix;
}

test('saved settings become dirty immediately and block the primary action until restored', () => {
  const controls = {
    'settings-pattern': { value: '{date} - {title}' },
    'settings-folder': { value: 'Work' },
    'settings-meeting-id': { checked: false },
    'download-settings-fields': {},
    'settings-save': {},
    'settings-discard': { disabled: true },
    'settings-status': { textContent: 'Saved settings.' , dataset: {} },
    primary: { disabled: false, removeAttribute() {} },
  };
  const context = {
    $: id => controls[id], sanitizeDownloadSubfolder,
    stage: 'connect', scanBusy: false, activeRun: false, inventory: null, settingsReady: true,
    savedDownloadSettings: { filenamePattern: '{date} - {title}', downloadSubfolder: '', includeMeetingId: false },
    selected: () => [],
  };
  const code = extract('function normalizeDownloadSettings', 'function renderDownloadSettings()', '({settingsAreDirty, updateDownloadSettingsLock});');
  const helpers = vm.runInNewContext(code, context);
  assert.equal(helpers.settingsAreDirty(), true);
  helpers.updateDownloadSettingsLock();
  assert.equal(controls.primary.disabled, true);
  assert.equal(controls['settings-status'].dataset.state, 'unsaved');
  controls['settings-folder'].value = '';
  assert.equal(helpers.settingsAreDirty(), false);
  helpers.updateDownloadSettingsLock();
  assert.equal(controls.primary.disabled, false);
  controls['settings-folder'].value = 'Draft';
  const discard = vm.runInNewContext(workspace.slice(workspace.indexOf('function discardDownloadSettings()'), workspace.indexOf('async function saveDownloadSettings()')) + '\ndiscardDownloadSettings', { scanBusy: false, activeRun: false, savedDownloadSettings: { filenamePattern: '{date} - {title}', downloadSubfolder: '', includeMeetingId: false }, $: id => controls[id], applyDownloadSettings: saved => { controls['settings-pattern'].value = saved.filenamePattern; controls['settings-folder'].value = saved.downloadSubfolder; controls['settings-meeting-id'].checked = saved.includeMeetingId; }, updateDownloadSettingsLock() {} });
  discard();
  assert.equal(controls['settings-folder'].value, '');
});

test('zero selection gets actionable guidance and incomplete selected source exposes scan retry', () => {
  const controls = {
    primary: { textContent: '', disabled: false },
    'recording-export-unavailable': { hidden: true, textContent: '' },
    'retry-recordings': { hidden: true }, 'retry-myNotes': { hidden: true },
  };
  let chosen = [];
  const inventory = { scans: { recordings: { selected: true, ok: false }, myNotes: { selected: true, ok: false } } };
  const fn = vm.runInNewContext(extract('function updatePrimaryForInventory()', 'function showInventory()', 'updatePrimaryForInventory'), {
    $: id => controls[id], inventory, selected: () => chosen, canSaveReviewed: () => false,
    settingsAreDirty: () => false, recordingCapability: { available: true }, activeRun: false, scanBusy: false,
  });
  fn();
  assert.equal(controls.primary.textContent, 'Select a source to download');
  assert.equal(controls.primary.disabled, true);
  chosen = ['recordings'];
  fn();
  assert.equal(controls.primary.textContent, 'Select a complete source to download');
  assert.equal(controls['retry-recordings'].hidden, false);
  assert.equal(controls['retry-myNotes'].hidden, false, 'metadata retry is available for each incomplete scan independently of export selection');
  const retry = workspace.slice(workspace.indexOf('async function retryIncompleteSource'), workspace.indexOf('async function sendTo'));
  assert.match(retry, /Retrying .* metadata only\. No transcript export will start/);
  assert.match(retry, /needsUserAction\&\&!reviewedTargetsMatch/);
  assert.doesNotMatch(retry, /startGuidedDownload|downloads\.download/);
});

test('incomplete scan status is not styled as complete', () => {
  const statusEl = { textContent: '', dataset: {} };
  const sourceStatus = vm.runInNewContext(extract('function sourceStatus(', 'function renderStoppedScan(', 'sourceStatus'), { $: () => statusEl });
  sourceStatus('recordings', 'Scan incomplete');
  assert.equal(statusEl.dataset.state, 'incomplete');
  sourceStatus('recordings', 'Scan complete · 4 assets');
  assert.equal(statusEl.dataset.state, 'complete');
  sourceStatus('recordings', 'Scan stopped · incomplete');
  assert.equal(statusEl.dataset.state, 'stopped');
});

test('results show the exact saved destination and warn before whole-source retries', () => {
  const elements = {
    'results-details': { hidden: true },
    'results-destinations': { children: [], replaceChildren() { this.children = []; }, append(row) { this.children.push(row); } },
    'results-retry-warning': { hidden: true, textContent: '' },
  };
  const document = { createElement: tag => ({ tag, children: [], append(...children) { this.children.push(...children); } }) };
  const fn = vm.runInNewContext(extract('function renderTerminalDetails(', 'function renderGuidedTerminal(', 'renderTerminalDetails'), { $: id => elements[id], document, sourceFolderPath });
  fn({ folderName: 'Work/Zoom/ZoomTranscripts-10162026', results: { recordings: { saved: 3 }, myNotes: { saved: 0 } } });
  assert.equal(elements['results-details'].hidden, false);
  assert.equal(elements['results-destinations'].children[0].children[1].textContent, 'Downloads/Work/Zoom/ZoomTranscripts-10162026/Recordings');
  assert.match(elements['results-retry-warning'].textContent, /already saved files may get additional copies/i);
  fn({ results: { recordings: { saved: 1 } } });
  assert.match(elements['results-destinations'].children[0].children[1].textContent, /Destination unavailable.*check the browser Downloads folder/);
});

test('source retry restores the canonical source URL after sign-in and retains completed inventory', () => {
  const targetsForRetry = vm.runInNewContext(extract('function targetsForRetry(', 'async function retryIncompleteSource(', 'targetsForRetry'), { company: () => 'example' });
  const expected = targetsForRetry('myNotes', { company: 'example', notesTabUrl: 'https://us01mynotes.zoom.us/signin', notesListUrl: 'https://us01mynotes.zoom.us/allNotes' });
  assert.equal(expected.notesTabUrl, 'https://us01mynotes.zoom.us/allNotes');
  assert.equal(expected.notesListUrl, 'https://us01mynotes.zoom.us/allNotes', 'empty legacy list target receives the canonical default');
  const retained = vm.runInNewContext(extract('function scansFromInventory(', 'function normalizeSourceScan(', 'scansFromInventory'), { });
  const previous = buildInventory({ recordings: { selected: true, ok: true, assets: [{ id: 'r1', title: 'Recording' }] }, myNotes: { selected: true, ok: false, assets: [] } });
  assert.equal(retained(previous).recordings.ok, true);
  assert.equal(retained(previous).myNotes.ok, false);
  assert.match(workspace.slice(workspace.indexOf('async function retryIncompleteSource'), workspace.indexOf('async function sendTo')), /retainedComplete\.length&&!reviewedTargetsMatch/);
});

function makeRetryHarness({ preparedNotesUrl, afterNotesUrl, scanResult, changedRecording = false, blankListUrls = false } = {}) {
  const originalTargets = {
    company: 'acme',
    recordingTabUrl: 'https://acme.zoom.us/recording/meeting/transcript',
    recordingListUrl: 'https://acme.zoom.us/recording/meeting/transcript',
    notesTabUrl: 'https://us01mynotes.zoom.us/signin',
    notesListUrl: blankListUrls ? '' : 'https://us01mynotes.zoom.us/allNotes',
  };
  const targets = [
    { ...originalTargets, recordingTabUrl: changedRecording ? 'https://other.zoom.us/recording/meeting/transcript' : originalTargets.recordingTabUrl },
    { ...originalTargets, notesTabUrl: preparedNotesUrl, notesListUrl: 'https://us01mynotes.zoom.us/allNotes' },
    { ...originalTargets, notesTabUrl: afterNotesUrl, notesListUrl: 'https://us01mynotes.zoom.us/allNotes' },
  ];
  const calls = { scans: [], updates: [], statuses: [], stages: [], sends: [] };
  const elements = { 'results-details': {}, stop: {}, company: {}, 'scan-status': {} };
  const initial = buildInventory({
    recordings: { selected: true, ok: true, assets: [{ id: 'r-1', title: 'Recorded meeting' }] },
    myNotes: { selected: true, ok: false, assets: [] },
  });
  const context = {
    scanBusy: false, activeRun: false, cancelScan: false, stopPending: false,
    settingsReady: true, savedDownloadSettings: {}, reviewedDownloadSettings: {},
    inventory: initial, reviewedTargets: originalTargets, recordingTabId: 10, notesTabId: 11, workspaceTabId: 90,
    company: () => 'acme', settingsAreDirty: () => false, updateDownloadSettingsLock() {},
    currentSourceTargets: async () => targets.shift(),
    ensureSourceTabs: async () => ({ recording: { id: 10 }, notes: { id: 11 } }),
    waitTab: async () => {},
    scanSource: async (tabId, type, source) => { calls.scans.push({ tabId, type, source }); return scanResult; },
    sourceStatus() {}, status: value => calls.statuses.push(value), setStage: value => calls.stages.push(value),
    showInventory() {}, renderStoppedScan() {}, refreshSavedDownloadSettings: async () => false,
    chrome: { tabs: { update: async (...args) => calls.updates.push(args) }, runtime: { sendMessage: async msg => calls.sends.push(msg) } },
    $: id => elements[id] || (elements[id] = {}),
    reviewedTargetsMatch, buildInventory, URL,
  };
  const helpers = extract('function scansFromInventory(', 'function targetsForRetry(', '');
  const targetAndAuth = extract('function targetsForRetry(', 'async function retryIncompleteSource(', '');
  const retry = extract('async function retryIncompleteSource(', 'async function sendTo(', 'retryIncompleteSource');
  const run = vm.runInNewContext(helpers + targetAndAuth + retry, context);
  return { run, context, calls, initial };
}

test('production Notes retry recovers from sign-in while retaining complete Recordings and scanning Notes only', async () => {
  const result = { ok: true, exhausted: true, count: 1, assets: [{ id: 'n-1', title: 'My Notes item' }] };
  const h = makeRetryHarness({ preparedNotesUrl: 'https://us01mynotes.zoom.us/allNotes', afterNotesUrl: 'https://us01mynotes.zoom.us/allNotes', scanResult: result, blankListUrls: true });
  await h.run('myNotes');
  assert.deepEqual(h.calls.scans, [{ tabId: 11, type: 'scanGuidedNotes', source: 'myNotes' }]);
  assert.equal(h.context.inventory.scans.recordings.ok, true);
  assert.equal(h.context.inventory.scans.myNotes.ok, true);
  assert.deepEqual(h.context.inventory.assets.map(a => a.source), ['recordings', 'myNotes']);
  assert.equal(h.calls.sends.length, 0, 'metadata retry never dispatches an export');
  assert.match(h.calls.statuses.at(-1), /no transcript export was started/i);
});

test('production Notes retry on a still-open sign-in page keeps the completed source and exposes Zoom sign-in', async () => {
  const result = { ok: false, needsUserAction: true, error: 'Sign in to My Notes in this tab, then rescan.' };
  const h = makeRetryHarness({ preparedNotesUrl: 'https://us01mynotes.zoom.us/signin', afterNotesUrl: 'https://us01mynotes.zoom.us/signin', scanResult: result, blankListUrls: true });
  await h.run('myNotes');
  assert.deepEqual(h.calls.scans, [{ tabId: 11, type: 'scanGuidedNotes', source: 'myNotes' }]);
  assert.equal(h.context.inventory.scans.recordings.ok, true);
  assert.equal(h.context.inventory.scans.myNotes.ok, false);
  assert.equal(h.context.inventory.scans.myNotes.needsUserAction, true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.updates[0])), [11, { active: true }], 'Zoom sign-in tab is brought forward for the user');
  assert.equal(h.calls.sends.length, 0, 'no transcript export is dispatched while metadata remains incomplete');
});

test('production retry blocks when a retained completed source target changed', async () => {
  const h = makeRetryHarness({
    preparedNotesUrl: 'https://us01mynotes.zoom.us/allNotes', afterNotesUrl: 'https://us01mynotes.zoom.us/allNotes',
    scanResult: { ok: true, exhausted: true, assets: [] }, changedRecording: true,
  });
  await h.run('myNotes');
  assert.equal(h.calls.scans.length, 0);
  assert.equal(h.context.inventory, null);
  assert.equal(h.calls.stages.at(-1), 'connect');
  assert.match(h.calls.statuses.at(-1), /completed Zoom source changed/i);
});

test('reviewed settings refresh blocks the first stale-config export and allows dispatch only after re-review', async () => {
  const controls = { stop: {}, primary: {}, activity: {} };
  let refreshCount = 0;
  const dispatches = [];
  const inventory = buildInventory({ recordings: { selected: false, ok: false }, myNotes: { selected: true, ok: true, assets: [{ id: 'n-1', title: 'Notes' }] } });
  const sourceTargets = {
    company: 'acme', recordingTabUrl: 'https://acme.zoom.us/recording/meeting/transcript', recordingListUrl: 'https://acme.zoom.us/recording/meeting/transcript',
    notesTabUrl: 'https://us01mynotes.zoom.us/allNotes', notesListUrl: 'https://us01mynotes.zoom.us/allNotes',
  };
  const context = {
    activeRun: false, scanBusy: false, settingsReady: true, NS: 'zoomTranscriptExtension', reviewedDownloadSettings: { filenamePattern: 'old', downloadSubfolder: '', includeMeetingId: false },
    savedDownloadSettings: { filenamePattern: 'old', downloadSubfolder: '', includeMeetingId: false },
    inventory, reviewedTargets: sourceTargets, recordingTabId: 10, selected: () => ['myNotes'], recordingCapability: { available: true },
    refreshSavedDownloadSettings: async () => { if (++refreshCount === 1) { context.savedDownloadSettings = { filenamePattern: 'new', downloadSubfolder: '', includeMeetingId: false }; return true; } return false; },
    sameDownloadSettings: (a,b) => !!a && !!b && a.filenamePattern === b.filenamePattern && a.downloadSubfolder === b.downloadSubfolder && a.includeMeetingId === b.includeMeetingId,
    settingsAreDirty: () => false, canSaveReviewed, currentSourceTargets: async () => sourceTargets, reviewedTargetsMatch,
    company: () => 'acme', persist: async () => {}, setStage() {}, showJob() {}, hideJob() {}, showInventory() {},
    status: value => { context.lastStatus = value; }, updateDownloadSettingsLock() {},
    chrome: { tabs: { get: async () => ({ id: 10 }), sendMessage: async (...args) => { dispatches.push(args); return { ok: true }; } } },
    $: id => controls[id] || (controls[id] = {}),
  };
  const save = vm.runInNewContext(extract('async function saveReviewed()', 'async function primary()', 'saveReviewed'), context);
  await save();
  assert.equal(dispatches.length, 0, 'the stale reviewed settings cannot launch an export');
  assert.match(context.lastStatus, /settings changed since this review/i);
  assert.equal(context.reviewedDownloadSettings.filenamePattern, 'new', 'new examples become the acknowledged review snapshot');
  await save();
  assert.equal(dispatches.length, 1, 'a later explicit click proceeds after the refreshed settings were shown: ' + context.lastStatus);
  assert.equal(dispatches[0][1].type, 'zoomTranscriptExtension:startGuidedDownload');
  assert.deepEqual(JSON.parse(JSON.stringify(dispatches[0][1].payload.settings)), { filenamePattern: 'new', downloadSubfolder: '', includeMeetingId: false });
});


test('ensureSourceTabs persists the intended canonical My Notes list before discovery completes', async () => {
  const stored = { notesListUrl: '' };
  const created = [];
  const context = {
    company: () => 'acme', persist: async () => {}, recordingTabId: null, notesTabId: null,
    chrome: {
      tabs: {
        query: async () => [{ id: 10, url: 'https://acme.zoom.us/recording/meeting/transcript' }],
        create: async options => { const tab = { id: 11, url: options.url }; created.push(tab); return tab; },
      },
      storage: { local: { get: async () => ({ notesListUrl: stored.notesListUrl }), set: async values => Object.assign(stored, values) } },
    },
  };
  const ensure = vm.runInNewContext(extract('async function ensureSourceTabs()', '\nasync function runScans()', 'ensureSourceTabs'), context);
  const tabs = await ensure();
  assert.equal(tabs.notes.url, 'https://us01mynotes.zoom.us/allNotes');
  assert.equal(stored.notesListUrl, 'https://us01mynotes.zoom.us/allNotes');
  assert.equal(created.length, 1);
  assert.equal(context.notesTabId, 11);
});

test('guided review passes its saved settings snapshot through content to the source-run request', async () => {
  const { default: sources } = await import('../lib/sources.js');
  const messages = [];
  let reads = 0;
  const context = {
    sourceApi: sources, recordingCapability: { available: true }, EXTENSION_NS: 'zoomTranscriptExtension',
    getSettings: async () => { reads++; return { filenamePattern: 'new-storage-value', downloadSubfolder: 'new-storage-folder', includeMeetingId: false }; },
    sourceRunRequested: false, guidedWorkspace: true, saveAllController: { running: false }, setSaveAllRunning() {},
    document: { querySelector: () => ({ textContent: '' }) }, location: { href: 'https://acme.zoom.us/recording/meeting/transcript' },
    chrome: { runtime: { sendMessage: async message => { messages.push(message); return { ok: true }; } } },
  };
  const start = vm.runInNewContext(extractContent('async function startCoordinatedSourceRun(', '\nfunction showToast(', 'startCoordinatedSourceRun'), context);
  const reviewed = { filenamePattern: 'reviewed-value', downloadSubfolder: 'reviewed-folder', includeMeetingId: true };
  await start('all', ['myNotes'], { myNotes: 1 }, false, reviewed);
  await start('all', ['myNotes']);
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].payload.settings)), reviewed, 'the reviewed immutable snapshot wins over a later storage value');
  assert.deepEqual(JSON.parse(JSON.stringify(messages[1].payload.settings)), { filenamePattern: 'new-storage-value', downloadSubfolder: 'new-storage-folder', includeMeetingId: false }, 'legacy panel callers still read current saved settings');
  assert.equal(reads, 1);
});
