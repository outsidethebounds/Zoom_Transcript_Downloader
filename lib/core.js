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

  function generateMacScript(entries) {
    const lines = [
      '#!/bin/bash',
      'set -euo pipefail',
      '',
      'renamed=0',
      'skipped_existing=0',
      'skipped_missing=0',
      '',
      'echo "Renaming Zoom transcript files in $(pwd)"',
      ''
    ];
    entries.forEach(entry => {
      lines.push(`if [ ! -f ${JSON.stringify(entry.sourceFilename)} ]; then echo "Missing expected source file: ${entry.sourceFilename}"; skipped_missing=$((skipped_missing+1)); else`);
      lines.push(`  if [ -e ${JSON.stringify(entry.targetFilename)} ]; then echo "Target already exists, skipping: ${entry.targetFilename}"; skipped_existing=$((skipped_existing+1)); else`);
      lines.push(`    mv ${JSON.stringify(entry.sourceFilename)} ${JSON.stringify(entry.targetFilename)}`);
      lines.push(`    echo "Renamed ${entry.sourceFilename} -> ${entry.targetFilename}"; renamed=$((renamed+1))`);
      lines.push('  fi');
      lines.push('fi');
      lines.push('');
    });
    lines.push('echo "Done. Renamed: $renamed | Skipped existing target: $skipped_existing | Missing source: $skipped_missing"');
    lines.push('');
    return lines.join('\n') + '\n';
  }

  function generatePowerShellScript(entries) {
    const lines = [
      '$renamed = 0',
      '$skippedExisting = 0',
      '$skippedMissing = 0',
      ''
    ];
    entries.forEach(entry => {
      lines.push(`if (!(Test-Path -LiteralPath ${JSON.stringify(entry.sourceFilename)})) { Write-Host "Missing expected source file: ${entry.sourceFilename}"; $skippedMissing++ }`);
      lines.push('else {');
      lines.push(`  if (Test-Path -LiteralPath ${JSON.stringify(entry.targetFilename)}) { Write-Host "Target already exists, skipping: ${entry.targetFilename}"; $skippedExisting++ }`);
      lines.push('  else {');
      lines.push(`    Rename-Item -LiteralPath ${JSON.stringify(entry.sourceFilename)} -NewName ${JSON.stringify(entry.targetFilename)}`);
      lines.push(`    Write-Host "Renamed ${entry.sourceFilename} -> ${entry.targetFilename}"`);
      lines.push('    $renamed++');
      lines.push('  }');
      lines.push('}');
      lines.push('');
    });
    lines.push('Write-Host "Done. Renamed: $renamed | Skipped existing target: $skippedExisting | Missing source: $skippedMissing"');
    lines.push('');
    return lines.join('\r\n') + '\r\n';
  }

  return {
    sanitizeTitle,
    sanitizeFilenameBase,
    parseRowText,
    dateParts,
    normalizeMeta,
    buildTargetBase,
    applyCollisionSafeFilenames,
    generateMacScript,
    generatePowerShellScript,
  };
});
