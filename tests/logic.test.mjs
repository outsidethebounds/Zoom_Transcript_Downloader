import assert from 'node:assert/strict';
import core from '../lib/core.js';

const {
  sanitizeTitle,
  dateParts,
  buildTargetBase,
  applyCollisionSafeFilenames,
  parseRowText,
} = core;

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

  const parsed = parseRowText('Weekly Sync 123 4567 8901 foo@bar.com Apr 4, 2026 9:30 AM 3 days Download Delete');
  assert.deepEqual(parsed, {
    title: 'Weekly Sync',
    meetingId: '12345678901',
    dateText: 'Apr 4, 2026 9:30 AM',
  });

  const parsedSingular = parseRowText('Last Page Meeting 123 4567 8901 foo@bar.com Apr 18, 2026 7:01 AM 1 day Download Delete');
  assert.deepEqual(parsedSingular, {
    title: 'Last Page Meeting',
    meetingId: '12345678901',
    dateText: 'Apr 18, 2026 7:01 AM',
  });

  console.log('logic.test.mjs: all tests passed');
}

run();
