import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
function functionSource(name){const marker='function '+name+'(';let start=source.indexOf(marker);assert.notEqual(start,-1);const open=source.indexOf('{',start);let depth=0,quote='',escaped=false;for(let i=open;i<source.length;i++){const c=source[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue}if(c==='"'||c==="'"){quote=c;continue}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1)}throw Error('unclosed '+name)}
function queuedWindow(){const handlers=[];const posted=[];const win={addEventListener:(type,fn)=>{if(type==='message')handlers.push(fn)},removeEventListener:(type,fn)=>{const i=handlers.indexOf(fn);if(i>=0)handlers.splice(i,1)},postMessage(message){posted.push(message);setTimeout(()=>handlers.slice().forEach(fn=>fn({source:win,data:message})),0)}};return {win,posted,dispatch(data){handlers.slice().forEach(fn=>fn({source:win,data}))}}}

test('capture readiness awaits queued bridge acknowledgement before the caller proceeds',async()=>{
 const {win,posted}=queuedWindow();const context={window:win,location:{origin:'https://app.zoom.us'},crypto:{randomUUID:()=> 'unique-request'},setTimeout,clearTimeout,Promise,Error};
 vm.runInNewContext(functionSource('waitForCaptureReady'),context);const capture={runId:'run-1',generation:1,meetingId:'same-id',sourceId:'row-id'};let clicked=false;
 const ready=context.waitForCaptureReady(capture,500);await new Promise(resolve=>setTimeout(resolve,1));assert.equal(clicked,false);assert.equal(posted[0].active,true);assert.doesNotThrow(()=>structuredClone(posted[0]),'page-world bridge payload must be structured-cloneable and exclude capture cleanup functions');assert.equal('cancelReady' in posted[0],false);
 win.postMessage({source:'zoom-transcript-extension',type:'capture-ready',payload:{...capture,requestId:posted[0].requestId}},'https://app.zoom.us');await ready;clicked=true;assert.equal(clicked,true);
});

test('readiness is bounded/cancellable and stale generation cleanup is a no-op',async()=>{
 const {win,posted}=queuedWindow();const context={window:win,crypto:{randomUUID:()=> 'cancel-request'},setTimeout,clearTimeout,Promise,Error,location:{origin:'https://app.zoom.us'},sourceWorkerRun:null,activeTranscriptCapture:{runId:'new-run',generation:7,meetingId:'same-id',sourceId:'row-id'},transcriptResponseQueue:['retained']};
 vm.runInNewContext(functionSource('waitForCaptureReady')+'\n'+functionSource('deactivateTranscriptCapture'),context);
 const capture={runId:'new-run',generation:7,meetingId:'same-id',sourceId:'row-id'};const pending=context.waitForCaptureReady(capture,1000);await new Promise(resolve=>setTimeout(resolve,1));capture.cancelReady();await assert.rejects(pending,/cancelled/i);
 assert.equal(context.deactivateTranscriptCapture(6,'old-run'),false);assert.equal(context.activeTranscriptCapture.generation,7);assert.deepEqual(Array.from(context.transcriptResponseQueue),['retained']);
 assert.equal(context.deactivateTranscriptCapture(7,'new-run'),true);assert.equal(context.activeTranscriptCapture,null);assert.deepEqual(Array.from(context.transcriptResponseQueue),[]);
});


test('content accepts only current run and generation even for the same meeting ID',()=>{
 const context={window:{},activeTranscriptCapture:{runId:'retry-2',generation:2,meetingId:'same-id',sourceId:'row-id'},sourceWorkerRun:{runId:'retry-2'},saveAllController:{running:true},pendingTranscriptWaiters:[{resolve(value){context.accepted=value}}],transcriptResponseQueue:[],chrome:{runtime:{sendMessage(){return Promise.resolve()}}}};
 vm.runInNewContext(functionSource('handleTranscriptResponseMessage'),context);
 const send=(runId,generation)=>context.handleTranscriptResponseMessage({source:context.window,data:{source:'zoom-transcript-extension',type:'transcript-response',payload:{runId,generation,meetingId:'same-id',sourceId:'row-id',text:'synthetic body with enough length'}}});
 send('retry-1',1);assert.equal(context.accepted,undefined,'old same-meeting retry is rejected');assert.equal(context.pendingTranscriptWaiters.length,1);
 send('other-run',2);assert.equal(context.accepted,undefined,'another run is rejected even with matching generation and meeting');
 send('retry-2',2);assert.equal(context.accepted.runId,'retry-2');assert.equal(context.accepted.generation,2);
});
