# Zoom Transcript Downloader User Guide

Version: 2026.10.1 (guided workspace)

## What it does

Zoom Transcript Downloader is a Chrome/Edge extension for transcripts available to the Zoom account signed in through your browser. Its primary workflow opens an extension-owned guided workspace, scans two supported lists for metadata, lets you review the inventory, and exports only after you explicitly choose **Download selected transcripts**.

Supported sources:
- **Recording transcripts** — the Transcripts list in Zoom cloud recordings.
- **My Notes transcripts** — Zoom My Notes → All notes entries that expose an exportable transcript.

The feature is scoped to the signed-in user's accessible items, not an organization-wide crawl. Discovery reads list metadata only: it does not export transcript text or download files. Titles, dates, and other metadata may be sensitive; handle the inventory and files accordingly.

## Privacy and sign-in

Sign in directly on Zoom or your organization's SSO page. The extension never asks for or stores your Zoom password. It does read accessible transcript-list metadata to build the review inventory, and reads transcript file content only during a user-requested export. Files are saved by the browser under its Downloads location.

## Install

Install from the direct Chrome Web Store listing: https://chrome.google.com/webstore/detail/lbmejjnmnbjnoahehjfmhaiheopkgcdg . The listing may be private/unlisted and not appear in ordinary store search. Edge can install Chrome Web Store extensions; allow extensions from other stores if Edge prompts.

For manual installation, extract the supplied ZIP, open chrome://extensions (Chrome) or edge://extensions (Edge), enable Developer mode, choose Load unpacked, then select the extracted directory containing manifest.json.

## Guided workflow: scan, review, download

1. Install the extension. The guided workspace opens on first install; later open it from the extension toolbar button.
2. Enter your organization's Zoom subdomain (the part before .zoom.us); do not enter a password. Select Recording transcripts, My Notes transcripts, or both for the later download. Selection is not authorization to export.
3. Choose **Open Zoom and scan sources**. The extension opens/reuses both Zoom source lists in background tabs and scans metadata only. Sign in on Zoom/SSO if prompted. The workspace waits up to two minutes for recognized sign-in/page readiness; **Stop** cancels discovery. It may bring a Zoom tab forward when attention is needed.
4. Review both source lists and availability states. Both scans must complete and pass source-completeness checks before download is enabled. If a scan is incomplete, retry after resolving access/readiness; partial inventory is not certified complete.
5. Select the sources to export, then explicitly choose **Download selected transcripts**. This starts transcript export. Sources are processed sequentially in inactive Zoom tabs while the workspace shows progress/results. While a job is active, Zoom source pages show a centered progress bubble with live counts and a Stop download button; idle guided source pages show no downloader panel. Completion/Stop/errors are reflected in the workspace; an actionable sign-in requirement remains visible.
6. Review per-source saved, unavailable, failed, and remaining counts. **Action needed** is not success: sign in on the indicated Zoom tab, then restart the affected source. Completed files remain in place.

After connection/results the workspace hides company/source setup. Its content is responsive and capped at 972px; this does not resize the browser or operating-system window. Changing the company target or a reviewed Zoom source URL invalidates the inventory; scan again. The source-list tabs may remain open for review and retry; the extension does not close user-created or reused tabs. Only its own terminal worker tab may be closed, and only while still on the run source page. Keep the browser open during a run.

## Understand the inventory

Recording and My Notes items remain in separate lists. A verified exact shared occurrence identifier may show a reciprocal **Also in My Notes** or **Also in Recordings** badge. A title or numeric meeting ID alone is not enough. Missing associations remain in their source list as uncertain/unknown, not falsely grouped. Therefore the exact unique-meeting total across sources can be unknown even when both scans complete.

Availability is distinct from association: **Available**, **Unavailable**, or **Availability unknown until save**. List metadata may not establish export permission; unknown is neither unavailable nor a guarantee. Results show actual saved, unavailable, failed, and pending outcomes.

My Notes exports transcript files available from note entries. It does not download note text, AI summaries, or other meeting documents. The sources and output folders remain distinct even when a verified association is shown.

## Files and naming

Files go under the browser's Downloads directory, optionally inside the configured subfolder. Each run uses a date-stamped ZoomTranscripts-MMDDYYYY root with separate Recordings and My Notes directories. Existing files are preserved; conflicts are uniquified.

The legacy page-panel Settings control the filename pattern and Downloads subfolder. Default pattern: {date} - {time} - {title}. Tokens: {date}, {time}, {title}, {meetingId}. Meeting ID is optional unless enabled; collisions receive unique names. Missing date/time uses unknown-date / unknown-time rather than omitting a note. Review the preview before saving. Arbitrary absolute destinations are not supported; saves stay under browser Downloads.

## Stop, retry, and failures

Stop during a scan cancels discovery without beginning exports. During export it prevents later exports. Completed files remain; depending on the active source operation, the current operation may finish or be canceled safely. Check final counts; Stop does not roll back completed files.

The extension does not certify partial scans, label ambiguous failures as saved, or promise automatic resume. Retry the source needing attention when practical. Existing files are preserved and conflicts uniquified. Unavailable entries may be skipped; authentication, rate limits, changed Zoom behavior, and ambiguous failures are reported rather than treated as success.

## Legacy page panel (advanced/fallback)

The older in-page panel remains on supported Zoom transcript pages as a manual/advanced workflow, not the primary guided workflow. It has source selection, Save selected sources, a current-page action, and settings/help/debug controls. Older instructions/screenshots referring to Save all, Save page, or an automatically appearing panel describe that legacy UI, not the guided workspace.

## Troubleshooting

- **Workspace did not open:** use the extension toolbar button. For manual installs, reload the extension in the browser Extensions page.
- **Sign-in/access required or readiness timed out:** sign in directly on the indicated Zoom/SSO tab and retry. Readiness waits are bounded to two minutes.
- **Scan incomplete:** do not export partial inventory. Check source access/list loading and retry. A recording scan is complete only with Zoom's explicit terminal pagination signal (hasNextPage false); an empty page without that signal is not proof. If Zoom reports an authoritative total, it must match collected rows.
- **Company/source changed:** rescan; target changes invalidate reviewed inventory.
- **No transcripts/some unavailable:** verify the source list and Zoom access. Availability may remain unknown until export.
- **Files not where expected:** check Downloads, configured subfolder, dated root, and the separate source folders.
- **Zoom changed:** the extension depends on Zoom's pages, pagination, authentication, and export behavior. Reload/update then retry; report the source and failure stage without transcript content or authentication data.

## Validation and limitations

The 2026.10.1 source commit has 20 Node test files and 54 mocked cases; these are not full live-browser acceptance. A live metadata-only check confirmed legacy panels remain hidden on both source tabs after reload and a My Notes panel remount. Recording metadata discovery returned 60 assets, but My Notes waited for Zoom sign-in/page readiness; the scan stopped before review/export with no downloads. A mocked 13-item pending result is not a resolved live 13-asset discrepancy. Live Stop-during-export, fresh SSO-to-export, and native-wheel rail acceptance remain unverified. Do not infer complete production acceptance from screenshots or test counts.

Older screenshots and printable PDFs may depict the former recordings-only/legacy panel. This current guide and README describe the guided workflow.

Supported browsers: Google Chrome and Microsoft Edge. Zoom's site behavior can change. Before sharing debug details/screenshots, check for meeting metadata, URLs, or other sensitive information.
