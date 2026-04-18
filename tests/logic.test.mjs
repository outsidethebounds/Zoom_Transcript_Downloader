import assert from 'node:assert/strict';

function sanitizeTitle(title) {
  return (title || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '') || 'Untitled Meeting';
}

function dateParts(dateText) {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return { date: 'unknown-date', time: 'unknown-time' };
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

function buildTargetBase(meta, settings) {
  const { date, time } = dateParts(meta.dateText);
  let base = (settings.filenamePattern || '{date} - {time} - {title}')
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
    .replaceAll('{title}', sanitizeTitle(meta.title))
    .replaceAll('{meetingId}', meta.meetingId || '');
  base = base.replace(/\s+/g, ' ').trim();
  if (settings.includeMeetingId && meta.meetingId && !base.includes(meta.meetingId)) {
    base = `${base} - ${meta.meetingId}`;
  }
  return base;
}

function applyCollisionSafeFilenames(entries) {
  const seen = new Map();
  return entries.map(entry => {
    const key = entry.targetBase.toLowerCase();
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    let finalBase = entry.targetBase;
    if (count > 0 || entries.filter(e => e.targetBase.toLowerCase() === key).length > 1) {
      if (entry.meetingId && !finalBase.includes(entry.meetingId)) {
        finalBase = `${entry.targetBase} - ${entry.meetingId}`;
      }
    }
    return { ...entry, targetFilename: `${finalBase}.txt` };
  });
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

function run() {
  assert.equal(sanitizeTitle('  A/B:C*D  '), 'A B C D');
  assert.deepEqual(dateParts('Apr 4, 2026 9:30 AM'), { date: '2026-04-04', time: '0930' });
  assert.equal(
    buildTargetBase(
      { title: 'Weekly Sync', meetingId: '12345678901', dateText: 'Apr 4, 2026 9:30 AM' },
      { filenamePattern: '{date} - {time} - {title}', includeMeetingId: false }
    ),
    '2026-04-04 - 0930 - Weekly Sync'
  );
  assert.equal(
    buildTargetBase(
      { title: 'Weekly Sync', meetingId: '12345678901', dateText: 'Apr 4, 2026 9:30 AM' },
      { filenamePattern: '{date} - {time} - {title}', includeMeetingId: true }
    ),
    '2026-04-04 - 0930 - Weekly Sync - 12345678901'
  );

  const collision = applyCollisionSafeFilenames([
    { targetBase: '2026-04-04 - 0930 - Weekly Sync', meetingId: '111' },
    { targetBase: '2026-04-04 - 0930 - Weekly Sync', meetingId: '222' },
  ]);
  assert.equal(collision[0].targetFilename, '2026-04-04 - 0930 - Weekly Sync - 111.txt');
  assert.equal(collision[1].targetFilename, '2026-04-04 - 0930 - Weekly Sync - 222.txt');

  const parsed = parseRowText("Weekly Sync 123 4567 8901 foo@bar.com Apr 4, 2026 9:30 AM 3 days Download Delete");
  assert.deepEqual(parsed, {
    title: 'Weekly Sync',
    meetingId: '12345678901',
    dateText: 'Apr 4, 2026 9:30 AM',
  });

  const parsedSingular = parseRowText("Last Page Meeting 123 4567 8901 foo@bar.com Apr 18, 2026 7:01 AM 1 day Download Delete");
  assert.deepEqual(parsedSingular, {
    title: 'Last Page Meeting',
    meetingId: '12345678901',
    dateText: 'Apr 18, 2026 7:01 AM',
  });

  console.log('logic.test.mjs: all tests passed');
}

run();
