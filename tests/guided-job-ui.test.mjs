import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const workspace=read('workspace.js'),html=read('workspace.html'),css=read('workspace.css'),background=read('background.js'),content=read('content.js');
test('guided download presentation is prominent, live, and non-blocking',()=>{
 assert.match(html,/id="job-shade" class="job-shade" hidden/);assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/Leave this tab open and untouched/);assert.match(html,/Manage downloads in your extension workspace/);
 assert.match(css,/.job-shade{[^}]*pointer-events:none/);assert.match(workspace,/function showJob/);assert.match(workspace,/function hideJob/);assert.match(workspace,/pending/);assert.match(workspace,/guidedFinished[^}]*hideJob/);assert.ok(workspace.includes("setStage(hasError?'review':'save')"));
});
test('workflow stepper marks current step and completed checks',()=>{assert.match(html,/role="list" aria-label="Workflow progress"/);assert.match(workspace,/aria-current','step'/);assert.match(workspace,/step.firstChild.textContent=i</)});
test('guided source tabs are reused and only extension-owned tabs close',()=>{assert.match(background,/const reusable = run.guided/);assert.match(background,/run.workerTabOwned = !reusable/);assert.match(background,/run.workerTabOwned !== true/);assert.match(background,/const workspaceOpen = tabs.some/);});
test('recording item counters route to guided workspace without exposing transcript content',()=>{assert.ok(content.includes('progress: { saved: downloadManifest.length, skipped: skippedUnavailable'));assert.ok(background.includes('progress: message.payload?.progress'))});
test('mock timer receives only the intentional 1500ms gap; readiness/backoff stay separate',async()=>{const context=vm.createContext({globalThis:{}});vm.runInContext(read('lib/pacing.js'),context);let got;await context.globalThis.ZTDPacing.wait(ms=>{got=ms;return Promise.resolve()});assert.equal(got,1500);assert.match(content,/TRANSITION_TIMEOUT_MS = 30000/);assert.ok(read('my-notes.js').includes('}, 35000);'));assert.ok(read('lib/notes-direct.js').includes('retryDelay(failure.retryAfter, attempt)'))});
