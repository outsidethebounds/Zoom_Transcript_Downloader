(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.ZTDPage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function sanitizeRelativeFolder(path = '') {
    return String(path || '')
      .split(/[\\/]+/)
      .map(part => part.trim())
      .filter(part => part && part !== '.' && part !== '..')
      .map(part => part.replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[ .]+$/g, ''))
      .filter(Boolean)
      .join('/');
  }

  function getDownloadFolderName(now = new Date()) {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    return `ZoomTranscripts-${month}${day}${year}`;
  }

  function buildDownloadFolderPath(downloadSubfolder = '', now = new Date()) {
    const batchFolder = getDownloadFolderName(now);
    const prefix = sanitizeRelativeFolder(downloadSubfolder);
    return prefix ? `${prefix}/${batchFolder}` : batchFolder;
  }

  function isEnabledDownloadButton(button) {
    if (!button) return false;
    if (button.disabled) return false;
    if (button.getAttribute('aria-disabled') === 'true') return false;
    if ((button.className || '').includes('is-secondary-disabled')) return false;
    return true;
  }

  function scanRows({
    rowSelector,
    downloadButtonSelector,
    parseRowText,
    root = document,
  }) {
    return [...root.querySelectorAll(rowSelector)].map((row, index) => {
      const button = row.querySelector(downloadButtonSelector);
      const text = (row.innerText || '').trim();
      const meta = parseRowText(text);
      return {
        index,
        key: row.getAttribute('data-key') || '',
        text,
        meta,
        hasDownload: isEnabledDownloadButton(button),
        button,
        row,
      };
    }).filter(r => r.meta);
  }

  function rowSignature(rows = []) {
    return rows.map(r => `${r.key}|${r.meta?.meetingId || ''}|${r.meta?.dateText || ''}|${r.meta?.title || ''}|${r.hasDownload ? 'download' : 'missing'}`).join('||');
  }

  function transcriptCountText(root = document) {
    const body = root.body?.innerText || '';
    const m = body.match(/(\d+)\s+result\(s\)/i);
    return m ? Number(m[1]) : null;
  }

  function currentPageButton(root = document) {
    return root.querySelector('button[aria-current="page"], button[aria-current="true"], [role="button"][aria-current="page"]');
  }

  function inferPageNumberFromButton(button) {
    const text = (button?.textContent || '').trim();
    return /^\d+$/.test(text) ? Number(text) : null;
  }

  function findPrevPageButton(root = document) {
    return root.querySelector('button.btn-prev[aria-label="Previous page"][aria-disabled="false"]')
      || root.querySelector('button.btn-prev[aria-label="Previous page"]:not([aria-disabled="true"])');
  }

  function findNextPageButton(root = document) {
    return root.querySelector('button.btn-next[aria-label="Next page"][aria-disabled="false"]')
      || root.querySelector('button.btn-next[aria-label="Next page"]:not([aria-disabled="true"])');
  }

  function getPaginationState(root = document) {
    const currentButton = currentPageButton(root);
    const currentPage = inferPageNumberFromButton(currentButton);
    const pageButtons = [...root.querySelectorAll('button')]
      .map(b => (b.textContent || '').trim())
      .filter(t => /^\d+$/.test(t))
      .map(Number);
    const totalPages = pageButtons.length ? Math.max(...pageButtons) : null;
    const prevButton = findPrevPageButton(root);
    const nextButton = findNextPageButton(root);
    return {
      currentPage,
      totalPages,
      prevButton,
      nextButton,
      canGoPrev: !!prevButton && prevButton.getAttribute('aria-disabled') !== 'true' && !prevButton.disabled,
      canGoNext: !!nextButton && nextButton.getAttribute('aria-disabled') !== 'true' && !nextButton.disabled,
    };
  }

  async function waitForRowsChange({
    previousSignature,
    timeoutMs,
    sleep,
    scanRows,
    rowSignature,
  }) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(300);
      const rows = scanRows();
      const sig = rowSignature(rows);
      if (sig && sig !== previousSignature) {
        await sleep(500);
        const stableRows = scanRows();
        return { ok: true, rows: stableRows, signature: rowSignature(stableRows) };
      }
    }
    return { ok: false };
  }

  async function gotoFirstPage({
    getPaginationState,
    rowSignature,
    scanRows,
    waitForRowsChange,
    log,
  }) {
    const seen = new Set();
    for (let steps = 0; steps < 25; steps++) {
      const state = getPaginationState();
      const signature = rowSignature();
      const key = `${state.currentPage || 'unknown'}::${signature}`;
      if (seen.has(key)) {
        return { ok: false, error: 'Detected a loop while trying to return to page 1.' };
      }
      seen.add(key);
      if (state.currentPage === 1) return { ok: true, page: 1 };
      if (!state.canGoPrev) {
        const rowsNow = scanRows();
        if (rowsNow.length) {
          log('Assuming page 1 because previous-page control is disabled', { currentPage: state.currentPage, rows: rowsNow.length });
          return { ok: true, page: state.currentPage || 1 };
        }
        return { ok: false, error: 'Could not continue navigating back to page 1.' };
      }
      log('Resetting to page 1', { currentPage: state.currentPage, totalPages: state.totalPages });
      state.prevButton.click();
      const moved = await waitForRowsChange(signature);
      if (!moved.ok) {
        return { ok: false, error: 'Timed out while trying to return to page 1.' };
      }
    }
    return { ok: false, error: 'Too many attempts while resetting to page 1.' };
  }

  async function gotoNextPage({
    getPaginationState,
    rowSignature,
    waitForRowsChange,
    log,
  }) {
    const state = getPaginationState();
    const previousSignature = rowSignature();
    if (!state.canGoNext || !state.nextButton) {
      log('No usable next-page button found', { currentPage: state.currentPage, totalPages: state.totalPages });
      return { ok: false, reason: 'no-next-page' };
    }

    log('Attempting next-page navigation', {
      currentPage: state.currentPage,
      totalPages: state.totalPages,
      aria: state.nextButton.getAttribute('aria-label') || '',
    });
    state.nextButton.click();
    const moved = await waitForRowsChange(previousSignature);
    if (!moved.ok) {
      log('Next-page navigation timed out', { currentPage: state.currentPage });
      return { ok: false, reason: 'timeout' };
    }
    const afterState = getPaginationState();
    log('Next-page navigation succeeded', { from: state.currentPage, to: afterState.currentPage, rows: moved.rows.length });
    return { ok: true, state: afterState };
  }

  return {
    sanitizeRelativeFolder,
    getDownloadFolderName,
    buildDownloadFolderPath,
    isEnabledDownloadButton,
    scanRows,
    rowSignature,
    transcriptCountText,
    getPaginationState,
    waitForRowsChange,
    gotoFirstPage,
    gotoNextPage,
  };
});
