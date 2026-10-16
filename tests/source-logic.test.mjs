import assert from 'node:assert/strict';
import sources from '../lib/sources.js';

assert.deepEqual(sources.normalizeSources(undefined), { recordings: true, myNotes: false });
assert.deepEqual(sources.normalizeSources({ recordings: false, myNotes: true }), { recordings: false, myNotes: true });
assert.deepEqual(sources.orderedSources({ recordings: true, myNotes: true }), ['recordings', 'myNotes']);
assert.deepEqual(sources.orderedSources({ recordings: false, myNotes: true }), ['myNotes']);
assert.deepEqual(sources.parseNoteListLabel('IGEL & Imprivata - CX alignment 2026-10-09 14:03(GMT-4:00)'), { title: 'IGEL & Imprivata - CX alignment', dateISO: '2026-10-09', timeHHMM: '1403' });
assert.deepEqual(sources.parseNoteListLabel('Citrix call w Henry'), null);
assert.deepEqual(sources.dedupeNotes([{ id: 'a' }, { id: 'a' }, { id: 'b' }, { title: 'no stable ID' }]), [{ id: 'a' }, { id: 'b' }]);
assert.equal(sources.buildSourceFolderPath('ZoomTranscripts-10112026', 'recordings'), 'ZoomTranscripts-10112026/Recordings');
assert.equal(sources.buildSourceFolderPath('ZoomTranscripts-10112026', 'myNotes'), 'ZoomTranscripts-10112026/My Notes');
const note = { id: 'opaque-1', title: 'Planning/Sync', dateISO: '2026-10-11', timeHHMM: '1044' };
assert.equal(sources.buildMyNotesFilename(note), '2026-10-11 - 1044 - Planning Sync.txt');
assert.equal(sources.buildMyNotesFilename(note, { includeNoteId: true }), '2026-10-11 - 1044 - Planning Sync - opaque-1.txt');
assert.equal(sources.buildMyNotesFilename({...note,title:'Quarterly - Review'}, {filenamePattern:'{date} - {meetingId} - {title}'}), '2026-10-11 - Quarterly - Review.txt');
assert.equal(sources.buildMyNotesFilename({...note,title:'Quarterly - Review'}, {filenamePattern:'{date} - {title} - {meetingId}'}), '2026-10-11 - Quarterly - Review.txt');
assert.equal(sources.buildMyNotesFilename(note, {filenamePattern:'{meetingId}'}), 'Untitled Note.txt', 'token-only Notes patterns fall back to a usable filename');

const collisions = sources.collisionSafeNoteFilenames([
  { id: 'n1', title: 'Same', dateISO: '2026-10-11', timeHHMM: '1044' },
  { id: 'n2', title: 'Same', dateISO: '2026-10-11', timeHHMM: '1044' },
]);
assert.deepEqual(collisions.map(n => n.targetFilename), ['2026-10-11 - 1044 - Same - n1.txt', '2026-10-11 - 1044 - Same - n2.txt']);
assert.deepEqual(sources.summarizeSourceResults({ recordings: { saved: 2, skipped: 1, failed: 0 }, myNotes: { saved: 1, stopped: true } }), {
  recordings: { saved: 2, skipped: 1, failed: 0, stopped: false, needsUserAction: null },
  myNotes: { saved: 1, skipped: 0, failed: 0, stopped: true, needsUserAction: null },
});
console.log('source-logic.test.mjs: all tests passed');
// Cross-source overlap is never globally deduplicated.
assert.notEqual(sources.buildSourceFolderPath('root','recordings'),sources.buildSourceFolderPath('root','myNotes'));
assert.equal(sources.buildMyNotesFilename({id:'x',title:'Back\\slash',dateISO:'2026-10-11',timeHHMM:'1000'}),'2026-10-11 - 1000 - Back slash.txt');
