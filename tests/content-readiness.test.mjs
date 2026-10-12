import assert from 'node:assert/strict';
import { sendWhenContentReady } from '../lib/content-readiness.mjs';

let ready = false;
let injections = 0;
let sends = 0;
const pause = async () => { ready = true; };
const result = await sendWhenContentReady({
  ping: async () => ready,
  inject: async () => { injections++; },
  send: async () => { sends++; if (sends === 1) throw new Error('Receiving end does not exist'); return { ok: true }; },
  pause,
});
assert.deepEqual(result, { ok: true }, 'transient receiver loss is retried after the listener becomes ready');
assert.equal(injections, 1, 'same-document reinjection remains bounded to one idempotent injection');
assert.equal(sends, 2);

let unavailableInjections = 0;
await assert.rejects(() => sendWhenContentReady({
  ping: async () => false,
  inject: async () => { unavailableInjections++; },
  send: async () => { throw new Error('must not send before ping'); },
  pause: async () => {},
  attempts: 2,
}), /did not become ready/);
assert.equal(unavailableInjections, 2, 'bounded recovery retries reinjection rather than hanging');
console.log('content-readiness.test.mjs: all tests passed');
