import assert from 'node:assert/strict';
import core from '../lib/core.js';
import page from '../lib/page.js';

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

  for (const pattern of [
    '{date} - {meetingId} - {title}',
    '{meetingId} - {date} - {title}',
    '{date} - {title} - {meetingId}',
    '{meetingId}',
  ]) {
    const name = buildTargetBase({title:'Quarterly - Review',meetingId:'',dateText:'Apr 4, 2026 9:30 AM'}, {filenamePattern:pattern,includeMeetingId:true});
    assert.doesNotMatch(name, /(?:^| )- $|--/);
    assert.doesNotMatch(name, /meetingId/);
  }
  assert.equal(buildTargetBase({title:'Quarterly - Review',meetingId:'12345678901',dateText:'Apr 4, 2026 9:30 AM'}, {filenamePattern:'{date} - {meetingId} - {title}',includeMeetingId:false}), '2026-04-04 - 12345678901 - Quarterly - Review', 'explicit legacy ID tokens preserve their intent');

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

  const liveRowText = 'Fixture meeting 123 4567 8901 attendee@example.com Oct 21, 2026 9:17 AM 1 day';
  assert.deepEqual(parseRowText(liveRowText), {
    title: 'Fixture meeting',
    meetingId: '12345678901',
    dateText: 'Oct 21, 2026 9:17 AM',
  }, 'row text remains parseable when action controls are aria-label-only');
  assert.equal(parseRowText('Fixture meeting Oct 21, 2026 9:17 AM'), null, 'date and age remain required');

  const downloadButton = { disabled: false, className: '', getAttribute: () => null };
  const liveRow = {
    innerText: liveRowText,
    getAttribute: name => name === 'data-key' ? 'fixture-occurrence' : null,
    querySelector: selector => selector === 'button[aria-label^="Download "]' ? downloadButton : null,
  };
  const scanRows = () => page.scanRows({
    rowSelector: 'tr.zoom-virtual-table__row',
    downloadButtonSelector: 'button[aria-label^="Download "]',
    parseRowText,
    root: { querySelectorAll: () => [liveRow] },
  });
  assert.equal(scanRows()[0]?.hasDownload, true, 'an enabled aria-labeled button keeps the row eligible');
  downloadButton.disabled = true;
  assert.equal(scanRows()[0]?.hasDownload, false, 'the enabled-download guard still excludes disabled actions');
  downloadButton.disabled = false;
  liveRow.querySelector = () => null;
  assert.equal(scanRows()[0]?.hasDownload, false, 'rows without a download button remain ineligible');

  const parsedSingular = parseRowText('Last Page Meeting 123 4567 8901 foo@bar.com Apr 18, 2026 7:01 AM 1 day Download Delete');
  assert.deepEqual(parsedSingular, {
    title: 'Last Page Meeting',
    meetingId: '12345678901',
    dateText: 'Apr 18, 2026 7:01 AM',
  });

  for (const title of ['IMP Technical team introduction to Wes', 'Imprivata - on site chat']) {
    const parsedTeams = parseRowText(`${title} - Apr 4, 2026 9:30 AM 1 day Download Delete`);
    assert.deepEqual(parsedTeams, { title, meetingId: '', dateText: 'Apr 4, 2026 9:30 AM' });
  }

  for (const title of ['IMP Technical team introduction to Wes', 'Imprivata - on site chat']) {
    const parsedLiveTeams = parseRowText(`${title} From Microsoft Teams - attendee@example.com Oct 8, 2026 04:19 PM 28 days Download Delete`);
    assert.deepEqual(parsedLiveTeams, { title, meetingId: '', dateText: 'Oct 8, 2026 04:19 PM' });
  }

  const parsedTeamsPlural = parseRowText('IMP Technical team introduction to Wes - Apr 4, 2026 9:30 AM 3 days Download Delete');
  assert.deepEqual(parsedTeamsPlural, {
    title: 'IMP Technical team introduction to Wes',
    meetingId: '',
    dateText: 'Apr 4, 2026 9:30 AM',
  });

  const parsedDashId = parseRowText('Imprivata - on site chat - user@example.com Apr 4, 2026 9:30 AM 1 day Download Delete');
  assert.deepEqual(parsedDashId, { title: 'Imprivata - on site chat', meetingId: '', dateText: 'Apr 4, 2026 9:30 AM' });

  const noIdNames = applyCollisionSafeFilenames([
    { targetBase: buildTargetBase({ title: 'IMP Technical team introduction to Wes', meetingId: '', dateText: 'Apr 4, 2026 9:30 AM' }, { filenamePattern: '{date} - {time} - {title}', includeMeetingId: true }), meetingId: '' },
    { targetBase: buildTargetBase({ title: 'Imprivata - on site chat', meetingId: '', dateText: 'Apr 4, 2026 9:30 AM' }, { filenamePattern: '{date} - {time} - {title}', includeMeetingId: true }), meetingId: '' },
  ]);
  assert.deepEqual(noIdNames.map(entry => entry.targetFilename), [
    '2026-04-04 - 0930 - IMP Technical team introduction to Wes.txt',
    '2026-04-04 - 0930 - Imprivata - on site chat.txt',
  ]);

  console.log('logic.test.mjs: all tests passed');
}

run();
