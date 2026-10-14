import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function executeRecordingWorker'),source.indexOf('async function startRecordingWorker',source.indexOf('async function executeRecordingWorker')));
function harness({stop=false,stopInBoot=false,rows=true,mode='all'}={}){let calls=0,clock=0;const run={mode,stopRequested:stop};const sandbox={sourceWorkerRun:run,saveAllController:{running:true,stopRequested:stop},scanRows:()=>rows?[{}]:[],Date:{now:()=>clock},sleep:async ms=>{clock+=ms},boot:async()=>{if(stopInBoot)run.stopRequested=true},recordingWorkerActions:{all:async()=>{calls++},page:async()=>{calls+=10}},document:{querySelector:()=>({disabled:true,click:()=>{throw Error('Disabled button must not be used')}})}};return {execute:()=>vm.runInNewContext('('+fn+')(run)',{...sandbox,run}),calls:()=>calls};}
test('standalone panel click wrappers do not pass the DOM event as a worker run',()=>{assert.match(source,/addEventListener\('click', \(\) => recordingWorkerActions\.all\(\)\)/);assert.match(source,/addEventListener\('click', \(\) => recordingWorkerActions\.page\(\)\)/);});
test('reused tab starts worker directly even when UI save button is disabled',async()=>{const h=harness();await h.execute();assert.equal(h.calls(),1);assert.doesNotMatch(fn,/\.click\(/);});
test('current-page worker dispatches direct page action',async()=>{const h=harness({mode:'page'});await h.execute();assert.equal(h.calls(),10);});
test('Stop before startup prevents exports',async()=>{const h=harness({stop:true});await assert.rejects(h.execute(),/stopped before export/);assert.equal(h.calls(),0);});
test('Stop during boot prevents exports',async()=>{const h=harness({stopInBoot:true});await assert.rejects(h.execute(),/stopped before export/);assert.equal(h.calls(),0);});
test('missing rows is a bounded startup failure rather than phantom run',async()=>{const h=harness({rows:false});await assert.rejects(h.execute(),/startup deadline/);assert.equal(h.calls(),0);});
