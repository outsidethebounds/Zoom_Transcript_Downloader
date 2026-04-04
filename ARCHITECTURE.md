# ARCHITECTURE

## System overview

This is a Manifest V3 Chrome extension that runs against the Zoom transcript recordings page.

High-level responsibilities:
1. inject UI into the Zoom transcript page
2. drive Zoom transcript downloads through the page’s own download buttons
3. reset to page 1 and traverse paginated results
4. observe actual browser downloads via the Chrome downloads API
5. generate a manifest JSON and OS-specific rename script using **exact observed source filenames**

This is now a browser-only architecture. Earlier helper-based designs were abandoned.

## Main components / modules

### `manifest.json`
Defines:
- MV3 extension
- service worker background
- content script injection into Zoom transcript URLs
- permissions for downloads, storage, tabs, scripting

### `background.js`
Responsibilities:
- infer default OS at install/startup
- persist settings in `chrome.storage.local`
- set badge on matching Zoom URLs
- observe actual browser downloads with:
  - `chrome.downloads.onCreated`
  - `chrome.downloads.onChanged`
- provide message handlers for:
  - settings get/set
  - latest observed download id
  - wait for next observed download
  - artifact downloads (manifest/script)

### `content.js`
Primary runtime and still the biggest file.

Responsibilities:
- parse transcript rows from Zoom DOM
- compute pagination state
- reset to page 1 before `Save all available`
- traverse pages with loop protection
- trigger transcript downloads and pair each click with an observed browser download filename
- store run state in `downloadManifest`
- generate rename kit using exact source filenames
- render the panel UI and settings modal

### `content.css`
Styles injected panel and modals.

### `page-hook.js`
Legacy helper-era artifact. Still present, not central to current workflow.

### `popup.html` / `popup.js`
Legacy popup-era artifacts. Current UX is page-panel driven.

## Data flow

### Download flow
1. user opens Zoom transcript page
2. content script boots panel
3. user clicks `Save all available`
4. extension:
   - resets manifest/run state
   - tries to navigate back to page 1
   - aborts if page-1 reset fails
   - processes visible rows page by page
   - for each row:
     - click Zoom download button
     - ask background to wait for the next observed browser download
     - store the observed source filename in `downloadManifest`
   - advances with the transcript paginator until exhausted or stopped

### Rename-kit flow
1. user clicks `Generate rename kit`
2. `content.js` verifies all entries have observed source filenames
3. collisions are resolved by appending meeting ID when needed
4. extension generates:
   - manifest JSON
   - `.sh` or `.ps1` rename script
5. `background.js` downloads those artifacts

## Key entry points

- `background.js`
  - `chrome.action.onClicked`
  - `chrome.downloads.onCreated`
  - `chrome.downloads.onChanged`
- `content.js`
  - `boot()`
  - `gotoFirstPage()`
  - `gotoNextPage()`
  - `triggerZoomDownload()`
  - `generateRenameKit()`

## Important dependencies

No npm runtime dependencies.

Relies on:
- Chrome extension APIs
- Zoom’s current DOM and paginator behavior
- browser download behavior

## External services / integrations

### Zoom website
Hard dependency. The system is tightly coupled to Zoom DOM structure and button labels/classes.

### Chrome / Edge extension APIs
Core APIs used:
- `chrome.storage.local`
- `chrome.downloads.*`
- `chrome.runtime.*`
- `chrome.tabs.*`
- `chrome.action.*`

## Read these files first

1. `README.md`
2. `USER_GUIDE.md`
3. `handoff/PROJECT_BRIEF.md`
4. `handoff/CURRENT_STATE.md`
5. `handoff/ACTIVE_PRIORITIES.md`
6. `handoff/KNOWN_ISSUES.md`
7. `DECISIONS.md`
8. `content.js`
9. `background.js`
10. `TESTING.md`

## Candid notes

- `content.js` is still overloaded and should eventually be split.
- Pagination remains the highest runtime risk.
- Rename reliability is much improved versus pure mtime ordering, but still depends on correctly observing browser downloads during the run.
- Legacy files remain and may be removable after stabilization.
