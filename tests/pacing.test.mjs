import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../lib/pacing.js', import.meta.url), 'utf8');
function createPacer() {
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context);
  return context.globalThis.ZTDPacing;
}

test('fast prior item gets only the remainder of the 900ms start interval', async () => {
  const pacer = createPacer();
  let now = 1000;
  const waits = [];
  const started = await pacer.waitForNextStart(900, () => now, async ms => { waits.push(ms); now += ms; });
  assert.deepEqual(waits, [800]);
  assert.equal(started - 900, 900);
});

test('slow item consumes the interval with no extra artificial wait', async () => {
  const pacer = createPacer();
  let now = 4200;
  const waits = [];
  const started = await pacer.waitForNextStart(1000, () => now, async ms => { waits.push(ms); now += ms; });
  assert.deepEqual(waits, []);
  assert.equal(started - 1000, 3200);
});

test('recording item processing remains awaited and serial across pages', () => {
  const content = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
  assert.equal((content.match(/await saveTranscriptRow\(/g) || []).length, 2);
  assert.equal((content.match(/previousItemStartMs = await waitForNextRecordingStart\(previousItemStartMs\)/g) || []).length, 2);
  assert.doesNotMatch(content, /Promise\.all[^;]*saveTranscriptRow/);
});
