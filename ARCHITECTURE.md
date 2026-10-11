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

## Selected-source coordinator and My Notes

background.js serializes one selected-source run per browser profile, recordings then notes, with origin/worker/run correlation. Run plans, active recording-batch routing, and pending native note export metadata use chrome.storage.session to survive MV3 suspension. Workers are not restarted by SPA/detail navigation. Closing a worker ends the run; login pauses with Action needed rather than silently continuing. My Notes persists only acknowledged numeric progress counters; a hard sign-in navigation preserves those counters and keeps the worker available for user login.

my-notes.js incrementally scrolls All notes using the existing onLoadMore UI callback and deduplicates stable opaque IDs. It plans collision-safe filenames from all discovered metadata, including title-only rows, before export. There is no two-pass detail preflight. Each note first requests export from the authenticated app context using its list ID. lib/notes-direct.js discovers and caches one small endpoint-specific webpack API wrapper by validated function/factory capability, not numeric module IDs. It invokes the app's own authenticated, cluster-aware client with {fileId}; no credentials are extracted and no plain-fetch API bypass exists. The observed response is {signedUrl, expiresAt}; both are validated on each request.

Exports and file saves are sequential. HTTP 401 pauses with Action needed; 403/404 skip honestly; 429 respects Retry-After for at most two retries (a delay over 60 seconds stops rather than retrying early). Other ambiguous failures stop. Missing/changed capability, unsupported endpoint, or changed successful response schema enables the retained detail/native-button fallback; no ambiguous failure switches paths after a save may have started. Signed URL expiry comes from expiresAt, with at most one fresh export after expiry or an interrupted signed-file authorization failure. Stop releases the isolated request immediately, ignores late responses, wakes retry waits, and prevents the next export. An already-complete file is counted; an active direct Chrome download is canceled on the next lifecycle check.

background.js starts exactly one extension-owned chrome.downloads download and correlates its exact ephemeral source URL plus extension ownership to the final source folder/name. The onDeterminingFilename listener must explicitly repeat the planned name; a bare suggest() otherwise reverts to the server filename in tested Chrome. In-flight/completed export IDs are deduplicated for the worker lifetime. Direct mode never clicks a native export anchor and never enters native suppression.

The UI fallback preserves stable detail-ID validation, enabled Download transcript controls, event-driven SPA route readiness, detached-scroll-root recovery, and one terminal native save per export. my-notes-hook.js annotates metadata and reports the native anchor URL, without reading transcript bodies. Native routing matches an exact URL or its SHA-256 digest (including the initial URL of redirected downloads); session recovery stores only that digest and metadata, never signed URLs. Unknown native mechanisms safely time out instead of claiming an unrelated manual download. Signed URLs live only in transient message/operation memory, not extension logs or storage. Chrome itself retains its normal download history. Source timeouts stop to avoid late-file miscorrelation.

Recording workers retain response capture and direct final-name saves. During direct save, the worker page hook prevents its native Zoom anchor download, avoiding duplicates/prompts without canceling unrelated manual downloads in another tab. Background suppression remains an exact-URL fallback; Chrome DownloadItem does not include tabId.
