import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
function fn(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, 'function start exists');
  assert.notEqual(to, -1, 'function end exists');
  return source.slice(from, to).trim();
}
const admissionSource = fn('function admitRecordingWorkerRun', 'async function completeRecordingWorker');
const completionSource = fn('async function completeRecordingWorker', 'function showGuidedStatus');
const executeSource = fn('async function executeRecordingWorker', 'async function startRecordingWorker');
const startSource = fn('async function startRecordingWorker', 'const {');

function load(sourceText, sandbox, expression) {
  return vm.runInNewContext(sourceText + String.fromCharCode(10) + expression, sandbox);
}

test('same-run duplicate is idempotent and overlapping run is rejected', () => {
  const sandbox = { sourceWorkerRun: null, seenRecordingWorkerRunIds: new Set() };
  const admit = load(admissionSource, sandbox, 'admitRecordingWorkerRun');
  const first = admit({ runId: 'run-A', mode: 'all' });
  assert.equal(first.accepted, true);
  sandbox.sourceWorkerRun = first.run;
  const duplicate = admit({ runId: 'run-A', mode: 'all' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.accepted, false);
  const overlap = admit({ runId: 'run-B', mode: 'all' });
  assert.equal(overlap.accepted, false);
  assert.match(overlap.error, /already active/);
  assert.equal(sandbox.sourceWorkerRun, first.run);
  sandbox.sourceWorkerRun = null;
  assert.equal(admit({ runId: 'run-B', mode: 'all' }).accepted, false); // rejected IDs cannot be replayed
});

test('deferred terminal delivery cannot let stale cleanup clear a newer run', async () => {
  const messages = [];
  const effects = [];
  let releaseSend;
  const runA = { runId: 'run-A', localRunId: 'local-A', controlActive: true, downloadBatchAttempted: true };
  const runB = { runId: 'run-B' };
  const sandbox = {
    sourceWorkerRun: runA,
    sourceRunRequested: true,
    saveAllController: { running: true, stopRequested: false },
    window: { postMessage: (...args) => effects.push(['post', ...args]) },
    location: { origin: 'https://example.invalid' },
    flushPendingTranscriptWaiters: () => effects.push(['flush']),
    finishDownloadBatch: async payload => effects.push(['finish', payload]),
    setSaveAllRunning: value => effects.push(['setRunning', value]),
    chrome: { runtime: { sendMessage: message => { messages.push(message); return new Promise(resolve => { releaseSend = resolve; }); } } },
  };
  const complete = load(completionSource, sandbox, 'completeRecordingWorker');
  const pending = complete(runA, { saved: 0, failed: 1 });
  await Promise.resolve();
  await complete(runA, { saved: 99 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].payload.runId, 'run-A');
  assert.equal(effects.filter(x => x[0] === 'finish').length, 1);
  sandbox.sourceWorkerRun = runB;
  sandbox.saveAllController = { running: true, stopRequested: false };
  releaseSend();
  await pending;
  assert.equal(sandbox.sourceWorkerRun, runB);
  assert.equal(sandbox.saveAllController.running, true);
  assert.equal(effects.some(x => x[0] === 'setRunning'), false);
});

function startupHarness({ boot, action, stopped = false } = {}) {
  const run = { runId: 'run-startup', mode: 'all', stopRequested: stopped, downloadBatchAttempted: false };
  const messages = [];
  const effects = [];
  const sandbox = {
    sourceWorkerRun: run,
    sourceRunRequested: true,
    saveAllController: { running: true, stopRequested: stopped },
    Date,
    scanRows: () => [{}],
    sleep: async () => {},
    boot: boot || (async () => {}),
    recordingWorkerActions: { all: action || (async () => {}) },
    window: { postMessage: (...args) => effects.push(['post', ...args]) },
    location: { origin: 'https://example.invalid' },
    flushPendingTranscriptWaiters: () => effects.push(['flush']),
    finishDownloadBatch: async payload => effects.push(['finish', payload]),
    setSaveAllRunning: value => effects.push(['setRunning', value]),
    chrome: { runtime: { sendMessage: async message => { messages.push(message); return { ok: true }; } } },
  };
  const sourceText = [executeSource, completionSource, startSource].join(String.fromCharCode(10));
  const entry = load(sourceText, sandbox, 'startRecordingWorker');
  return { run, messages, effects, sandbox, start: () => entry(run) };
}

test('setup exception before export body reports one terminal failure and cleans attempted batch', async () => {
  const h = startupHarness({ action: async run => {
    run.localRunId = 'local-startup';
    run.controlActive = true;
    run.downloadBatchAttempted = true;
    throw new Error('batch setup failed');
  } });
  await h.start();
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].payload.runId, h.run.runId);
  assert.equal(h.messages[0].payload.failed, 1);
  assert.match(h.messages[0].payload.error, /batch setup failed/);
  assert.equal(h.effects.filter(x => x[0] === 'finish').length, 1);
  assert.equal(h.effects.filter(x => x[0] === 'flush').length, 1);
  assert.equal(h.sandbox.sourceWorkerRun, null);
});

test('Stop during boot terminates without dispatching export', async () => {
  let actions = 0;
  const h = startupHarness({ boot: async () => { h.run.stopRequested = true; h.sandbox.saveAllController.stopRequested = true; }, action: async () => { actions++; } });
  await h.start();
  assert.equal(actions, 0);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].payload.stopped, true);
  assert.equal(h.messages[0].payload.failed, 0);
  assert.equal(h.sandbox.sourceWorkerRun, null);
});
