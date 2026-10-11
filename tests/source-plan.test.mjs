import assert from 'node:assert/strict';
import { createSourcePlan, orderSources } from '../lib/source-plan.mjs';

assert.deepEqual(orderSources(['myNotes', 'recordings', 'recordings']), ['recordings', 'myNotes']);
assert.deepEqual(orderSources(['myNotes']), ['myNotes']);

const complete = createSourcePlan(['myNotes', 'recordings']);
assert.equal(complete.next(), 'recordings');
assert.equal(complete.complete('recordings', { saved: 2, failed: 1 }).done, false);
assert.equal(complete.next(), 'myNotes');
assert.equal(complete.complete('myNotes', { saved: 1 }).done, true);
assert.deepEqual(complete.results, { recordings: { saved: 2, failed: 1 }, myNotes: { saved: 1 } });

const paused = createSourcePlan(['recordings', 'myNotes']);
assert.equal(paused.next(), 'recordings');
assert.equal(paused.complete('recordings', { needsUserAction: { reason: 'sign-in' } }).paused, true);
assert.equal(paused.next(), null);
assert.deepEqual(paused.remaining, ['myNotes']);

const stopped = createSourcePlan(['recordings', 'myNotes']);
assert.equal(stopped.next(), 'recordings');
stopped.stop();
assert.equal(stopped.next(), null);
assert.equal(stopped.complete('recordings', { saved: 1 }).stopped, true);
assert.deepEqual(stopped.remaining, []);

console.log('source-plan.test.mjs: all tests passed');
