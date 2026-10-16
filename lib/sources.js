(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ZTDSources = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_SOURCES = Object.freeze({ recordings: true, myNotes: false });
  const SOURCE_ORDER = Object.freeze(['recordings', 'myNotes']);
  const SOURCE_FOLDERS = Object.freeze({ recordings: 'Recordings', myNotes: 'My Notes' });

  function normalizeSources(value) {
    return { recordings: value?.recordings === undefined ? true : value.recordings === true, myNotes: value?.myNotes === true };
  }
  function orderedSources(value) {
    const selected = normalizeSources(value);
    return SOURCE_ORDER.filter(source => selected[source]);
  }
  function stableNoteId(note) {
    const id = note?.noteId ?? note?.id ?? note?.recordId;
    return typeof id === 'string' || typeof id === 'number' ? String(id).trim() : '';
  }
  function parseNoteListLabel(label) {
    const value = String(label || '').replace(/\s+/g, ' ').trim();
    const match = value.match(/^(.*?)\s+(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?(?:\s*\(GMT[+-]\d{1,2}:?\d{0,2}\))?$/i);
    if (!match) return null;
    return { title: match[1].trim() || 'Untitled Note', dateISO: match[2] + '-' + match[3] + '-' + match[4], timeHHMM: match[5] && match[6] ? match[5] + match[6] : 'unknown-time' };
  }
  function dedupeNotes(notes = []) {
    const seen = new Set();
    return notes.filter(note => { const id = stableNoteId(note); if (!id || seen.has(id)) return false; seen.add(id); return true; });
  }
  function buildSourceFolderPath(batchFolder, source) {
    const folder = SOURCE_FOLDERS[source];
    if (!folder) throw new Error('Unknown transcript source: ' + source);
    return String(batchFolder || '') + '/' + folder;
  }
  function safeText(value, fallback) {
    return String(value || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[ .]+$/g, '') || fallback;
  }
  function withoutMeetingIdToken(pattern) {
    return String(pattern || '')
      .replace(/\s*[-–—]\s*\{meetingId\}/g, '')
      .replace(/\{meetingId\}\s*[-–—]\s*/g, '')
      .replaceAll('{meetingId}', '');
  }
  function buildMyNotesFilename(note, options = {}) {
    const title = safeText(note?.title, 'Untitled Note');
    const date = safeText(note?.dateISO, 'unknown-date');
    const id = stableNoteId(note);
    const pattern = options.filenamePattern || '{date} - {time} - {title}';
    const time = safeText(note?.timeHHMM, 'unknown-time');
    let base = withoutMeetingIdToken(pattern).replaceAll('{date}', date).replaceAll('{time}', time).replaceAll('{title}', title);
    base = safeText(base, 'Untitled Note');
    if (options.includeNoteId && id && !base.includes(id)) base = base + ' - ' + safeText(id, 'note');
    return base + '.txt';
  }
  function collisionSafeNoteFilenames(notes, options = {}) {
    const names = notes.map(note => buildMyNotesFilename(note, options));
    const counts = new Map();
    names.forEach(name => counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) || 0) + 1));
    return notes.map((note, index) => {
      const name = names[index];
      if (counts.get(name.toLowerCase()) < 2) return { ...note, targetFilename: name };
      const id = stableNoteId(note);
      const suffix = id ? ' - ' + safeText(id, 'note') : ' - ' + (index + 1);
      return { ...note, targetFilename: name.slice(0, -4) + suffix + '.txt' };
    });
  }
  function summarizeSourceResults(sourceResults = {}) {
    const summary = {};
    for (const source of SOURCE_ORDER) {
      const r = sourceResults[source];
      if (!r) continue;
      summary[source] = { saved: Number(r.saved || 0), skipped: Number(r.skipped || 0), failed: Number(r.failed || 0), stopped: r.stopped === true, needsUserAction: r.needsUserAction || null };
    }
    return summary;
  }
  return { DEFAULT_SOURCES, SOURCE_ORDER, SOURCE_FOLDERS, normalizeSources, orderedSources, stableNoteId, parseNoteListLabel, dedupeNotes, buildSourceFolderPath, buildMyNotesFilename, collisionSafeNoteFilenames, summarizeSourceResults };
});
