(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.ZTDCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function decodeHtmlEntities(text) {
    if (typeof document === 'undefined') return String(text || '');
    const el = document.createElement('textarea');
    el.innerHTML = text || '';
    return el.value;
  }

  function sanitizeTitle(title) {
    return decodeHtmlEntities(title || '')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[ .]+$/g, '') || 'Untitled Meeting';
  }

  function sanitizeFilenameBase(value) {
    return String(value || '')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+-\s+/g, ' - ')
      .trim()
      .replace(/[ .]+$/g, '')
      .replace(/^[- ]+|[- ]+$/g, '') || 'Untitled Meeting';
  }

  function parseRowText(text) {
    const compact = (text || '').replace(/\s+/g, ' ').trim();
    const match = compact.match(/^(.*?)\s+(\d{3}\s\d{4}\s\d{4})\s+\S+@\S+\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)\s+\d+\s+day(?:s)?\s+Download\s+Delete$/);
    if (!match) return null;
    return {
      title: match[1].trim(),
      meetingId: match[2].replace(/\s+/g, ''),
      dateText: match[3].trim(),
    };
  }

  function dateParts(dateText) {
    const d = new Date(dateText);
    if (Number.isNaN(d.getTime())) return { date: 'unknown-date', time: 'unknown-time' };
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      time: `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`,
    };
  }

  function normalizeMeta(meta) {
    const { date, time } = dateParts(meta.dateText || '');
    return {
      normalizedTitle: sanitizeTitle(meta.title || '').toLowerCase(),
      dateISO: date,
      timeHHMM: time,
    };
  }

  function buildTargetBase(meta, settings) {
    const { date, time } = dateParts(meta.dateText);
    let base = (settings.filenamePattern || '{date} - {time} - {title}')
      .replaceAll('{date}', date)
      .replaceAll('{time}', time)
      .replaceAll('{title}', sanitizeTitle(meta.title))
      .replaceAll('{meetingId}', meta.meetingId || '');
    base = sanitizeFilenameBase(base);
    if (settings.includeMeetingId && meta.meetingId && !base.includes(meta.meetingId)) {
      base = sanitizeFilenameBase(`${base} - ${meta.meetingId}`);
    }
    return base;
  }

  function applyCollisionSafeFilenames(entries) {
    const counts = new Map();
    entries.forEach(entry => {
      const key = entry.targetBase.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const seen = new Map();
    return entries.map(entry => {
      const key = entry.targetBase.toLowerCase();
      const count = seen.get(key) || 0;
      seen.set(key, count + 1);
      let finalBase = entry.targetBase;
      if ((counts.get(key) || 0) > 1 && entry.meetingId && !finalBase.includes(entry.meetingId)) {
        finalBase = `${entry.targetBase} - ${entry.meetingId}`;
      }
      return { ...entry, targetFilename: `${finalBase}.txt` };
    });
  }

  return {
    sanitizeTitle,
    sanitizeFilenameBase,
    parseRowText,
    dateParts,
    normalizeMeta,
    buildTargetBase,
    applyCollisionSafeFilenames,
  };
});
