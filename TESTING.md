# TESTING

## How to run tests

There is still no full automated browser test suite. Current validation is syntax, lightweight logic tests, and manual browser verification.

### Syntax validation
```bash
node --check --input-type=module < background.js
node --check lib/download-suppression.mjs
node --check content.js
node --check page-hook.js
```

### Lightweight automated logic test
```bash
node tests/logic.test.mjs
node tests/download-suppression.test.mjs
node tests/source-logic.test.mjs
node tests/source-plan.test.mjs
node tests/coordinator.test.mjs
node tests/notes-worker.test.mjs
node tests/page-hook-worker.test.mjs
```

## Required manual verification after changes

### 1. Extension boot
- Load unpacked extension in Chrome/Edge
- Open Zoom transcript page
- Click extension icon
- Verify panel appears
- Verify transcript count updates after Zoom renders

### 2. Settings
- Open Settings
- Verify filename pattern changes update the example
- Verify include-meeting-ID toggle persists

### 3. Save all
Must verify all of these:
- run starts by trying to return to page 1
- if page-1 reset fails, run aborts clearly
- pagination advances beyond first page when more pages exist
- starting from a later page still results in a full run
- disabled / greyed-out transcript rows are skipped
- rows using both `1 day` and `N days` parse correctly
- running-job notification appears when bulk download starts
- stop button works
- run planning happens before file saves begin
- `Save page` only saves transcripts from the current page

### 4. Direct-save behavior
For each transcript during save-all:
- page hook captures transcript response data
- background cancels the native Zoom download
- extension saves one final `.txt` file with the planned filename
- the configured Downloads subfolder is applied to the saved file path

### 5. Collision behavior
Verify:
- default filename format is `date - time - title`
- collisions append meeting ID when needed
- filenames are stable across a full run

## Current coverage shape
- Automated tests: pure-logic coverage in `tests/logic.test.mjs` and mocked Chrome download lifecycle coverage in `tests/download-suppression.test.mjs`
- Syntax checks: yes
- Manual testing: still required for end-to-end browser behavior

## Known gaps
No automated tests for:
- pagination state detection
- page-1 reset behavior
- live transcript capture from the page hook
- native-download cancellation timing

## Flaky / risky areas
- Zoom paginator DOM may change
- page-number detection may be absent or unreliable
- Zoom may change how transcript downloads are requested
- native-download cancellation may behave differently across browsers/platforms
- the mocked download lifecycle tests cover both direct-save modes, delayed terminal events after finish, duplicate terminal events, extension-owned and out-of-run downloads, interrupted downloads, already-terminal creation, and bounded suppression tracking

## Recommended future tests
If test coverage is added, prioritize:
1. DOM-fixture tests for row parsing and paginator detection
2. direct-save planning tests across duplicate filenames
3. page-hook message handling tests
4. integration test harness for Zoom transcript capture if feasible

## Selected-source validation

Coordinator mocks cover recording-first order, inactive workers, bounded testLimit in both adapters, wrong-run result rejection, sequential completion, MV3 session restoration, Stop, login pause, exact native export filename routing, unrelated manual URLs, and terminal export delivery after suspension. Notes worker fixtures cover current-list scope, incremental pagination/stable-ID deduplication, disabled export controls, and opaque detail routes. Source tests cover source defaults/persistence normalization, source folders, collision names, and independent source summaries.

For a controlled live check, use the production startSourceRun message with testLimit: 1 (not a full collection click). Both adapters enforce the bound. Inspect artifact sizes/counts only; never print transcript bodies, cookies, or signed export URLs. Reset any CDP allowAndName download override before testing filename routing. Full authenticated 59/32-item collections are intentionally not part of the small recovery smoke test.

### Recovery smoke evidence (2026-10-11)

Headed Chrome for Testing 155, authenticated dedicated profile, production coordinator with testLimit 1. Sequential selected-source run exported one recording (47,649 bytes) and one My Notes transcript (27,687 bytes), complete and nonempty, into their separate dated source folders. Origin stayed on All notes; both inactive workers closed; no active runs remained. Tests inspected artifact metadata only. Earlier recovery probes exposed and corrected a preexisting CDP allowAndName override, missing DownloadItem.tabId, and asynchronous tooltip readiness; preexisting/probe files were retained, not deleted. Full collection and real login/permission expiry remain manual release checks; mocks cover auth pause/stop/session restoration.

Live metadata-only pagination probe confirmed 20 initial rows expand to 32 through Zoom’s existing onLoadMore UI callback. The MAIN-world bridge invokes that callback only at the list bottom; no raw authenticated list API is replayed.
