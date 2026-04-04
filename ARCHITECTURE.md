# ARCHITECTURE

## System overview

This is a Manifest V3 Chrome extension that runs against the Zoom transcript recordings page.

At a high level it does three things:
1. injects UI into the Zoom transcript page
2. uses DOM interaction to trigger Zoom transcript downloads
3. generates a rename kit (manifest JSON + OS-specific script) after downloads are triggered

It is intentionally browser-driven. Earlier session work used a localhost helper service, but that architecture was abandoned in favor of a browser-only flow plus a generated post-processing script.

## Main components / modules

### `manifest.json`
Defines:
- MV3 service worker background
- permissions: `downloads`, `storage`, `activeTab`, `scripting`, `tabs`
- content script injection into transcript page URLs
- `page-hook.js` as a web-accessible resource

### `background.js`
Responsibilities:
- infer default target OS using `chrome.runtime.getPlatformInfo()`
- store / fetch settings via `chrome.storage.local`
- set extension badge on matching Zoom transcript URLs
- respond to:
  - `zoomTranscriptExtension:getSettings`
  - `zoomTranscriptExtension:setSettings`
  - `zoomTranscriptExtension:downloadArtifact`
- create downloadable manifest/script artifacts using a data URL + `chrome.downloads.download`

### `content.js`
This is the core of the product.

Responsibilities:
- detect transcript rows on the page
- parse meeting metadata from row text
- inject and manage the on-page panel UI
- manage settings modal and filename-pattern help modal
- trigger Zoom transcript downloads by clicking the page’s own download buttons
- track downloaded items into `downloadManifest`
- traverse pagination for `Save all available`
- generate rename kit content and request background download of those artifacts
- maintain debug logs

Key state in this file:
- `lastRows`
- `logLines`
- `currentSettings`
- `saveAllController`
- `downloadManifest`
- `rescanTimer`

### `content.css`
Styles the injected UI:
- panel
- launcher button
- settings modal
- pattern help modal
- debug area
- stop button states

### `page-hook.js`
Historical artifact from earlier attempts to intercept page-world network behavior. It still exists and is injected, but current rename-kit workflow relies primarily on DOM click + local manifest tracking rather than helper-mediated content capture.

### `popup.html` / `popup.js`
Legacy UI from earlier iterations. Current workflow is panel-first, not popup-first. These files still exist and may be removable later if truly unused.

## Data flow

### Main use path
1. User opens Zoom transcript page
2. Extension icon click sends `zoomTranscriptExtension:openPanel`
3. `content.js` boots panel, scans visible transcript rows, updates UI
4. User clicks `Save all available`
5. `content.js`:
   - collects visible rows
   - clicks each row’s download button
   - records metadata into `downloadManifest`
   - attempts to move to next Zoom paginator page
   - repeats until no more pages or stop requested
6. User clicks `Generate rename kit`
7. `content.js` builds:
   - manifest JSON
   - `.sh` or `.ps1` rename script
8. `content.js` asks `background.js` to download those artifacts
9. User runs the generated script in the transcript download folder

### Settings flow
1. Settings modal reads current settings from `chrome.storage.local`
2. User changes filename pattern / target OS
3. `content.js` sends `setSettings`
4. `background.js` persists values
5. `content.js` updates summary UI

## Key entry points

### Browser / extension entry points
- `background.js`: service worker boot
- `chrome.action.onClicked` → send `zoomTranscriptExtension:openPanel`
- `content.js` immediate `boot()` on page load

### Main UI handlers in `content.js`
- `#ztd-save-all`
- `#ztd-generate-kit-main`
- `#ztd-stop-save-all`
- `#ztd-settings`
- `#ztd-collapse`

## Important dependencies

No npm runtime dependencies are used by the extension itself.

Relies on:
- Chrome extension APIs
- Zoom’s current DOM structure
- browser download behavior

Developer tooling used in session:
- `node --check` for syntax validation
- git for versioning/pushing

## External services / integrations

### Zoom website
- hard dependency
- current target page: `https://zoom.us/recording/meeting/transcript*` (and subdomains)
- the extension is tightly coupled to Zoom’s DOM and pagination controls

### Chrome Extension APIs
- `chrome.storage.local`
- `chrome.downloads.download`
- `chrome.runtime.getPlatformInfo`
- `chrome.tabs.*`
- `chrome.action.*`

### GitHub
- repo push target only, not runtime

## Read these files first

For a new LLM, read in this order:
1. `README.md`
2. `handoff/PROJECT_BRIEF.md`
3. `handoff/CURRENT_STATE.md`
4. `handoff/ACTIVE_PRIORITIES.md`
5. `handoff/KNOWN_ISSUES.md`
6. `DECISIONS.md`
7. `content.js`
8. `background.js`
9. `manifest.json`
10. `USER_GUIDE.md`

## Candid notes

- `content.js` is doing too much. UI, DOM parsing, pagination, manifest generation, and script generation all live in one file.
- Pagination is the riskiest area because it depends on Zoom’s DOM behavior.
- The rename kit assumes order-based file matching, which is brittle.
- There are legacy remnants from abandoned designs (helper/popup) that are still present.
