import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createSourcePlan, orderSources } from '../lib/source-plan.mjs';
import { createDownloadSuppression, shouldSuppressNativeTranscriptDownload } from '../lib/download-suppression.mjs';
const script = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const event = () => ({ listeners: [], addListener(f) { this.listeners.push(f); } });
const store = data => ({ async get(keys) { if (keys == null) return {...data}; if (typeof keys === 'string') return {[keys]: data[keys]}; return Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,data[k]??v])); }, async set(v) { Object.assign(data,v); }, async remove(k) { delete data[k]; } });
function fixture(session = {}) {
  const local = {}, sent = [], created = [], removed = []; let tabId = 10;
  const chrome = {
    runtime: {id:'extension', onMessage:event(),onInstalled:event(),onStartup:event(),getPlatformInfo:async()=>({os:'mac'})},
    storage:{local:store(local),session:store(session)},
    action:{onClicked:event(),setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    scripting:{insertCSS:async()=>{},executeScript:async()=>{}},
    tabs:{onUpdated:event(),onRemoved:event(),onActivated:event(),query:async()=>[],create:async opts=>{const t={id:tabId++,status:'complete',url:opts.url};created.push({...t,...opts});return t;},get:async id=>created.find(t=>t.id===id),remove:async id=>removed.push(id),update:async()=>{},sendMessage:async(id,message)=>{sent.push({id,...message});return {ok:true};}},
    downloads:{onCreated:event(),onChanged:event(),onDeterminingFilename:event(),cancel:async()=>{},removeFile:async()=>{},erase:async()=>{},download:async()=>1},
  };
  const ctx=vm.createContext({chrome,createSourcePlan,orderSources,createDownloadSuppression,shouldSuppressNativeTranscriptDownload,Map,Promise,Date,URL,btoa,unescape,encodeURIComponent,console}); vm.runInContext(script,ctx);
  const run=(expression)=>vm.runInContext(expression,ctx);
  return {ctx,run,chrome,session,local,sent,created,removed};
}
const tick=()=>new Promise(r=>setImmediate(r));
{
 const f=fixture();await f.run('recoveryReady');
 f.ctx.payload={selected:['myNotes','recordings'],originUrl:'https://us01mynotes.zoom.us/allNotes',settings:{},scope:{page:2,rowKeys:['only-visible']},testLimit:1};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 assert.equal(f.created.length,1);assert.equal(f.created[0].active,false);
 assert.equal(f.sent.find(m=>m.type.endsWith('workerStartRecordings')).payload.scope.page,2);
 assert.equal(f.sent.find(m=>m.type.endsWith('workerStartRecordings')).payload.testLimit,1);
 const saved=f.session['ztd:source-runs'][0];assert.equal(saved.currentSource,'recordings');assert.equal(saved.workerStarted,true);
 await f.run('handleSourceWorkerResult(10,{runId:"wrong",source:"recordings",saved:99})');assert.equal(f.created.length,1);
 f.ctx.rid=saved.runId;await f.run('handleSourceWorkerResult(10,{runId:rid,source:"recordings",saved:1,failed:0})');
 assert.equal(f.created.length,2);assert.ok(f.sent.some(m=>m.type.endsWith('workerStartMyNotes')));
 await f.run('handleSourceWorkerResult(11,{runId:rid,source:"myNotes",saved:1,failed:0})');
 assert.equal(f.session['ztd:source-runs'].length,0);assert.equal(f.removed.length,2);
 assert.ok(f.sent.some(m=>m.type.endsWith('sourceRunFinished')&&m.payload.results.myNotes.saved===1));
}
{
 const first=fixture();await first.run('recoveryReady');first.ctx.payload={selected:['recordings','myNotes'],originUrl:'https://zoom.us/recording/meeting/transcript',settings:{}};
 await first.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 const restored=fixture(structuredClone(first.session));await restored.run('recoveryReady');
 assert.equal(restored.run('sourceRunByWorkerTab.size'),1);
 restored.ctx.rid=first.session['ztd:source-runs'][0].runId;
 await restored.run('stopSourceRun(1)');await restored.run('handleSourceWorkerResult(10,{runId:rid,source:"recordings",saved:1,stopped:true})');
 assert.equal(restored.created.length,0);assert.equal(restored.session['ztd:source-runs'].length,0);
}
{
 const f=fixture();await f.run('recoveryReady');f.ctx.payload={selected:['recordings','myNotes'],originUrl:'https://zoom.us/recording/meeting/transcript',settings:{}};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');f.ctx.rid=f.session['ztd:source-runs'][0].runId;
 await f.run('handleSourceWorkerResult(10,{runId:rid,source:"recordings",needsUserAction:{reason:"Sign in",url:"https://zoom.us/signin"}})');
 assert.equal(f.created.length,1);assert.equal(f.removed.length,0);assert.ok(f.sent.some(m=>m.type.endsWith('sourceRunPaused')));
}
{
 const f=fixture();await f.run('recoveryReady');
 f.ctx.expected={tabId:10,exportId:'e',expiresAt:Date.now()+30000,origin:'https://us01mynotes.zoom.us',folderPath:'root/My Notes',filename:'note.txt',url:'https://file-paa.zoom.us/export'};
 f.run('expectedNotesExportsByTab.set(10,expected)');
 await f.chrome.storage.session.set({'ztd:notes-export:10':f.ctx.expected});
 const handler=f.chrome.downloads.onDeterminingFilename.listeners[0];
 let suggestion;const native={id:5,url:'https://file-paa.zoom.us/export',referrer:'https://us01mynotes.zoom.us/note',mime:'text/plain'};
 assert.equal(handler(native,v=>suggestion=v),true);await tick();await tick();assert.equal(suggestion.filename,'root/My Notes/note.txt');
 assert.equal(f.run('expectedNotesExportsByTab.size'),0);
 suggestion='unset';handler({...native,id:6,url:'https://file-paa.zoom.us/manual',referrer:'https://us01mynotes.zoom.us/note'},v=>suggestion=v);await tick();assert.equal(suggestion,undefined);
 const restored=fixture(structuredClone(f.session));await restored.run('recoveryReady');
 restored.chrome.downloads.onChanged.listeners[1]({id:5,state:{current:'complete'}});await tick();
 assert.ok(restored.sent.some(m=>m.id===10&&m.payload.exportId==='e'&&m.payload.ok));
}
console.log('coordinator.test.mjs: all tests passed');
