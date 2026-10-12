import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {buildInventory,selectedAssets} from '../lib/guided-inventory.mjs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const workspace = read('workspace.js');
const html = read('workspace.html');

test('guided review uses two source lists and verified cross-source badges', () => {
  assert.ok(workspace.includes("addSourceList($('inventory'),'recordings','Recordings'"));
  assert.ok(workspace.includes("addSourceList($('inventory'),'myNotes','My Notes'"));
  assert.ok(workspace.includes('Also in My Notes'));
  assert.ok(workspace.includes('Also in Recordings'));
  assert.equal(workspace.includes("'Unknown'"), false);
  assert.equal(html.includes('Unknown is an exact group label'), false);
  assert.ok(workspace.includes('Exact unique-meeting total cannot be confirmed because some associations are missing'));
});

test('guided workspace has accurate sign-in, inventory, and access copy', () => {
  assert.match(html,/Sign in directly on Zoom or your organization’s SSO/);
  assert.match(html,/never asks for or stores your password/);
  assert.match(html,/reads transcript metadata for your inventory/);
  assert.match(html,/accesses transcript files only when you choose Download/);
  assert.match(workspace,/Scan complete. Review your transcripts below. Nothing has been downloaded yet./);
  assert.match(workspace,/company-controls/);
  assert.match(workspace,/scroll to view all/);
  assert.match(html,/Open Zoom to sign in/);
  assert.ok(workspace.includes("retrySend(tabId,'setGuidedWorkspace'"));
  assert.match(read('content.js'),/setGuidedWorkspace/);
  assert.match(read('my-notes.js'),/setGuidedWorkspace/);
  assert.match(read('background.js'),/guidedWorkspaceTabId/);
});

test('company identity is locked during scan and rechecked before source export', () => {
  const scan=workspace.slice(workspace.indexOf('async function runScans'),workspace.indexOf('async function saveReviewed'));
  const save=workspace.slice(workspace.indexOf('async function saveReviewed'),workspace.indexOf('async function primary'));
  assert.match(scan,/\$\('company'\)\.disabled=true/);
  assert.match(scan,/finally\{scanBusy=false;\$\('company'\)\.disabled=false/);
  assert.match(scan,/if\(company\(\)!==scanCompany\)throw/);
  assert.match(save,/reviewedTargetsMatch\(reviewedTargets,currentTargets,sources\)/);
  assert.match(save,/Inventory discarded; scan again before downloading/);
});

test('matched assets remain listed and selectable in their own source', () => {
  const inventory=buildInventory({recordings:{selected:true,ok:true,assets:[{id:'r-opaque',occurrenceId:'occ-a',title:'Recording'}]},myNotes:{selected:true,ok:true,assets:[{id:'n-opaque',occurrenceId:'occ-a',title:'Note copy'}]}});
  assert.equal(inventory.assets.length,2);
  assert.deepEqual(inventory.assets.map(a=>a.sourceId),['r-opaque','n-opaque']);
  assert.equal(inventory.assets.every(a=>a.group==='Both'),true);
  assert.equal(selectedAssets(inventory,['recordings']).length,1);
  assert.equal(selectedAssets(inventory,['myNotes']).length,1);
  assert.equal(selectedAssets(inventory,['recordings','myNotes']).length,2);
});
console.log('guided-presentation.test.mjs: all tests passed');
