import assert from 'node:assert/strict';
import test from 'node:test';
import { scanWithReadiness } from '../lib/guided-scan-retry.mjs';

test('first login scan resumes after delayed redirect/readiness without manual retry or exports', async () => {
  let ready = false, scans = 0, exports = 0, waits = 0, notices = 0;
  const result = await scanWithReadiness({
    scan: async () => { scans++; if (!ready) return { ok: false, needsUserAction: true, error: 'Zoom sign-in is required.' }; return { ok: true, exhausted: true, assets: [{ sourceId: 'mock' }] }; },
    pause: async () => { waits++; ready = true; },
    onWaiting: () => notices++,
    retryDelayMs: 1, timeoutMs: 20,
  });
  assert.equal(result.ok, true); assert.equal(result.attempts, 2); assert.equal(scans, 2);
  assert.equal(waits, 1); assert.equal(notices, 1); assert.equal(exports, 0);
});

test('recording API 401 race retries after session becomes available', async () => {
  let scans = 0, available = false;
  const result = await scanWithReadiness({ scan: async () => { scans++; return available ? { ok: true, exhausted: true } : { ok: false, error: 'Zoom API HTTP 401 unauthorized' }; }, pause: async () => { available = true; }, retryDelayMs: 1, timeoutMs: 20 });
  assert.equal(result.ok, true); assert.equal(scans, 2);
});

test('Stop cancels a readiness wait promptly', async () => {
  let cancelled = false;
  const result = await scanWithReadiness({ scan: async () => ({ ok: false, needsUserAction: true }), isCancelled: () => cancelled, pause: async () => { cancelled = true; }, retryDelayMs: 1, timeoutMs: 50 });
  assert.equal(result.stopped, true); assert.equal(result.needsUserAction, undefined);
});

test('auth/readiness wait expires boundedly and asks for explicit Zoom sign-in', async () => {
  let time = 0;
  const result = await scanWithReadiness({ scan: async () => ({ ok: false, needsUserAction: true }), pause: async ms => { time += ms; }, now: () => time, timeoutMs: 3000, retryDelayMs: 1000 });
  assert.equal(result.expired, true); assert.equal(result.needsUserAction, true); assert.equal(result.attempts, 4);
  assert.match(result.error, /Open Zoom to sign in/);
});

test('genuine terminal scan errors are not retried', async () => {
  let scans = 0;
  const result = await scanWithReadiness({ scan: async () => { scans++; return { ok: false, error: 'Clear the date filter.' }; }, pause: async () => assert.fail('must not wait') });
  assert.equal(scans, 1); assert.equal(result.attempts, 1); assert.equal(result.expired, undefined);
});
console.log('guided-scan-retry.test.mjs: all tests passed');
