# Architecture

## Current product flow

The primary entry is the extension-owned workspace (workspace.html / workspace.js), not the legacy injected page panel. The workspace gathers a Zoom company subdomain and source choices; opens or reuses the Recording Transcripts and My Notes All notes lists in background tabs; requests metadata-only scans; builds a two-source inventory; and allows export only after both scans are complete, the inventory reviewed, and the selected source targets still match the reviewed snapshot.

Discovery is not transcript export. Recording scan completion requires Zoom's explicit terminal page state (hasNextPage false), empty terminal data, and consistency with any reported authoritative total. The Notes list is read for metadata through the existing app list UI. Partial, ambiguous, readiness-failed, or stale-target scans do not certify a downloadable inventory.

## Components

- manifest.json: MV3 extension, service worker, Zoom URL permissions, workspace resources, and content scripts.
- background.js: settings and install-time workspace opening; toolbar workspace entry; tab and source-run coordination; sequential source workers; exact download ownership/routing; stop and user-action notifications.
- workspace.html / workspace.js / workspace.css: guided connect, metadata scan, review, source selection, scrollable inventory, and results. The workspace content is capped at 972px and responsive to viewport width; this is not an operating-system window-size setting. Company/source setup is hidden on review/results. Scroll rail supports keyboard and pointer interactions; native-wheel rail behavior has not had fresh acceptance verification.
- content.js / content.css: retained legacy injected panel and source workers, recording capture/export, guided scan adapters, and panel settings.
- lib/guided-inventory.mjs: source grouping, availability, review gating, and reviewed-target guards.
- lib/guided-scan-retry.mjs: bounded readiness retries (up to two minutes) and cancellation.
- lib/notes-direct.js and my-notes.js: My Notes metadata discovery and authenticated export capability with validated response handling and retained UI fallback.
- my-notes-hook.js: page metadata/export bridge. It does not forward raw API responses into transcript capture.
- page-hook.js: recording transcript response capture during an explicit recording export.
- lib/core.js, lib/page.js, lib/sources.js, lib/runtime.js and other lib modules: filename, page, source, and message utilities.

## Source boundaries and privacy

The extension operates against Zoom pages accessible to the browser's signed-in user, not company-wide. Credentials are not requested or stored. Scanning reads list metadata only; transcript body access occurs only during a user-triggered export. My Notes export is a transcript-file operation, not a download of notes text, AI summaries, or meeting documents. Avoid putting real company identifiers, user-specific evidence, transcripts, or signed URLs into generic docs/logs.

## Inventory behavior

Sources remain distinct. Matching requires an exact verified occurrence identifier and is reciprocal in both lists; title or numeric meeting-ID resemblance is not enough. Missing associations produce uncertain/unknown group status, not an Unknown source section or fabricated unique count. Source availability is a separate tri-state and can remain unknown until actual export. The inventory shows both source lists; the exact unique cross-source meeting count remains unknown when association data is missing.

## Export behavior and output

After user selection, the guided coordinator processes selected sources sequentially, reusing eligible source-list tabs and creating inactive worker tabs only when needed. The legacy all-recordings action likewise reuses its loaded source tab; its page-scoped action remains isolated. Recordings capture the transcript response and save the planned text file. My Notes first uses Zoom's authenticated app export capability from the list note ID where available; a supported capability/schema change may use the existing enabled Download transcript UI fallback. Authentication, permission/not-found, rate limits, ambiguous errors, and stop are distinct outcomes; do not imply all retry or resume automatically. Stop prevents subsequent exports, and existing completed files are preserved.

Files use a date-stamped ZoomTranscripts-MMDDYYYY root, with Recordings and My Notes subfolders under optional Downloads-relative settings. Existing paths are preserved; Chrome conflict handling uniquifies names. Per-source summaries report saved/unavailable/failed/pending counts. No organization-wide scan, all-assets guarantee, asset-level selection promise, or automatic resume is implied.

## Legacy page panel

The injected panel and its save actions remain for advanced/manual fallback use; they are not the primary guided workflow. Older documentation/screenshots may describe this recordings-first panel. Keep its settings, page-action, and debug behavior clearly distinguished from guided scan/review/export.

## Dependencies and limitations

No npm runtime dependencies. Runtime depends on Chrome/Edge extension APIs and Zoom's current DOM, pagination, authenticated app behavior, and export interfaces. The repository's Node tests are mocked logic/lifecycle tests, not end-to-end browser coverage. The 2026.10 baseline includes 13 test files and 24 cases. Guided scans reuse source tabs because the Recording tab is an export origin/retry target; terminal cleanup is restricted to extension-created worker tabs still at their source URL, and login/user-action workers are retained. Closing the workspace does not restore legacy panels on guided source tabs. A possible authenticated-context/tabless enhancement is only an investigation backlog item, not implemented; see [ROADMAP.md](./ROADMAP.md). No claim of fresh SSO or full production export acceptance is made. See TESTING.md for exact evidence limits and commands.
