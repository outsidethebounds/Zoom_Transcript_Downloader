# Architecture

## Current product flow (2026.11)

The primary entry is the extension-owned workspace (workspace.html / workspace.js), not the legacy injected page panel. The workspace gathers a Zoom company subdomain and source choices; opens or reuses the Recording Transcripts and My Notes All notes lists in background tabs; requests metadata-only scans; builds a two-source inventory; and allows export only after the selected sources have complete scans, the inventory is reviewed, and the selected source targets still match the reviewed snapshot. Incomplete sources remain excluded.

Discovery is not transcript export. Recording inventory scans use `GET /rest/meeting/transcript/user/list?page=…`; completion requires the explicit `hasNextPage=false` terminal page, empty data, and any authoritative total matching collected rows. My Notes metadata uses the authenticated `GET /api/file/meeting_notes/my_notes` API (`meetingInfoRequired`, `pageSize`, then `pageToken`); the response schema is `notesList` and `nextPageToken`, with an empty token as terminal. The scanner verifies the accumulated row count. A live native Recording-row action verified `POST /rest/meeting/transcript/user/download` via XHR, with `meetingId` and `sortKey` in the request, responseType `blob`, HTTP 200, and `text/plain;charset=UTF-8`; both IDs must match the scanned occurrence and opaque row. The code enforces that contract. A user-assisted Edge full export from both sources was completed on 2026-10-16, before cross-source duplicate avoidance was implemented. It is historical export evidence only; it does not verify 2026.11 duplicate avoidance end to end.

## Components

- manifest.json: MV3 extension, service worker, Zoom URL permissions, workspace resources, and content scripts.
- background.js: settings and install-time workspace opening; toolbar workspace entry; tab and source-run coordination; sequential source workers; exact download ownership/routing; stop and user-action notifications.
- workspace.html / workspace.js / workspace.css: guided connect, metadata scan, review, source selection, scrollable inventory, settings save/discard, and results. The workspace content is capped at 972px and responsive to viewport width; this is not an operating-system window-size setting. The company field is hidden after Connect; source and settings disclosures remain available on Review and collapse on stage changes. Settings are hidden on Results. Scroll rail supports keyboard and pointer interactions; native scrolling through the Recording inventory was verified live, while broader rail behavior remains untested.
- content.js / content.css: retained legacy injected panel and source workers, recording capture/export, guided scan adapters, and panel settings.
- lib/guided-inventory.mjs: source grouping, availability, review gating, and reviewed-target guards.
- lib/guided-scan-retry.mjs: bounded readiness retries (up to two minutes) and cancellation.
- lib/notes-direct.js and my-notes.js: My Notes metadata discovery and authenticated export capability with validated response handling and retained UI fallback.
- my-notes-hook.js: page metadata/export bridge. It does not forward raw API responses into transcript capture.
- page-hook.js: recording transcript response capture during an explicit recording export.
- lib/core.js, lib/page.js, lib/sources.js, lib/runtime.js and other lib modules: filename, page, source, and message utilities.

## Source boundaries and privacy

The extension operates against Zoom pages accessible to the browser's signed-in user, not company-wide. Credentials are not requested or stored. Scanning reads list metadata only; transcript body access occurs only during a user-triggered export. My Notes export is a transcript-file operation, not a download of notes text, AI summaries, or meeting documents. Avoid putting real company identifiers, user-specific evidence, transcripts, or signed URLs into generic docs/logs.

## Inventory and duplicate-avoidance behavior

Sources remain distinct. Matching requires an exact verified occurrence identifier and is reciprocal in both lists; title or numeric meeting-ID resemblance is not enough. Missing associations produce uncertain/unknown group status, not an Unknown source section or fabricated unique count. Source availability is a separate tri-state and can remain unknown until actual export. The inventory shows both source lists; the exact unique cross-source meeting count remains unknown when association data is missing.

When both sources are selected, `avoidDuplicateMeetings` defaults on. Recording runs first. The coordinator passes forward only trimmed, nonempty occurrence IDs for successful nonempty Recording saves; My Notes suppresses rows whose trimmed, nonempty occurrence ID is in that set. This is an exact-ID, same-run preference for Recording, not a title/date/content heuristic and not a guarantee that every cross-source duplicate is recognized. Missing IDs may overlap. If a Recording item is unavailable or fails per item, its My Notes counterpart remains eligible as fallback. A required sign-in, browser prompt, or other user-action pause can stop the batch before that fallback runs. Turning the setting off allows both copies. Results account for `duplicates avoided` separately from saved, unavailable, failed, and pending counts. No prior-run export state is used to deduplicate a new run.

## Export behavior and output

After user selection, the guided coordinator processes selected sources sequentially, reusing eligible source-list tabs and creating inactive worker tabs only when needed. The legacy all-recordings action likewise reuses its loaded source tab; its page-scoped action remains isolated. Recording transcript export uses the verified Zoom POST-XHR/Blob contract and requires exact `meetingId`/`sortKey` correlation. My Notes first uses Zoom's authenticated app export capability from the list note ID where available; a supported capability/schema change may use the existing enabled Download transcript UI fallback. Authentication, permission/not-found, rate limits, ambiguous errors, and stop are distinct outcomes; do not imply all retry or resume automatically. Stop prevents subsequent exports, and existing completed files are preserved.

Files use a date-stamped ZoomTranscripts-MMDDYYYY root, with Recordings and My Notes subfolders under optional Downloads-relative settings. Existing paths are preserved; Chrome conflict handling uniquifies names. Missing date or time values use `unknown-date` or `unknown-time`. My Notes first parses a strict ISO date/time suffix in the accessible row label; if absent, it reads the Date created cell and accepts only an exact calendar date plus clock time. Relative labels such as “14 hours ago” are not converted and fall back to `unknown-*`. Per-source summaries report saved/duplicates-avoided/unavailable/failed/pending counts. No organization-wide scan, all-assets guarantee, asset-level selection promise, or automatic resume is implied.

## Legacy page panel

The injected panel and its save actions remain for advanced/manual fallback use; they are not the primary guided workflow. Older documentation/screenshots may describe this recordings-first panel. Keep its settings, page-action, and debug behavior clearly distinguished from guided scan/review/export.

## Dependencies and limitations

No npm runtime dependencies. Runtime depends on Chrome/Edge extension APIs and Zoom's current DOM, pagination, authenticated app behavior, and export interfaces. The 99 automated Node tests use mocked logic and lifecycle fixtures, not full browser coverage. A live Edge metadata-only scan and workspace UI check verified the default duplicate-avoidance setting and conditional Review estimate. The 2026-10-16 user-assisted full selected-source export predates duplicate avoidance and cannot validate that behavior. Live 2026.11 duplicate-avoidance export, Chrome acceptance, Stop during an active export, and rate-limit/expiry behavior remain untested. A warning after three minutes without export-count progress is read-only and does not stop or restart work. Native scrolling through the Recording inventory was verified; broader rail behavior remains untested. Guided scans reuse source tabs because the Recording tab is an export origin/retry target; terminal cleanup is restricted to extension-created worker tabs still at their source URL, and login/user-action workers are retained. Closing the workspace does not restore legacy panels on guided source tabs. A possible authenticated-context/tabless enhancement is only an investigation backlog item, not implemented; see [ROADMAP.md](./ROADMAP.md). See TESTING.md for evidence limits and commands.
