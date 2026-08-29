# ARCHITECTURE

## System overview

This is a Manifest V3 Chrome extension that runs against the Zoom transcript recordings page.

High-level responsibilities:
1. inject UI into the Zoom transcript page
2. scan transcript rows and traverse paginated results
3. plan final filenames across the full run before saving
4. capture transcript response data from the Zoom page
5. save transcript files directly with final filenames
6. share pure parsing and page logic through small browser-safe libraries

This is a browser-only architecture. Earlier helper-based and rename-script-based designs have been removed from the active repo.

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
- manage batch folder state
- cancel native Zoom transcript downloads during direct-save batches
- save extension-owned transcript files and other artifacts through `chrome.downloads.download`

### `lib/core.js`
Pure shared logic for:
- transcript row parsing
- title sanitization
- date / filename normalization
- collision-safe target filename generation

This is loaded before `content.js` and is also imported directly by Node-based tests.

### `lib/page.js`
Shared page helpers for:
- scanning transcript rows
- pagination state
- page reset and next-page traversal
- row signature generation

### `lib/runtime.js`
Thin content-script client for background message passing.

### `content.js`
Primary runtime.

Responsibilities:
- render the page panel and settings modal
- keep the product title and footer utility controls in sync with panel state
- install the page hook
- plan a run across all pages
- execute the save pass page by page
- wait for transcript-response events from the page hook
- save transcripts with final filenames
- store run state in `downloadManifest`

### `page-hook.js`
Intercepts page `fetch` and `XMLHttpRequest` calls that look transcript-related and posts captured response data back to the content script.

### `content.css`
Styles injected panel and modals.

## Data flow

### Direct-save flow
1. user opens Zoom transcript page
2. content script boots panel
3. user clicks `Save all`
4. extension:
   - resets to page 1
   - scans every page to plan final filenames
   - applies collision handling before any file save begins
   - resets to page 1 again
   - processes rows page by page
   - for each row:
     - click Zoom download button
     - wait for the page hook to capture transcript response text
     - ask `background.js` to save the transcript with the planned final filename
   - advances with the transcript paginator until exhausted or stopped

### Page-hook flow
1. `content.js` injects `page-hook.js`
2. `page-hook.js` patches `fetch` and `XMLHttpRequest`
3. when a transcript-related response is seen, the hook posts a `window` message
4. `content.js` consumes that message as the transcript payload for the current row

## Key entry points

- `background.js`
  - `chrome.action.onClicked`
  - `chrome.downloads.onCreated`
  - `chrome.runtime.onMessage`
- `content.js`
  - `boot()`
  - `collectDownloadPlan()`
  - `saveTranscriptRow()`
  - `gotoFirstPage()`
  - `gotoNextPage()`

## Important dependencies

No npm runtime dependencies.

Relies on:
- Chrome extension APIs
- Zoom’s current DOM and paginator behavior
- Zoom’s current transcript fetch/download behavior

## External services / integrations

### Zoom website
Hard dependency. The system is tightly coupled to Zoom DOM structure, button behavior, and transcript network requests.

### Chrome / Edge extension APIs
Core APIs used:
- `chrome.storage.local`
- `chrome.downloads.*`
- `chrome.runtime.*`
- `chrome.tabs.*`
- `chrome.action.*`

## Candid notes

- The direct-save approach is cleaner for users, but still depends on Zoom’s current page behavior.
- `content.js` is slimmer than before, but it is still the main orchestrator and could be split further later.
- Pagination remains the highest runtime risk.
- `page-hook.js` is now part of the critical path.
- Legacy popup-era and helper-era files have been removed so the repo matches the current shipped architecture.
