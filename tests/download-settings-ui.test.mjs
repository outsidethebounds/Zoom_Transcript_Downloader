import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { datedBatchFolder, sanitizeDownloadSubfolder, sourceFolderPath } from '../lib/download-settings.mjs';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const workspace = read('workspace.js');

function makePreviewHarness(pattern, folder, includeMeetingId) {
  const elements = Object.fromEntries(['settings-pattern','settings-folder','settings-meeting-id','recording-preview','notes-preview','recording-destination','notes-destination'].map(id => [id, {value:'',checked:false,textContent:''}]));
  elements['settings-pattern'].value=pattern; elements['settings-folder'].value=folder; elements['settings-meeting-id'].checked=includeMeetingId;
  const coreContext={}; vm.runInNewContext(read('lib/core.js'),coreContext);
  const sourcesContext={}; vm.runInNewContext(read('lib/sources.js'),sourcesContext);
  const start=workspace.indexOf('function renderDownloadSettings()'); const end=workspace.indexOf('async function saveDownloadSettings()',start);
  const context={$:id=>elements[id],globalThis:{ZTDCore:coreContext.ZTDCore,ZTDSources:sourcesContext.ZTDSources},datedBatchFolder,sourceFolderPath};
  return {elements,render:vm.runInNewContext(workspace.slice(start,end)+'\nrenderDownloadSettings',context)};
}

test('Connect previews use production filename rules for both sources and real Downloads folders',()=>{
 const {elements,render}=makePreviewHarness('{date} - {time} - {title} - {meetingId}','Work/Zoom',true); render();
 assert.equal(elements['recording-preview'].textContent,'2026-04-04 - 0930 - Weekly Sync - 12345678901.txt');
 assert.equal(elements['notes-preview'].textContent,'2026-04-04 - 0930 - Weekly Sync -.txt','My Notes meetingId stays empty under the existing filename rule');
 assert.match(elements['recording-destination'].textContent,/^Downloads\/Work\/Zoom\/ZoomTranscripts-\d{8}\/Recordings$/);
 assert.match(elements['notes-destination'].textContent,/^Downloads\/Work\/Zoom\/ZoomTranscripts-\d{8}\/My Notes$/);
});

test('settings persistence is explicit, survives re-open, and never starts a scan/export',async()=>{
 const persisted={}; const controls={'settings-pattern':{value:'{date} - {title}'},'settings-folder':{value:'Team/Zoom'},'settings-meeting-id':{checked:true},'settings-status':{textContent:''}};let calls=0;
 const start=workspace.indexOf('async function saveDownloadSettings()');const end=workspace.indexOf('function status(',start);
 const context={$:id=>controls[id],scanBusy:false,activeRun:false,NS:'zoomTranscriptExtension',sanitizeDownloadSubfolder,chrome:{runtime:{sendMessage:async msg=>{calls++;assert.equal(msg.type,'zoomTranscriptExtension:setSettings');Object.assign(persisted,msg.settings);return {ok:true}}}},settings:{},renderDownloadSettings(){}};
 const save=vm.runInNewContext(workspace.slice(start,end)+'\nsaveDownloadSettings',context);await save();
 assert.deepEqual(JSON.parse(JSON.stringify(persisted)),{filenamePattern:'{date} - {title}',downloadSubfolder:'Team/Zoom',includeMeetingId:true});assert.match(controls['settings-status'].textContent,/future runs only/);assert.equal(calls,1);
 // Re-open hydration reads precisely these persisted keys/defaults and repopulates controls.
 assert.match(workspace,/async function hydrate\(\)\{settings=await chrome\.storage\.local\.get\(\{companySubdomain:/,'workspace hydrates saved preference keys');
 assert.match(workspace,/settings-pattern'\)\.value=settings\.filenamePattern/);assert.match(workspace,/settings-folder'\)\.value=settings\.downloadSubfolder/);assert.match(workspace,/settings-meeting-id'\)\.checked=settings\.includeMeetingId===true/);
 assert.doesNotMatch(workspace.slice(start,end),/startGuidedDownload|runScans|downloads\.download/);
});

test('Connect-only visibility and idle lock cover scans and exports',()=>{
 assert.ok(workspace.includes("$('download-settings').hidden=s!=='connect'"));
 assert.ok(workspace.includes('fields.disabled=scanBusy||activeRun'));
 assert.match(workspace,/finally\{stopPending=false;scanBusy=false;[^}]*updateDownloadSettingsLock()/);
 assert.ok(workspace.includes("setStage(hasError?'review':'save')"));
 const start=workspace.indexOf('function updateDownloadSettingsLock()');const end=workspace.indexOf('function renderDownloadSettings()',start);const disabled={};const fn=vm.runInNewContext(workspace.slice(start,end)+'\nupdateDownloadSettingsLock',{$:id=>disabled[id]|| (disabled[id]={}) ,scanBusy:true,activeRun:false});fn();assert.equal(disabled['download-settings-fields'].disabled,true);
});

test('shared path rules preserve sanitized relative folders and source-specific directories',()=>{
 const date=new Date(2026,9,15);assert.equal(sanitizeDownloadSubfolder('../Team\\Zoom//'), 'Team/Zoom');assert.equal(datedBatchFolder('',date),'ZoomTranscripts-10152026');assert.equal(datedBatchFolder('/Team/Zoom',date),'Team/Zoom/ZoomTranscripts-10152026');assert.equal(sourceFolderPath('ZoomTranscripts-10152026','recordings'),'ZoomTranscripts-10152026/Recordings');assert.equal(sourceFolderPath('ZoomTranscripts-10152026','myNotes'),'ZoomTranscripts-10152026/My Notes');
});
