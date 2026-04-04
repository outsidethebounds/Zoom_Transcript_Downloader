# TESTING

## How to run tests

There is still no automated test suite. Current validation is syntax + manual browser verification.

### Syntax validation
```bash
node --check background.js
node --check content.js
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
- Verify target OS default is correct for current machine
- Verify filename pattern changes update the example
- Verify include-meeting-ID toggle persists

### 3. Save all available
Must verify all of these:
- run starts by trying to return to page 1
- if page-1 reset fails, run aborts clearly
- pagination advances beyond first page when more pages exist
- stop button works
- manifest resets between runs

### 4. Browser download observation
For each transcript click during save-all:
- background observes the actual browser download
- `downloadManifest` entry gets a real `sourceFilename`
- no rename kit is generated if source filenames are missing

### 5. Rename kit generation
Verify both files download:
- manifest JSON
- `.sh` or `.ps1` script

Verify:
- default filename format is `date - time - title`
- collisions append meeting ID
- OS-specific instructions are correct

### 6. Script execution
Run generated scripts in a clean folder with real downloaded transcript files.

#### macOS
```bash
chmod +x rename_zoom_transcripts.sh
./rename_zoom_transcripts.sh
```

#### Windows
```powershell
powershell -ExecutionPolicy Bypass -File .\rename_zoom_transcripts.ps1
```

Verify files are renamed from exact observed source filenames, not inferred order.

## Current coverage shape
- Automated tests: none
- Syntax checks: yes
- Manual testing: required for all meaningful behavior

## Known gaps
No automated tests for:
- row parsing
- pagination state detection
- page-1 reset behavior
- download observation logic
- collision handling
- generated script correctness

## Flaky / risky areas
- Zoom paginator DOM may change
- page-number detection may be absent or unreliable
- download observation may behave differently across browsers/platforms
- script extension handling still needs real-world validation on both OSes

## Recommended future tests
If test coverage is added, prioritize:
1. pure-function tests for filename generation and collision behavior
2. DOM-fixture tests for row parsing and paginator detection
3. manifest/script snapshot tests
4. integration test harness for download observation if feasible
