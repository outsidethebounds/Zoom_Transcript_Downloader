import assert from 'node:assert/strict';
import {buildInventory,selectedAssets,canSaveReviewed,reviewedTargetsMatch} from '../lib/guided-inventory.mjs';
const inventory=buildInventory({recordings:{selected:true,ok:true,assets:[{id:'r1',occurrenceId:'occ-a',title:'Weekly sync'},{id:'r2',occurrenceId:'occ-b',title:'Recurring'}]},myNotes:{selected:true,ok:true,assets:[{id:'n1',occurrenceId:'occ-a',title:'Different title'},{id:'n2',title:'No association'},{id:'n2',title:'No association duplicate'}]}});
assert.equal(inventory.complete,true);assert.equal(inventory.assets.length,4);assert.deepEqual(inventory.groups.recordings,{both:1,only:0,unknown:1});assert.deepEqual(inventory.groups.myNotes,{both:1,only:0,unknown:1});assert.equal(inventory.assets.find(x=>x.sourceId==='n1').group,'Both');assert.equal(inventory.assets.find(x=>x.sourceId==='n2').group,'Unknown');assert.equal(inventory.exactUniqueMeetingCount,null);assert.equal(canSaveReviewed(inventory,['recordings']),true);assert.equal(canSaveReviewed(inventory,[]),false);assert.equal(selectedAssets(inventory,['myNotes']).length,2);
const namesOnly=buildInventory({recordings:{selected:true,ok:true,assets:[{id:'r',meetingId:'occ-a',title:'Recurring Sync'}]},myNotes:{selected:true,ok:true,assets:[{id:'n',title:'Recurring Sync'}]}});assert.equal(namesOnly.assets.find(a=>a.source==='myNotes').group,'Unknown');
// Regression fixture mirrors the authenticated list models: recording data.meetingId
// and Notes item.meeting.meetingId carry the shared occurrence key. A visible
// recurring meeting number/title match is deliberately not an association.
const occurrenceFixture=buildInventory({recordings:{selected:true,ok:true,assets:[{id:'recording-row',occurrenceId:'occurrence:opaque-A7f2',meetingId:'00000000000',title:'Recurring Sync'}]},myNotes:{selected:true,ok:true,assets:[{id:'note-row',occurrenceId:'occurrence:opaque-A7f2',title:'A different note title'}]}});assert.equal(occurrenceFixture.assets.every(a=>a.group==='Both'),true);
const repeatedNumber=buildInventory({recordings:{selected:true,ok:true,assets:[{id:'rnum',meetingId:'00000000000',title:'Recurring Sync'}]},myNotes:{selected:true,ok:true,assets:[{id:'nnum',meetingId:'00000000000',title:'Recurring Sync'}]}});assert.equal(repeatedNumber.assets.every(a=>a.group==='Unknown'),true);
// Small synthetic inventory checks availability and exact-occurrence grouping
// without storing account-specific row totals or live meeting identifiers.
const fixtureRecordings=[
 {sourceId:'sort-a',occurrenceId:'opaque-a',title:'Fixture A',available:true},
 {sourceId:'sort-b',occurrenceId:'opaque-b',title:'Fixture B',available:true},
 {sourceId:'sort-c',occurrenceId:'opaque-c',title:'Fixture C',available:true},
 {sourceId:'sort-d',occurrenceId:'opaque-d',title:'Fixture D',available:false},
];
const fixtureNotes=[
 {sourceId:'note-a',occurrenceId:'opaque-a',title:'Note A',available:null},
 {sourceId:'note-b',title:'Note B',available:null},
 {sourceId:'note-c',occurrenceId:'opaque-c',title:'Note C',available:null},
];
const fixture=buildInventory({recordings:{selected:true,ok:true,assets:fixtureRecordings},myNotes:{selected:true,ok:true,assets:fixtureNotes}});
assert.equal(fixture.assets.length,7);assert.equal(fixture.scans.recordings.count,4);
assert.equal(fixture.assets.filter(a=>a.source==='recordings'&&a.available===true).length,3);
assert.equal(fixture.assets.filter(a=>a.source==='recordings'&&a.available===false).length,1);
assert.equal(fixture.assets.filter(a=>a.group==='Both').length,4);
assert.equal(fixture.assets.filter(a=>a.source==='recordings'&&a.group==='Unknown').length,2);
assert.equal(fixture.assets.filter(a=>a.source==='myNotes'&&a.group==='Unknown').length,1);
assert.equal(fixture.assets.filter(a=>a.source==='myNotes'&&a.group==='Both').length,2);
const incomplete=buildInventory({recordings:{selected:true,ok:true,assets:[]},myNotes:{selected:true,ok:false,error:'login'}});assert.equal(incomplete.complete,false);assert.equal(selectedAssets(incomplete,['recordings']).length,0);assert.equal(canSaveReviewed(incomplete,['recordings']),false);
const reviewedTargets={company:'acme',recordingTabUrl:'https://acme.zoom.us/recording/meeting/transcript',recordingListUrl:'https://acme.zoom.us/recording/meeting/transcript',notesTabUrl:'https://us01mynotes.zoom.us/allNotes',notesListUrl:'https://us01mynotes.zoom.us/allNotes'};
assert.equal(reviewedTargetsMatch(reviewedTargets,{...reviewedTargets,company:'acme'},['recordings','myNotes']),true,'unchanged reviewed targets remain downloadable');
assert.equal(reviewedTargetsMatch(reviewedTargets,{...reviewedTargets,company:'other',recordingTabUrl:'https://other.zoom.us/recording/meeting/transcript',recordingListUrl:'https://other.zoom.us/recording/meeting/transcript'},['recordings']),false,'company change during scanning/review invalidates inventory');
assert.equal(reviewedTargetsMatch(reviewedTargets,{...reviewedTargets,recordingListUrl:'https://other.zoom.us/recording/meeting/transcript'},['recordings']),false,'stored recordings worker target must match the reviewed company');
assert.equal(reviewedTargetsMatch(reviewedTargets,{...reviewedTargets,notesListUrl:'https://other.zoom.us/allNotes'},['myNotes']),false,'stored My Notes target must match the list that was scanned');
assert.equal(reviewedTargetsMatch(reviewedTargets,{...reviewedTargets,recordingTabUrl:'https://attacker.example/recording/meeting/transcript'},['recordings']),false,'recording tab must remain on the verified company host');
console.log('guided-inventory.test.mjs: all tests passed');
