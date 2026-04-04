# TESTING

## How to run tests

There is no automated test suite in this repo right now.

Current practical checks are manual plus syntax validation.

### Syntax validation
Run from the extension folder:

```bash
node --check background.js
node --check content.js
```

### Manual browser test flow
1. Load unpacked extension in Chrome
2. Open Zoom transcript page
3. Confirm panel appears
4. Confirm transcript count updates from the page
5. Open Settings and verify:
   - filename pattern edits work
   - target OS default is sensible
6. Run `Save all available`
7. Verify:
   - transcript downloads trigger
   - pagination advances past page 1 when applicable
   - stop button works mid-run
8. Run `Generate rename kit`
9. Verify:
   - manifest downloads
   - script downloads with expected extension
10. Run generated script in a controlled folder
11. Verify filenames match expected pattern

## Current test coverage shape

- **Automated coverage:** none
- **Manual coverage:** all major behavior
- **Validation used during session:** repeated `node --check` after edits

## Known gaps

No automated tests exist for:
- row parsing from Zoom DOM text
- paginator detection
- manifest generation
- script generation correctness
- artifact download behavior in Chrome
- OS default inference
- script matching against real browser download ordering

## Flaky tests or missing test areas

There are no formal flaky tests, but these areas are inherently flaky in manual testing:
- Zoom pagination DOM changes
- browser download timing/order
- whether generated script is saved with correct extension
- row text parsing if Zoom changes layout or wording

## What must be verified after making changes

Always verify all of these after touching `content.js`, `background.js`, or `manifest.json`:

1. **Panel boot**
   - extension icon opens the page panel
   - transcript count updates after Zoom renders

2. **Pagination**
   - `Save all available` advances beyond first page
   - current selector still matches the transcript paginator

3. **Download tracking**
   - `downloadManifest` count matches what the user expects from the run

4. **Rename kit generation**
   - both manifest and script download
   - file extensions are correct enough to be usable

5. **OS-specific output**
   - macOS generates `.sh`
   - Windows generates `.ps1`
   - instructions shown are correct

6. **Generated script execution**
   - run script in a clean folder with transcript files
   - verify rename order and output names

7. **Regression checks**
   - settings still save
   - stop button still works
   - debug mode still reveals useful logs

## Recommended future test additions

If this repo gets a test harness later, prioritize:
- pure function tests for `parseRowText`, `buildFilename`, script generation
- DOM fixture tests for row collection and paginator button selection
- snapshot tests for generated manifest/script content
