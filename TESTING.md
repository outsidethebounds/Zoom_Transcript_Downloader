# TESTING

## How to run tests

There is still no full automated browser test suite. Current validation is syntax, lightweight logic tests, and manual browser verification.

### Syntax validation
```bash
node --check background.js
node --check content.js
node --check page-hook.js
```

### Lightweight automated logic test
```bash
node tests/logic.test.mjs
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

### 3. Save all available
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

### 4. Direct-save behavior
For each transcript during save-all:
- page hook captures transcript response data
- background cancels the native Zoom download
- extension saves one final `.txt` file with the planned filename
- no rename script is needed afterward

### 5. Collision behavior
Verify:
- default filename format is `date - time - title`
- collisions append meeting ID when needed
- filenames are stable across a full run

## Current coverage shape
- Automated tests: lightweight pure-logic coverage in `tests/logic.test.mjs`
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

## Recommended future tests
If test coverage is added, prioritize:
1. DOM-fixture tests for row parsing and paginator detection
2. direct-save planning tests across duplicate filenames
3. page-hook message handling tests
4. integration test harness for Zoom transcript capture if feasible
