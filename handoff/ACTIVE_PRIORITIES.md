# ACTIVE_PRIORITIES

## 1. Add lightweight automated tests for the logic that is now working
- **Why it matters:** the core runtime path has finally been validated manually; now it needs regression protection
- **Suggested starting files:** `content.js`, new test files/helpers
- **Risks / dependencies:** current file structure is not test-friendly and may need helper extraction first

## 2. Reduce maintenance risk in `content.js`
- **Why it matters:** the current file is still large, stateful, and easy to break accidentally
- **Suggested starting files:** `content.js`, `ARCHITECTURE.md`
- **Risks / dependencies:** refactor must preserve current working behavior with minimal user-facing changes

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
