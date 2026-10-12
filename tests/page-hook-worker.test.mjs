import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let clicks=0;const handlers=[];const control=message=>handlers.forEach(handler=>handler({source:window,origin:'https://app.zoom.us',data:message}));
class Anchor { constructor(href){this.href=href;} click(){clicks++;} }
class XHR { open(){} addEventListener(){} }
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
console.log('page-hook-worker.test.mjs: all tests passed');
