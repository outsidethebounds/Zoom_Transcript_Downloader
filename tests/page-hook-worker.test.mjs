import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let clicks=0;const handlers=[];const control=message=>handlers.forEach(handler=>handler({source:window,origin:'https://app.zoom.us',data:message}));
class Anchor { constructor(href){this.href=href;} click(){clicks++;} }
class XHR { constructor(){this.listeners={};this.responseType='';this.responseText='synthetic transcript body';} open(method,url){this.url=url;} send(){} addEventListener(type,fn){this.listeners[type]=fn;} getResponseHeader(){return 'application/json';} triggerLoad(){this.listeners.load?.();} }
const window={fetch:async()=>({}),XMLHttpRequest:XHR,postMessage(){},addEventListener(_,f){handlers.push(f)}};
vm.runInNewContext(fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8'),{window,location:{origin:'https://app.zoom.us',href:'https://app.zoom.us/'},HTMLAnchorElement:Anchor,TextDecoder,Promise});
new Anchor('blob:https://app.zoom.us/manual').click();assert.equal(clicks,1,'manual download outside worker remains');
control({source:'ztd-recording-worker-control',active:true});
new Anchor('blob:https://app.zoom.us/native').click();assert.equal(clicks,1,'worker native transcript anchor prevented');
new Anchor('https://example.com/report').click();assert.equal(clicks,2,'unrelated download untouched');
control({source:'ztd-recording-worker-control',active:false});
new Anchor('blob:https://app.zoom.us/manual').click();assert.equal(clicks,3,'worker completion restores manual downloads');
// The authenticated recording-list bridge emits allowlisted metadata only,
// excludes the raw API response from the generic transcript hook, and accepts
// Zoom's terminal page shape where data is omitted and hasNextPage is false.
const bridgeMessages=[];let requestPage=0,rawClones=0;
const apiWindow={fetch:async url=>{requestPage++;const page=Number(new URL(url).searchParams.get('page'));const body=page===1?{status:true,result:{page:1,total:1,hasNextPage:true,data:[{meetingId:'opaque-occ',sortKey:'opaque-row',topic:'Fixture',host:'host@example.test',createTime:'2026-01-01',canDownload:false,transcriptBody:'MUST_NOT_CROSS',signedUrl:'TEST_ONLY_SENTINEL_NOT_A_URL'}]}}:{status:true,result:{page:2,total:0,hasNextPage:false}};return {ok:true,status:200,headers:{get:()=> 'application/json'},clone(){rawClones++;return {text:async()=>JSON.stringify(body)}},json:async()=>body}},XMLHttpRequest:XHR,postMessage(message){bridgeMessages.push(message)},addEventListener(_,f){handlers.push(f)}};
const bridgeHandlers=[];
vm.runInNewContext(fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8'),{window:apiWindow,location:{origin:'https://app.zoom.us',href:'https://app.zoom.us/'},fetch:(...args)=>apiWindow.fetch(...args),URL,HTMLAnchorElement:Anchor,TextDecoder,Promise});
const scanHandler=handlers.at(-1);await scanHandler({source:apiWindow,origin:'https://app.zoom.us',data:{source:'ztd-recording-metadata-request',action:'scan',requestId:'scan-12345678'}});
const bridged=bridgeMessages.at(-1);assert.equal(bridged.type,'recording-metadata-result');assert.equal(bridged.payload.rows.length,1);assert.equal(bridged.payload.rows[0].meetingId,'opaque-occ');assert.equal(bridged.payload.rows[0].canDownload,false);assert.equal(bridged.payload.pages,2);assert.equal(bridged.payload.expectedCount,1);assert.equal('transcriptBody' in bridged.payload.rows[0],false);assert.equal('signedUrl' in bridged.payload.rows[0],false);assert.equal(rawClones,0,'list response never enters generic transcript hook');
async function scanPages(responses) {
  const messages=[];const listeners=[];
  const scanWindow={fetch:async url=>{const page=Number(new URL(url).searchParams.get('page'));const body=responses[page-1];return {ok:true,status:200,headers:{get:()=> 'application/json'},clone(){return {text:async()=>JSON.stringify(body)}},json:async()=>body}},XMLHttpRequest:XHR,postMessage(message){messages.push(message)},addEventListener(_,fn){listeners.push(fn)}};
  vm.runInNewContext(fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8'),{window:scanWindow,location:{origin:'https://app.zoom.us',href:'https://app.zoom.us/'},fetch:(...args)=>scanWindow.fetch(...args),URL,HTMLAnchorElement:Anchor,TextDecoder,Promise});
  const handler=listeners.find(fn=>fn.toString().includes('recording-metadata-request'));
  await handler({source:scanWindow,origin:'https://app.zoom.us',data:{source:'ztd-recording-metadata-request',action:'scan',requestId:'scan-regression-123'}});
  return messages.at(-1).payload;
}
const rows=Array.from({length:4},(_,i)=>({meetingId:'occ-'+(i+1),sortKey:'row-'+(i+1),topic:'Row '+(i+1)}));
// Observed Zoom sequence: page 4 contains data and says hasNextPage=true;
// page 5 is the empty terminal page with hasNextPage=false. No terminal total
// field is required, but page 1's authoritative total must match collected rows.
const observedTerminal=await scanPages([
 ...rows.map((row,i)=>({status:true,result:{page:i+1,total:4,hasNextPage:true,data:[row]}})),
 {status:true,result:{page:5,hasNextPage:false,data:[]}},
]);
assert.equal(observedTerminal.ok,true);assert.equal(observedTerminal.exhausted,true);assert.equal(observedTerminal.rows.length,4);assert.equal(observedTerminal.terminalPage,5);
const emptyStillHasNext=await scanPages([
 {status:true,result:{page:1,hasNextPage:true,data:[rows[0]]}},
 {status:true,result:{page:2,hasNextPage:true,data:[]}},
]);
assert.equal(emptyStillHasNext.ok,false,'empty page with hasNextPage=true cannot certify completion, even without total');
assert.match(emptyStillHasNext.error,/empty recording page/i);
const absentContinuation=await scanPages([
 {status:true,result:{page:1,data:[rows[0]]}},
]);
assert.equal(absentContinuation.ok,false,'missing hasNextPage is a schema failure, not completion');
const mismatchedTotal=await scanPages([
 {status:true,result:{page:1,total:2,hasNextPage:true,data:[rows[0]]}},
 {status:true,result:{page:2,total:2,hasNextPage:false,data:[]}},
]);
assert.equal(mismatchedTotal.ok,false,'terminal empty page cannot certify a count mismatch');
assert.match(mismatchedTotal.error,/does not match/i);
// Request start snapshots are attempt-bound; with no verified exact route contract,
// actual provider-shaped requests stay fail-closed and their bodies are never read.
async function captureHarness() {
  const messages=[],listeners=[];let bodyReads=0;
  const fakeWindow={fetch:async()=>({headers:{get:()=> 'application/json'},clone(){return {text:async()=>{bodyReads++;return 'synthetic body that must not be read';}}}}),XMLHttpRequest:XHR,postMessage(message){messages.push(message);setTimeout(()=>listeners.forEach(fn=>fn({source:fakeWindow,origin:'https://app.zoom.us',data:message})),0)},addEventListener:(type,fn)=>{if(type==='message')listeners.push(fn)}};
  const hookSource=fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8').replace('  const originalFetch = window.fetch.bind(window);','  window.__callFetch = url => window.fetch(url);\n  const originalFetch = window.fetch.bind(window);');
  vm.runInNewContext(hookSource,{window:fakeWindow,location:{origin:'https://app.zoom.us',href:'https://app.zoom.us/'},fetch:(...a)=>fakeWindow.fetch(...a),URL,HTMLAnchorElement:Anchor,TextDecoder,Promise,setTimeout});
  return {window:fakeWindow,messages,fetch:url=>fakeWindow.__callFetch(url),reads:()=>bodyReads};
}
const hookCode=fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8');
assert.match(hookCode,/RECORDING_DOWNLOAD_PATH = '\/rest\/meeting\/transcript\/user\/download'/,'verified route is exact');
assert.match(hookCode,/body\?\.meetingId === request\.capture\.meetingId/,'request is bound to the captured occurrence ID');
assert.match(hookCode,/body\?\.sortKey === request\.capture\.sourceId/,'request is bound to the captured opaque row ID');
assert.match(hookCode,/const captureAtStart = activeCapture && \{ \.\.\.activeCapture \}/,'fetch binds the generation before awaiting its response');
assert.match(hookCode,/xhr\.send = function\(\.\.\.args\) \{ requestBody = args\[0\] \?\? null; captureAtStart = activeCapture/,'XHR binds request body and generation at send time');
const capture=await captureHarness();
const readyPromise=new Promise(resolve=>capture.window.addEventListener('message',event=>{if(event.data?.type==='capture-ready')resolve(event.data.payload)}));
const activation={source:'ztd-recording-item-capture',active:true,runId:'run-one',generation:1,meetingId:'same-meeting',sourceId:'row-one',requestId:'ready-one'};
capture.window.postMessage(activation,'https://app.zoom.us');
const ready=await readyPromise;assert.equal(ready.generation,1);assert.equal(ready.runId,'run-one');assert.equal(ready.requestId,'ready-one');
// A fetch begun during generation 1 remains tied to it while generation 2 activates.
const fetchBeforeRetry=capture.fetch('https://app.zoom.us/unverified/export-route');
await new Promise(resolve=>setTimeout(resolve,0));
capture.window.postMessage({source:'ztd-recording-item-capture',active:false,runId:'run-one',generation:1},'https://app.zoom.us');
capture.window.postMessage({source:'ztd-recording-item-capture',active:true,runId:'run-two',generation:2,meetingId:'same-meeting',sourceId:'row-one',requestId:'ready-two'},'https://app.zoom.us');
await fetchBeforeRetry;await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(capture.reads(),0,'unknown endpoint contract fails closed without reading a response body');
assert.equal(capture.messages.some(m=>m.type==='transcript-response'),false,'no transcript body is bridged without verified route evidence');
const readyTwo=capture.messages.find(m=>m.type==='capture-ready'&&m.payload?.generation===2);assert.ok(readyTwo,'same-meeting retry has distinct generation acknowledgement');
// A different-meeting run likewise receives a distinct acknowledged generation.
capture.window.postMessage({source:'ztd-recording-item-capture',active:true,runId:'run-three',generation:3,meetingId:'different-meeting',sourceId:'row-three',requestId:'ready-three'},'https://app.zoom.us');
await new Promise(resolve=>setTimeout(resolve,0));assert.ok(capture.messages.some(m=>m.type==='capture-ready'&&m.payload?.generation===3&&m.payload?.meetingId==='different-meeting'));
// XHR records attempt identity at send(), not open(); absent endpoint evidence, it never reads.
const xhr=new capture.window.XMLHttpRequest();xhr.open('POST','https://app.zoom.us/unverified/export-route');xhr.send();xhr.triggerLoad();await Promise.resolve();await Promise.resolve();
assert.equal(capture.reads(),0);
// Test-only matcher override exercises the production fetch/body-read lifecycle;
// the arbitrary URL below is not a claimed Zoom endpoint or compatibility fixture.
async function mechanicsHarness(){
 const listeners=[],messages=[];let releaseBody;let reads=0;
 const response={headers:{get:()=> 'text/plain'},clone(){return {text(){reads++;return new Promise(resolve=>{releaseBody=resolve})}}}};
 const win={fetch:async()=>response,XMLHttpRequest:XHR,postMessage(message){messages.push(message);setTimeout(()=>listeners.slice().forEach(fn=>fn({source:win,data:message})),0)},addEventListener(type,fn){if(type==='message')listeners.push(fn)}};
 const src=fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8').replace(/  const isVerifiedTranscriptRequest = \(url, request\) => \{[\s\S]*?  \};/, '  const isVerifiedTranscriptRequest = () => true;').replace('  const originalFetch = window.fetch.bind(window);','  window.__callFetch = url => window.fetch(url);\n  const originalFetch = window.fetch.bind(window);');
 vm.runInNewContext(src,{window:win,location:{origin:'https://app.zoom.us',href:'https://app.zoom.us/'},URL,HTMLAnchorElement:Anchor,TextDecoder,Promise,setTimeout});
 return {win,messages,fetch:url=>win.__callFetch(url),release:()=>releaseBody?.('mechanics-only body'),reads:()=>reads};
}
const mechanics=await mechanicsHarness();
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
mechanics.win.postMessage({source:'ztd-recording-item-capture',active:true,runId:'same-run',generation:1,meetingId:'same-id',sourceId:'row-key',requestId:'g1'},'https://app.zoom.us');await tick();
const delayed=mechanics.fetch('https://app.zoom.us/unverified/mechanics');await delayed;await tick();assert.equal(mechanics.reads(),1,'test seam reaches the real delayed body-read path');
mechanics.win.postMessage({source:'ztd-recording-item-capture',active:false,runId:'same-run',generation:1},'https://app.zoom.us');
mechanics.win.postMessage({source:'ztd-recording-item-capture',active:true,runId:'retry-run',generation:2,meetingId:'same-id',sourceId:'row-key',requestId:'g2'},'https://app.zoom.us');await tick();
mechanics.release();await tick();assert.equal(mechanics.messages.some(m=>m.type==='transcript-response'),false,'same-meeting retry cannot accept generation-1 body after asynchronous read');
// XHR blob decoding is also awaited; changing generation before that await resolves rejects it.
const xhrListeners=[],xhrMessages=[];let releaseBlob,xhrBodyReads=0;
class SlowBlobXHR {constructor(){this.listeners={};this.responseType='blob';this.response={text(){xhrBodyReads++;return new Promise(resolve=>{releaseBlob=resolve})}}}open(){}send(){}addEventListener(type,fn){this.listeners[type]=fn}status=200;getResponseHeader(){return 'text/plain;charset=UTF-8'}triggerLoad(){this.listeners.load?.()}}
const xhrWindow={fetch:async()=>({}),XMLHttpRequest:SlowBlobXHR,postMessage(message){xhrMessages.push(message);setTimeout(()=>xhrListeners.slice().forEach(fn=>fn({source:xhrWindow,data:message})),0)},addEventListener(type,fn){if(type==='message')xhrListeners.push(fn)}};
const xhrSource=fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8').replace('const isVerifiedTranscriptRequest = () => false;','const isVerifiedTranscriptRequest = () => true;');
vm.runInNewContext(xhrSource,{window:xhrWindow,location:{origin:'https://app.zoom.us',href:'https://app.zoom.us/'},URL,HTMLAnchorElement:Anchor,TextDecoder,Promise,setTimeout});
xhrWindow.postMessage({source:'ztd-recording-item-capture',active:true,runId:'xhr-run',generation:11,meetingId:'same-id',sourceId:'row-key',requestId:'xhr-ready'},'https://app.zoom.us');await new Promise(resolve=>setTimeout(resolve,0));
const slowXhr=new xhrWindow.XMLHttpRequest();slowXhr.open('POST','https://app.zoom.us/rest/meeting/transcript/user/download');slowXhr.send(JSON.stringify({meetingId:'same-id',sortKey:'row-key'}));slowXhr.triggerLoad();await Promise.resolve();await Promise.resolve();assert.equal(xhrBodyReads,1,'XHR response decoding entered asynchronous body read');
xhrWindow.postMessage({source:'ztd-recording-item-capture',active:false,runId:'xhr-run',generation:11},'https://app.zoom.us');
xhrWindow.postMessage({source:'ztd-recording-item-capture',active:true,runId:'xhr-retry',generation:12,meetingId:'same-id',sourceId:'row-key',requestId:'xhr-ready-2'},'https://app.zoom.us');await new Promise(resolve=>setTimeout(resolve,0));
releaseBlob('delayed mechanics-only body');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(xhrMessages.some(m=>m.type==='transcript-response'),false,'stale XHR blob body is not accepted into a new retry');
console.log('page-hook-worker.test.mjs: all tests passed');
