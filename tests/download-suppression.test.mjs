import assert from 'node:assert/strict';
import { createDownloadSuppression, shouldSuppressNativeTranscriptDownload } from '../lib/download-suppression.mjs';

function event() {
  const listeners = [];
  return { addListener(fn) { listeners.push(fn); }, emit(value) { for (const fn of listeners) fn(value); } };
}

function fixture() {
  const calls = { cancel: [], removeFile: [], erase: [] };
  const chrome = { downloads: {
    onCreated: event(), onChanged: event(),
    cancel: async id => { calls.cancel.push(id); },
    removeFile: async id => { calls.removeFile.push(id); },
    erase: async query => { calls.erase.push(query.id); },
  } };
  let mode = 'legacy';
  let workerTabId = 123;
  const tracker = createDownloadSuppression(chrome, item => shouldSuppressNativeTranscriptDownload(item, mode, workerTabId));
  return { calls, tracker, setMode(value, tabId = 123) { mode = value; workerTabId = tabId; }, created(item) { chrome.downloads.onCreated.emit(item); }, changed(id, state) { chrome.downloads.onChanged.emit({ id, state: { current: state } }); } };
}

const native = id => ({ id, tabId: 123, url: 'https://zoom.us/recording/transcript/download', filename: 'transcript.txt', state: 'in_progress' });
for (const mode of ['direct-save', 'direct-save-current-page']) {
  const f = fixture(); f.setMode(mode); f.created(native(mode));
  assert.deepEqual(f.calls.cancel, [mode], `${mode} suppresses native Zoom download`);
  assert.equal(f.tracker.size, 1);
  f.setMode('legacy'); // finish occurs before Chrome reports terminal state
  f.changed(mode, 'complete');
  assert.deepEqual(f.calls.removeFile, [mode]);
  assert.deepEqual(f.calls.erase, [mode]);
  assert.equal(f.tracker.size, 0);
  f.changed(mode, 'complete'); // repeat terminal event is idempotent
  assert.equal(f.calls.erase.length, 1);
}

{
  const f = fixture(); f.setMode('direct-save');
  f.created({ ...native(11), extensionOwned: true, url: 'data:text/plain;base64,abc' });
  f.setMode('legacy');
  f.created(native(12)); // manual download outside a run is untouched
  f.setMode('direct-save', 123);
  f.created({ ...native(13), tabId: 999 }); // unrelated user tabs are never suppressed
  assert.deepEqual(f.calls.cancel, []); assert.equal(f.tracker.size, 0);
}

{
  const f = fixture(); f.setMode('direct-save-current-page');
  f.created(native(20)); f.setMode('legacy');
  f.changed(20, 'interrupted'); // cancellation/failure still cleans tracked item
  assert.deepEqual(f.calls.erase, [20]); assert.equal(f.tracker.size, 0);
}

{
  const f = fixture(); f.setMode('direct-save');
  f.created({ ...native(30), state: 'complete' }); // terminal before finish/change event
  assert.deepEqual(f.calls.removeFile, [30]); assert.deepEqual(f.calls.erase, [30]);
  assert.equal(f.tracker.size, 0);
}

{
  const f = fixture(); f.setMode('direct-save'); f.created(native(40));
  f.setMode('legacy'); f.changed(40, 'in_progress');
  assert.equal(f.tracker.size, 1); // finish and nonterminal events retain the ID
  f.changed(40, 'interrupted');
  assert.deepEqual(f.calls.erase, [40]); assert.equal(f.tracker.size, 0);
}

{
  const f = fixture(); f.setMode('direct-save');
  for (let id = 1; id <= 205; id++) f.created(native(id));
  assert.equal(f.tracker.size, 200); // tracking remains bounded
}

{
  const onCreated = event(); const onChanged = event();
  const chrome = { downloads: { onCreated, onChanged, cancel() { throw new Error('cancel failed'); }, removeFile() { throw new Error('remove failed'); }, erase() { throw new Error('erase failed'); } } };
  const tracker = createDownloadSuppression(chrome, () => true);
  onCreated.emit({ id: 50, state: 'in_progress' });
  onChanged.emit({ id: 50, state: { current: 'interrupted' } });
  assert.equal(tracker.size, 0); // failures never break lifecycle cleanup
}

{
  assert.equal(shouldSuppressNativeTranscriptDownload(native(90), 'direct-save', 123), true);
  assert.equal(shouldSuppressNativeTranscriptDownload({ ...native(91), tabId: 999 }, 'direct-save', 123), false);
  assert.equal(shouldSuppressNativeTranscriptDownload(native(92), 'my-notes-native', 123), false);
  assert.equal(shouldSuppressNativeTranscriptDownload({ ...native(93), url: 'data:text/plain;base64,abc' }, 'direct-save', 123), false);
}

console.log('download-suppression.test.mjs: all tests passed');
