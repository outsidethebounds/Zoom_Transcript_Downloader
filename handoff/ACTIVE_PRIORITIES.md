# ACTIVE_PRIORITIES

## 1. Make pagination truly reliable
- **Why it matters:** bulk download is the core value proposition; if it stops at page 1, the product is not doing the main job
- **Suggested starting files:** `content.js`
- **Relevant functions:** `findNextPageButton()`, `gotoNextPage()`, `Save all available` loop
- **Risks / dependencies:** tightly coupled to Zoom DOM; changes may need fresh DOM inspection

## 2. Make rename matching less brittle
- **Why it matters:** current generated scripts assume downloaded file order matches tracked manifest order
- **Suggested starting files:** `content.js`, `ARCHITECTURE.md`, `DECISIONS.md`
- **Risks / dependencies:** browser-managed download naming/order may limit what is possible without changing architecture again

## 3. Verify generated script extensions and download UX on both OSes
- **Why it matters:** users already hit cases where `.sh` arrived as `.txt`
- **Suggested starting files:** `background.js`, `content.js`, `USER_GUIDE.md`
- **Risks / dependencies:** browser download behavior can differ by platform and Chrome settings

## 4. Split `content.js` into smaller modules
- **Why it matters:** current file is large, stateful, and easy to break
- **Suggested starting files:** `content.js`, `manifest.json`
- **Risks / dependencies:** MV3 content script packaging is still simple/plain JS; refactor should stay minimal unless bundling is introduced

## 5. Remove or justify legacy files
- **Why it matters:** `popup.html`, `popup.js`, and possibly `page-hook.js` are historical leftovers and may confuse future maintainers
- **Suggested starting files:** `manifest.json`, `popup.html`, `popup.js`, `page-hook.js`
- **Risks / dependencies:** confirm they are truly unused before deleting

## 6. Add lightweight automated tests for pure logic
- **Why it matters:** parsing and script generation are easy to regress and easy to unit test
- **Suggested starting files:** new `test/` or similar, plus pure helper extraction from `content.js`
- **Risks / dependencies:** current code is not organized for testing; may require refactoring first

## Do not spend time on this yet

- packaging for the Chrome Web Store
- visual polish beyond small usability fixes
- building a full local helper again unless the browser-only approach is conclusively abandoned
- adding generic browser support beyond Chrome until core flow is stable
- broad feature expansion unrelated to transcript downloading and renaming
