import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const capabilityContext = {};
vm.runInNewContext(read('lib/recording-capability.js'), capabilityContext);
const capability = capabilityContext.ZTDRecordingCapability;
const hook = read('page-hook.js');

test('Recording capability reflects the observed POST XHR Blob contract', () => {
  assert.equal(capability.version, 1);
  assert.equal(capability.available, true);
  assert.deepEqual(Array.from(capability.contract.requestIds), ['meetingId', 'sortKey']);
  assert.equal(capability.contract.method, 'POST');
  assert.equal(capability.contract.path, '/rest/meeting/transcript/user/download');
  assert.equal(capability.contract.transport, 'xhr');
  assert.equal(capability.contract.responseType, 'blob');
  assert.equal(capability.contract.mimeType, 'text/plain');
  assert.match(hook, /xhr.status !== 200/);
  assert.match(hook, /xhr.responseType !== 'blob'/);
  assert.ok(hook.includes('text/plain'));
});

test('Recording capability bootstraps consistently for fresh pages, workspaces, and stale-tab reinjection', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const recordingScripts = manifest.content_scripts.find(item => item.matches.some(match => match.includes('/recording/meeting/transcript'))).js;
  assert.ok(recordingScripts.indexOf('lib/recording-capability.js') < recordingScripts.indexOf('content.js'), 'fresh tabs load capability before content');
  const background = read('background.js');
  const bundleStart = background.indexOf('const CONTENT_SCRIPT_FILES = [');
  const bundleEnd = background.indexOf('];', bundleStart);
  assert.ok(bundleStart >= 0 && bundleEnd > bundleStart, 'background has a reinjection bundle');
  const injectedFiles = Array.from(background.slice(bundleStart, bundleEnd).matchAll(/'([^']+)'/g), match => match[1]);
  assert.ok(injectedFiles.indexOf('lib/recording-capability.js') >= 0 && injectedFiles.indexOf('lib/recording-capability.js') < injectedFiles.indexOf('content.js'), 'stale tabs receive capability before guarded content reinjection');
  assert.match(background, /response\.recordingCapabilityVersion === 1 && response\.recordingCapabilityAvailable === true/);
  assert.match(background, /stale extension content[\s\S]*no export was started/);
  assert.ok(read('workspace.html').indexOf('lib/recording-capability.js') < read('workspace.html').indexOf('workspace.js'), 'workspace loads the shared capability before gating exports');
  assert.match(background, /import '\.\/lib\/recording-capability\.js'/, 'background imports the same capability');
  const content = read('content.js');
  assert.match(content, /new Proxy\(\{\}, \{ get: \(_target, key\) => globalThis\.ZTDRecordingCapability\?\.\[key\] \}\)/, 'content reads capability dynamically after safe reinjection');
  assert.match(content, /recordingCapabilityVersion: recordingCapability\?\.version/);
  const dynamicContext = {};
  const liveCapability = vm.runInNewContext('new Proxy({}, { get: (_target, key) => globalThis.ZTDRecordingCapability?.[key] })', dynamicContext);
  assert.equal(liveCapability.available, undefined);
  vm.runInNewContext(read('lib/recording-capability.js'), dynamicContext);
  assert.equal(liveCapability.available, true, 'an already-open current content closure sees the reinjected capability');
  assert.equal(liveCapability.version, 1);
});

test('Recording request matcher requires exact path, method, row occurrence and source IDs', () => {
  const start = hook.indexOf('const RECORDING_DOWNLOAD_PATH =');
  const end = hook.indexOf('const readBlobAsText', start);
  assert.ok(start >= 0 && end > start);
  const source = hook.slice(start, end) + '\nisVerifiedTranscriptRequest';
  const matcher = vm.runInNewContext(source, { URL, location: { href: 'https://imprivata.zoom.us/recording/meeting/transcript' } });
  const capture = { meetingId: 'occurrence-fixture', sourceId: 'row-fixture' };
  const valid = { transport: 'xhr', method: 'POST', body: JSON.stringify({ meetingId: capture.meetingId, sortKey: capture.sourceId }), capture };
  assert.equal(matcher('/rest/meeting/transcript/user/download', valid), true);
  assert.equal(matcher('/rest/meeting/transcript/user/list', valid), false);
  assert.equal(matcher('/rest/meeting/transcript/user/download', { ...valid, method: 'GET' }), false);
  assert.equal(matcher('/rest/meeting/transcript/user/download', { ...valid, transport: 'fetch' }), false);
  assert.equal(matcher('/rest/meeting/transcript/user/download', { ...valid, body: JSON.stringify({ meetingId: 'other', sortKey: capture.sourceId }) }), false);
  assert.equal(matcher('/rest/meeting/transcript/user/download', { ...valid, body: JSON.stringify({ meetingId: capture.meetingId, sortKey: 'other' }) }), false);
});

test('export correlation uses scanned opaque sortKey plus occurrence ID', () => {
  const content = read('content.js');
  assert.ok(content.includes('recordingOccurrenceBySourceId = new Map(rows.map(row => [row.sourceId, row.occurrenceId]))'));
  assert.match(content, /occurrenceId = await getRecordingOccurrenceId\(sourceId\)/);
  assert.ok(content.includes('Recording row capture failed'), 'failed attempt emits a redacted category only');
  assert.ok(content.includes('payload?.sourceId !== active.sourceId'));
});
