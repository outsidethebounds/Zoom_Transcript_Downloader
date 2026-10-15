export function sanitizeDownloadSubfolder(path = '') {
  return String(path).split(/[\\/]+/).map(part => part.trim()).filter(part => part && part !== '.' && part !== '..').map(part => part.replace(/[<>:"\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[ .]+$/g, '')).filter(Boolean).join('/');
}

export function datedBatchFolder(subfolder = '', date = new Date()) {
  const name = 'ZoomTranscripts-' + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0') + date.getFullYear();
  const prefix = sanitizeDownloadSubfolder(subfolder);
  return prefix ? prefix + '/' + name : name;
}

export function sourceFolderPath(root, source) {
  if (!['recordings', 'myNotes'].includes(source)) throw new Error('Unknown transcript source: ' + source);
  return root + '/' + (source === 'recordings' ? 'Recordings' : 'My Notes');
}
