import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import sources from '../lib/sources.js';
let source=fs.readFileSync(new URL('../my-notes.js',import.meta.url),'utf8');
source=source.replace("  const initialGuidedWorkspaceStateVersion = guidedWorkspaceStateVersion;\n  chrome.runtime.sendMessage({ type: NS + ':getGuidedTabState' }).then(state => { if (shouldApplyInitialGuidedTabState(initialGuidedWorkspaceStateVersion)) guidedWorkspace = state?.guided === true; if (!guidedWorkspace) addPanel(); }).catch(() => { if (!guidedWorkspace) addPanel(); });\n})();",'  globalThis.testAdapter = { collectNotes, clickTranscriptDownload, processNotes, currentNoteId, scanGuidedNotes };\n})();');
let rows=[],buttons=[],top=0,phase=0,delayDomCommit=false;const mutationObservers=new Set();let pageState={valid:true,method:'GET',path:'/api/file/meeting_notes/my_notes',status:200,mime:'application/json',requestKeys:['meetingInfoRequired','pageSize'],notesCount:1,nextPageTokenPresent:true,sequence:1,pages:1,totalRows:1};const windowListeners=new Set();
const root={clientHeight:500,scrollHeight:1200,get scrollTop(){return top},set scrollTop(v){top=Math.min(700,v)},dispatchEvent(){if(top>0){phase++;if(!delayDomCommit)updateRows();}},parentElement:null};
function row(id,label){return {getAttribute:k=>k==='aria-label'?label:k==='data-ztd-note-id'?id:null,parentElement:root};}
function updateRows(){rows=[row('one','Note one 2026-10-11 10:00'),row('two','Note two 2026-10-11 11:00')];for(const observer of [...mutationObservers])observer.callback();}
const listeners=[];
const chrome={runtime:{sendMessage:async()=>({ok:true}),onMessage:{addListener:f=>listeners.push(f),removeListener:()=>{}}}};
const search={value:''},dateFilter={innerText:'Date',getAttribute:()=> 'Date'};
const doc={body:{},documentElement:root,scrollingElement:root,querySelector:s=>s.includes('data-row')?rows[0]||null:s.includes('Search keywords')?search:null,querySelectorAll:s=>s.includes('data-row')?rows:s.includes('combobox')?[dateFilter]:s.includes('button')?buttons:s.includes('tooltip')?[{textContent:'Download transcript'}]:[],getElementById:id=>id==='export-help'?{textContent:'Download transcript'}:null};
let clock=0;const ctx=vm.createContext({globalThis:null,chrome,document:doc,location:{pathname:'/allNotes',origin:'https://us01mynotes.zoom.us'},window:{addEventListener(type,fn){if(type==='message')windowListeners.add(fn)},removeEventListener(type,fn){windowListeners.delete(fn)},postMessage(data){if(data.source==='ztd-notes-pagination-probe')queueMicrotask(()=>{for(const fn of windowListeners)fn({source:this,origin:'https://us01mynotes.zoom.us',data:{source:'ztd-notes-pagination-state',requestId:data.requestId,payload:pageState}})});if(data.source==='ztd-notes-load-more'){pageState={...pageState,requestKeys:['meetingInfoRequired','pageSize','pageToken'],notesCount:1,nextPageTokenPresent:false,sequence:pageState.sequence+1,pages:2,totalRows:2};queueMicrotask(()=>{for(const fn of windowListeners)fn({source:this,origin:'https://us01mynotes.zoom.us',data:{source:'ztd-notes-pagination-result',payload:pageState}})});if(delayDomCommit)setImmediate(updateRows)}}},getComputedStyle:()=>({overflowY:'auto'}),Date:{now:()=>clock},setTimeout:(f,ms)=>{if(ms<35000)setImmediate(()=>{clock+=ms;f()});return 1},clearTimeout(){},MutationObserver:class{constructor(callback){this.callback=callback}observe(){mutationObservers.add(this)}disconnect(){mutationObservers.delete(this)}},PointerEvent:class{},MouseEvent:class{},Event:class{},history:{back(){}},ZTDSources:sources,console});ctx.globalThis=ctx;vm.runInContext(source,ctx);
rows=[row('one','Note one 2026-10-11 10:00')];
assert.equal((await ctx.testAdapter.collectNotes(false)).length,1,'page scope only current list');
assert.equal((await ctx.testAdapter.collectNotes(true)).length,2,'incremental pagination merges stable IDs');
const exportButton={disabled:false,getBoundingClientRect:()=>({left:0,top:0,width:20,height:20}),getAttribute:k=>k==='aria-describedby'?'export-help':null,dispatchEvent(){},textContent:'',title:''};
buttons=[{...exportButton,disabled:true},exportButton];assert.equal(await ctx.testAdapter.clickTranscriptDownload(),exportButton,'disabled permission control skipped');
buttons=[{...exportButton,disabled:true}];assert.equal(await ctx.testAdapter.clickTranscriptDownload(),null);
buttons=[{...exportButton,getAttribute:k=>k==='aria-describedby'?'unrelated-help':null}];
assert.equal(await ctx.testAdapter.clickTranscriptDownload(),null,'another control’s tooltip must never identify this button as an export');
ctx.location.pathname='/opaque-stable-ID';assert.equal(ctx.testAdapter.currentNoteId(),'opaque-stable-ID');
ctx.location.pathname='/allNotes';assert.equal(ctx.testAdapter.currentNoteId(),'');
rows=[row('one','Note one 2026-10-11 10:00')];
const complete=await ctx.testAdapter.scanGuidedNotes();
assert.equal(complete.ok,true,'authoritative empty nextPageToken and matching metadata count certify completion');assert.equal(complete.incomplete,undefined);assert.equal(complete.exhausted,true);assert.equal(complete.count,2);
pageState={valid:true,method:'GET',path:'/api/file/meeting_notes/my_notes',status:200,mime:'application/json',requestKeys:['meetingInfoRequired','pageSize'],notesCount:1,nextPageTokenPresent:true,sequence:1,pages:1,totalRows:1};rows=[row('one','Note one 2026-10-11 10:00')];top=0;delayDomCommit=true;
const delayedCommit=await ctx.testAdapter.scanGuidedNotes();delayDomCommit=false;
assert.equal(delayedCommit.ok,true,'terminal API response may arrive before React commits the final metadata rows');assert.equal(delayedCommit.count,2);
pageState={...pageState,valid:false};
const incomplete=await ctx.testAdapter.scanGuidedNotes();
assert.equal(incomplete.ok,false,'invalid API response cannot certify exhaustion');assert.equal(incomplete.incomplete,true);assert.equal(incomplete.exhausted,false);

console.log('notes-worker.test.mjs: all tests passed');
