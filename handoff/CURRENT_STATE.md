# CURRENT_STATE

## What works now

- Extension loads as unpacked MV3 extension
- Panel opens on Zoom transcript pages
- Target OS defaults from current platform
- Filename pattern is configurable
- Meeting ID can be toggled on explicitly
- Save-all flow resets to page 1 before downloading
- Multi-page `Save all available` has now been manually tested successfully in this session
- Starting from a non-first transcript page has been manually tested successfully in this session
- Disabled / greyed-out download rows are skipped correctly
- Browser downloads are observed in the background service worker
- Rename kit now uses captured source filenames instead of pure timestamp/order matching
- Generate rename kit has been manually tested successfully after multi-page runs in this session
- Repo and handoff docs are pushed to GitHub

## What is partially implemented

- Page-number detection still depends partly on DOM heuristics
- Script extension handling should still be validated again on both macOS and Windows after future changes
- The current architecture works, but `content.js` is still too large

## What is broken or risky

- If Zoom DOM changes, paginator detection may break again
- If download observation misses a file, rename-kit generation fails closed
- `content.js` remains very large and hard to maintain
- legacy files still exist (`popup.*`, `page-hook.js`)

## What was being worked on most recently

Most recent work completed:
- moved from order-based renaming to exact-source-filename renaming
- added page-1 reset requirement into save-all flow
- fixed disabled/greyed-out download button handling
- validated the major runtime flow with successful manual tests

## Best next place to resume

1. preserve and stabilize the current working behavior
2. remove legacy/dead files only after confirming they are truly unused
3. add lightweight automated tests around parsing, collision logic, and script generation
4. consider splitting `content.js` once behavior is stable enough not to regress

## Files/modules most relevant now

- `content.js`
- `background.js`
- `manifest.json`
- `USER_GUIDE.md`
- `TESTING.md`
- `handoff/KNOWN_ISSUES.md`
