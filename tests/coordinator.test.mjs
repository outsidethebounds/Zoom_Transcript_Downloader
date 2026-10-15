import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createSourcePlan, orderSources } from '../lib/source-plan.mjs';
import { sendWhenContentReady } from '../lib/content-readiness.mjs';
import { createDownloadSuppression, shouldSuppressNativeTranscriptDownload } from '../lib/download-suppression.mjs';
import { datedBatchFolder, sourceFolderPath } from '../lib/download-settings.mjs';
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
    downloads:{onCreated:event(),onChanged:event(),onDeterminingFilename:event(),cancel:async()=>{},removeFile:async()=>{},erase:async()=>{},download:async()=>1,search:async()=>[{state:'complete',fileSize:10}]},
  };
  const ctx=vm.createContext({chrome,createSourcePlan,orderSources,sendWhenContentReady,createDownloadSuppression,shouldSuppressNativeTranscriptDownload,datedBatchFolder,sourceFolderPath,Map,Promise,Date,URL,crypto,TextEncoder,Uint8Array,btoa,unescape,encodeURIComponent,console,setTimeout}); vm.runInContext(script,ctx);
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
 await restored.run('stopSourceRun(1)');assert.ok(restored.sent.some(m=>m.type.endsWith('sourceRunProgress')&&m.payload.state==='stopping'));await restored.run('handleSourceWorkerResult(10,{runId:rid,source:"recordings",saved:1,stopped:true})');
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
 const native={id:5,url:'https://file-paa.zoom.us/export',referrer:'https://us01mynotes.zoom.us/note',mime:'text/plain'};
 const suggestion=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('filename suggestion timed out')),2000);assert.equal(handler(native,value=>{clearTimeout(timer);resolve(value)}),true)});
 assert.equal(suggestion.filename,'root/My Notes/note.txt');
 assert.equal(f.run('expectedNotesExportsByTab.size'),0);
 const unmatched=await new Promise(resolve=>handler({...native,id:6,url:'https://file-paa.zoom.us/manual',referrer:'https://us01mynotes.zoom.us/note'},resolve));assert.equal(unmatched,undefined);
 const restored=fixture(structuredClone(f.session));await restored.run('recoveryReady');
 restored.chrome.downloads.onChanged.listeners[1]({id:5,state:{current:'complete'}});await tick();
 assert.ok(restored.sent.some(m=>m.id===10&&m.payload.exportId==='e'&&m.payload.ok));
}
{
 const f=fixture();await f.run('recoveryReady');
 f.ctx.payload={selected:['myNotes'],originUrl:'https://us01mynotes.zoom.us/allNotes',settings:{}};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 f.ctx.direct={exportId:'run:note',filename:'note.txt',folderPath:f.session['ztd:source-runs'][0].rootFolder+'/My Notes',url:'https://file-paa.zoom.us/opaque?signature=example',expiresAt:Date.now()+30000};
 let downloads=0;f.chrome.downloads.download=async options=>{downloads++;let suggestion;f.chrome.downloads.onDeterminingFilename.listeners[0]({id:100,byExtensionId:'extension',url:options.url},value=>suggestion=value);assert.equal(suggestion.filename,options.filename,'Chrome filename listener must reiterate direct-save path rather than revert to server filename');assert.equal(options.conflictAction,'uniquify');assert.equal(options.filename,f.ctx.direct.folderPath+'/note.txt');return 100;};
 const [a,b]=await Promise.all([f.run('saveMyNotesDirect(direct,{tab:{id:10}})'),f.run('saveMyNotesDirect(direct,{tab:{id:10}})')]);
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(downloads,1,'same ID/in-flight request never downloads twice');
 assert.equal(JSON.stringify(f.session).includes('signature'),false,'signed URLs never stored');
 await f.run('saveMyNotesDirect(direct,{tab:{id:10}})');assert.equal(downloads,1,'late replay after completion deduped');
 f.ctx.direct.exportId='expired';f.ctx.direct.expiresAt=Date.now()-1;
 assert.equal((await f.run('saveMyNotesDirect(direct,{tab:{id:10}})')).expired,true);assert.equal(downloads,1);
 f.ctx.direct.expiresAt=Date.now()+30000;f.chrome.downloads.search=async()=>[{state:'interrupted',error:'SERVER_FORBIDDEN'}];
 assert.equal((await f.run('saveMyNotesDirect(direct,{tab:{id:10}})')).expired,true);
 f.chrome.downloads.search=async()=>[{state:'complete',fileSize:10}];
 assert.equal((await f.run('saveMyNotesDirect(direct,{tab:{id:10}})')).ok,true,'one fresh signed URL retry can save an interrupted attempt');
 await f.run('stopSourceRun(1)');f.ctx.direct.exportId='after-stop';
 assert.equal((await f.run('saveMyNotesDirect(direct,{tab:{id:10}})')).cancelled,true);assert.equal(downloads,3);
}
{
 const f=fixture();await f.run('recoveryReady');
 f.ctx.expected={tabId:10,exportId:'private-native',expiresAt:Date.now()+30000,folderPath:'root/My Notes',filename:'note.txt'};
 f.run('expectedNotesExportsByTab.set(10,expected)');await f.chrome.storage.session.set({'ztd:notes-export:10':f.ctx.expected});
 const handler=f.chrome.runtime.onMessage.listeners[0];
 await new Promise(resolve=>handler({type:'zoomTranscriptExtension:correlateMyNotesExport',payload:{exportId:'private-native',url:'https://file-paa.zoom.us/opaque?signature=example'}},{tab:{id:10}},resolve));
 assert.equal(JSON.stringify(f.session).includes('signature'),false);
 assert.equal(f.session['ztd:notes-export:10'].urlHash.length,64);
 const restored=fixture(structuredClone(f.session));await restored.run('recoveryReady');
 const suggestion=await new Promise(resolve=>restored.chrome.downloads.onDeterminingFilename.listeners[0]({id:123,url:'https://file-paa.zoom.us/opaque?signature=example',finalUrl:'https://regional-cdn.zoom.us/file'},resolve));
 assert.equal(suggestion.filename,'root/My Notes/note.txt','private digest preserves exact routing after suspension, including redirected native URL');
}
{
 const f=fixture();await f.run('recoveryReady');f.ctx.payload={selected:['myNotes'],originUrl:'https://us01mynotes.zoom.us/allNotes',settings:{}};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 const runId=f.session['ztd:source-runs'][0].runId;
 await new Promise(resolve=>f.chrome.runtime.onMessage.listeners[0]({type:'zoomTranscriptExtension:sourceWorkerProgress',payload:{runId,progress:{saved:1,directSaved:1,discovered:32,eligible:1,processed:1,pending:31,signedUrl:'https://file-paa.zoom.us/private'},message:'Saved 1'}},{tab:{id:10}},resolve));
 assert.equal(JSON.stringify(f.session).includes('file-paa'),false,'progress persistence accepts counters only');
 const forwarded=f.sent.find(m=>m.type.endsWith('sourceRunProgress')&&m.payload.progress);assert.equal(forwarded.payload.progress.saved,1);assert.equal('signedUrl' in forwarded.payload.progress,false,'source-page UI gets counters only');
 f.chrome.tabs.onUpdated.listeners[0](10,{url:'https://zoom.us/signin?secret=not-persisted'},{url:'https://zoom.us/signin?secret=not-persisted'});
 await tick();await tick();await tick();
 const paused=f.sent.find(m=>m.type.endsWith('sourceRunPaused'));
 assert.ok(paused,'hard login navigation mid-run must pause instead of hanging the old worker');
 assert.equal(paused.payload.results.myNotes.saved,1);assert.equal(paused.payload.results.myNotes.pending,31);
 assert.equal(paused.payload.needsUserAction.url,'https://zoom.us/signin');
 assert.equal(f.removed.length,0,'login worker remains available for user sign-in');
 assert.equal(f.session['ztd:source-runs'].length,0);assert.equal(f.created.length,1);
}
{
 const f=fixture();await f.run('recoveryReady');f.ctx.payload={selected:['myNotes'],originUrl:'https://us01mynotes.zoom.us/allNotes',settings:{}};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 f.ctx.direct={exportId:'active-stop',filename:'note.txt',folderPath:f.session['ztd:source-runs'][0].rootFolder+'/My Notes',url:'https://file-paa.zoom.us/ephemeral',expiresAt:Date.now()+30000};
 let canceled=null;f.chrome.downloads.download=async()=>200;f.chrome.downloads.cancel=async id=>{canceled=id};
 f.chrome.downloads.search=async()=>{await f.run('stopSourceRun(1)');return [{state:'in_progress'}]};
 assert.equal((await f.run('saveMyNotesDirect(direct,{tab:{id:10}})')).cancelled,true);
 assert.equal(canceled,200,'Stop cancels only the correlated active direct download');
 assert.equal(f.run('directNoteFilenames.size'),0,'ephemeral source registry cleans up cancellation');
}
{
 const f=fixture();await f.run('recoveryReady');
 const handler=f.chrome.runtime.onMessage.listeners[0];
 handler({type:'zoomTranscriptExtension:guidedWorkspaceOpened'},{tab:{id:900}},()=>{});
 f.chrome.tabs.onRemoved.listeners[0](900);await tick();await tick();
 assert.equal(f.sent.some(m=>m.type.endsWith('setGuidedWorkspace')&&m.payload.active===false),false,'closing workspace must not restore the legacy source panels');
}
{
 const f=fixture();await f.run('recoveryReady');
 const origin={id:1,status:'complete',url:'https://acme.zoom.us/recording/meeting/transcript'};
 f.chrome.tabs.get=async id=>id===1?origin:f.created.find(tab=>tab.id===id)||null;
 f.chrome.tabs.query=async()=>[origin];
 f.ctx.payload={selected:['recordings','myNotes'],originUrl:origin.url,settings:{},guidedWorkspace:true};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:"https://acme.zoom.us/recording/meeting/transcript"}},()=>{})');
 const runId=f.session['ztd:source-runs'][0].runId;f.ctx.rid=runId;
 await f.run('handleSourceWorkerResult(1,{runId:rid,source:"recordings",saved:1})');
 assert.equal(f.created.length,1,'missing Notes source falls back to a dedicated worker tab');
 assert.equal(f.created[0].url,'https://us01mynotes.zoom.us/allNotes');
 assert.equal(f.sent.find(m=>m.type.endsWith('workerStartMyNotes'))?.id,10);
 await f.run('handleSourceWorkerResult(10,{runId:rid,source:"myNotes",saved:1})');
 assert.deepEqual(f.removed,[10],'only the extension-owned Notes fallback closes; original user Recording tab remains');
}
{
 const f=fixture();await f.run('recoveryReady');
 const origin={id:1,status:'complete',url:'https://acme.zoom.us/recording/meeting/transcript'};
 const notes={id:2,status:'complete',url:'https://us01mynotes.zoom.us/allNotes'};
 f.chrome.tabs.get=async id=>id===1?origin:id===2?notes:f.created.find(tab=>tab.id===id)||null;
 f.chrome.tabs.query=async()=>[origin,notes];
 f.ctx.payload={selected:['recordings','myNotes'],originUrl:'https://acme.zoom.us/recording/meeting/transcript',settings:{},guidedWorkspace:true};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:"https://acme.zoom.us/recording/meeting/transcript"}},()=>{})');
 const runId=f.session['ztd:source-runs'][0].runId;f.ctx.rid=runId;
 await f.run('handleSourceWorkerResult(1,{runId:rid,source:"recordings",saved:1})');
 assert.equal(f.created.length,0,'guided transition reuses an eligible existing My Notes tab');
 assert.equal(f.sent.find(m=>m.type.endsWith('workerStartMyNotes'))?.id,2);
 assert.equal(f.session['ztd:source-runs'][0].workerTabOwned,false);
 await f.run('handleSourceWorkerResult(2,{runId:rid,source:"myNotes",saved:1})');
 assert.deepEqual(f.removed,[],'neither user-created source tab is closed at completion');
}
{
 const f=fixture();await f.run('recoveryReady');
 const origin={id:1,status:'complete',url:'https://acme.zoom.us/recording/meeting/transcript'};
 f.chrome.tabs.get=async id=>id===1?origin:f.created.find(tab=>tab.id===id)||null;
 f.ctx.payload={selected:['recordings'],originUrl:'https://acme.zoom.us/recording/meeting/transcript',settings:{},guidedWorkspace:true};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:"https://acme.zoom.us/recording/meeting/transcript"}},()=>{})');
 assert.equal(f.created.length,0,'guided workspace reuses an eligible loaded recordings origin');
 assert.equal(f.sent.find(m=>m.type.endsWith('workerStartRecordings'))?.id,1);
}
{
 const f=fixture();await f.run('recoveryReady');
 const origin={id:1,status:'complete',url:'https://acme.zoom.us/recording/meeting/transcript'};
 f.chrome.tabs.get=async id=>id===1?origin:f.created.find(tab=>tab.id===id)||null;
 f.ctx.payload={selected:['recordings'],originUrl:'https://acme.zoom.us/recording/meeting/transcript',settings:{}};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:"https://acme.zoom.us/recording/meeting/transcript"}},()=>{})');
 assert.equal(f.created.length,0,'legacy Save selected reuses an eligible loaded recordings origin');
 assert.equal(f.sent.find(m=>m.type.endsWith('workerStartRecordings'))?.id,1);
 assert.equal(f.sent.filter(m=>m.type.endsWith('setGuidedWorkspace')).every(m=>m.payload.active===false),true,'legacy reuse leaves the manual page panel visible');
 assert.equal(f.session['ztd:source-runs'][0].workerTabOwned,false,'reused user tab is never treated as extension-owned');
}
{
 const f=fixture();await f.run('recoveryReady');
 const origin={id:1,status:'complete',url:'https://acme.zoom.us/recording/meeting/transcript'};
 f.chrome.tabs.get=async id=>id===1?origin:f.created.find(tab=>tab.id===id)||null;
 f.ctx.payload={selected:['recordings'],originUrl:'https://acme.zoom.us/recording/meeting/transcript',settings:{},mode:'page',scope:{page:4,rowKeys:['visible-row']}};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:"https://acme.zoom.us/recording/meeting/transcript"}},()=>{})');
 assert.equal(f.created.length,1,'legacy current-page/manual action preserves its isolated worker tab');
 assert.equal(f.created[0].url,origin.url);
 assert.equal(f.sent.find(m=>m.type.endsWith('workerStartRecordings'))?.payload.scope.page,4);
}
{
 const f=fixture();await f.run('recoveryReady');
 f.ctx.payload={selected:['recordings'],originUrl:'https://zoom.us/recording/meeting/transcript',settings:{}};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 f.created[0].url='https://example.com/repurposed';
 f.ctx.rid=f.session['ztd:source-runs'][0].runId;
 await f.run('handleSourceWorkerResult(10,{runId:rid,source:"recordings",saved:1,failed:0})');
 assert.deepEqual(f.removed,[],'cleanup must not close an extension-created worker tab after user navigation');
 assert.equal(f.session['ztd:source-runs'].length,0,'a terminal result still completes coordinator state');
}
{
 const f=fixture();await f.run('recoveryReady');
 f.ctx.payload={selected:['recordings'],originUrl:'https://zoom.us/recording/meeting/transcript',settings:{},guidedWorkspace:true};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 const runId=f.session['ztd:source-runs'][0].runId;
 f.chrome.tabs.sendMessage=async(_id,message)=>message.type.endsWith('getSourceWorkerState')?{runId,active:true}:{ok:true};
 const stateHandler=f.chrome.runtime.onMessage.listeners[0];let response;
 await new Promise(resolve=>stateHandler({type:'zoomTranscriptExtension:getGuidedRunState'},{tab:{id:900}},value=>{response=value;resolve()}));
 assert.equal(response.active.active,true,'a live worker is preserved through workspace hydration');
 assert.equal(response.active.runId,runId);
 assert.equal(f.session['ztd:source-runs'].length,1,'active work is not cleared or restarted');
}
{
 const f=fixture();await f.run('recoveryReady');
 f.ctx.payload={selected:['recordings'],originUrl:'https://zoom.us/recording/meeting/transcript',settings:{},guidedWorkspace:true};
 await f.run('beginSourceRun(payload,{tab:{id:1,url:payload.originUrl}},()=>{})');
 const runId=f.session['ztd:source-runs'][0].runId;
 f.chrome.tabs.get=async()=>null;
 let response;const handler=f.chrome.runtime.onMessage.listeners[0];
 await new Promise(resolve=>handler({type:'zoomTranscriptExtension:getGuidedRunState'},{tab:{id:900}},value=>{response=value;resolve()}));
 assert.equal(response.active,null);assert.equal(response.terminal.interrupted,true,'a proven missing worker becomes an interrupted terminal result');
 assert.equal(response.terminal.results.recordings,undefined,'no unobserved asset counts are invented');
 assert.equal(f.session['ztd:source-runs'].length,0);assert.equal(f.created.length,1,'interrupted jobs are not resumed');
}
{
 const f=fixture();await f.run('recoveryReady');
 const run={runId:'safe-terminal',originTabId:1,originUrl:'https://zoom.us/recording/meeting/transcript',rootFolder:'safe',settings:{},totals:{},mode:'all',plan:createSourcePlan(['myNotes']),results:{myNotes:{saved:2,skipped:1,failed:0,pending:3,error:'private url must not persist'}},currentSource:'myNotes',guided:true,finished:false,workerTabId:null};
 f.ctx.terminalRun=run;await f.run('finishSourceRun(terminalRun)');
 assert.deepEqual(JSON.parse(JSON.stringify(f.session['ztd:last-guided-terminal'].results.myNotes)),{saved:2,skipped:1,failed:0,pending:3,error:true});
 assert.equal(JSON.stringify(f.session['ztd:last-guided-terminal']).includes('private url'),false,'terminal journal contains counts and error flags only');
 let response;const handler=f.chrome.runtime.onMessage.listeners[0];
 await new Promise(resolve=>handler({type:'zoomTranscriptExtension:getGuidedRunState'},{tab:{id:900}},value=>{response=value;resolve()}));
 assert.equal(response.terminal.runId,'safe-terminal','missed terminal outcomes replay on workspace hydration');
 await new Promise(resolve=>handler({type:'zoomTranscriptExtension:ackGuidedTerminal',payload:{runId:'safe-terminal'}},{tab:{id:900}},resolve));
 assert.equal(f.session['ztd:last-guided-terminal'],undefined,'replayed terminal is acknowledged once');
}
console.log('coordinator.test.mjs: all tests passed');
