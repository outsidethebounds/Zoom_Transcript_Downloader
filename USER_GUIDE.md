# Zoom Transcript Downloader User Guide

Version: 2026.10.2 · guided workspace

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
2. Enter your organization's Zoom subdomain (the part before .zoom.us); do not enter a password. Select Recording transcripts, My Notes transcripts, or both for the later download. Selection is not authorization to export. The guided scan checks both source lists; selection determines which complete sources can be downloaded.
3. Choose **Open Zoom and scan sources**. The extension opens/reuses both Zoom source lists in background tabs and scans metadata only. Sign in on Zoom/SSO if prompted. The workspace waits up to two minutes for recognized sign-in/page readiness; **Stop** cancels discovery. It may bring a Zoom tab forward when attention is needed.
4. Review source status and availability. Recording pagination completes only on Zoom’s explicit terminal page and a matching total. My Notes completeness comes from the authenticated list API’s empty `nextPageToken`, with a matching count of collected note metadata. If a scan is incomplete, retry that source from Review; its partial rows are not eligible for export, and a completed source scan is retained.
5. Select one or both fully scanned sources, then explicitly choose **Download selected transcripts**. With no source selected, the workspace prompts you to select at least one. Partial rows are never passed as a complete inventory. When both sources are selected, **Avoid duplicate meetings across sources** is on by default: exact shared occurrence IDs use Recording first. A duplicate is avoided only if Recording saves successfully; My Notes is tried when Recording is unavailable or fails for that item. Authentication or browser prompts can pause the batch before My Notes runs. The review estimate includes exact matches only, excludes known unavailable transcripts, and is conditional on successful Recording saves. Turn the setting off to download both copies. Sources are processed sequentially while the workspace shows progress/results. While a job is active, Zoom source pages show a centered progress bubble with live counts and a Stop download button; completed files are preserved.
6. Review per-source saved, duplicates avoided, unavailable, failed, and remaining counts, plus the destination used for that run. **Action needed** is not success: sign in on the indicated Zoom tab, then retry the affected source. Completed files remain in place. A source-level export retry can save successful items again and create additional uniquely named copies; review the warning before retrying.

The workspace keeps download settings editable on Connect and Review. Changes must be saved or discarded before scanning or exporting can continue. Review shows the saved effective filename examples and destinations. Changing the company target or a reviewed Zoom source URL invalidates the inventory; scan again. The Results view shows the destination captured for the run, including after reopening the workspace. For older runs without a recorded destination, the path is shown as unavailable. The source-list tabs may remain open for review and retry; the extension does not close user-created or reused tabs. Only its own terminal worker tab may be closed, and only while still on the run source page. Keep the browser open during a run.

## Understand the inventory

Recording and My Notes items remain in separate lists. A verified exact shared occurrence identifier may show a reciprocal **Also in My Notes** or **Also in Recordings** badge. A title or numeric meeting ID alone is not enough. Missing associations remain in their source list as uncertain/unknown, not falsely grouped. Therefore the exact unique-meeting total across sources can be unknown even when both scans complete.

Availability is distinct from association: **Available**, **Unavailable**, or **Availability unknown until save**. List metadata may not establish export permission; unknown is neither unavailable nor a guarantee. Results show actual saved, unavailable, failed, and pending outcomes.

My Notes exports transcript files available from note entries. It does not download note text, AI summaries, or other meeting documents. The sources and output folders remain distinct even when a verified association is shown.

## Files and naming

Files go under the browser's Downloads directory, optionally inside the configured subfolder. Each run uses a date-stamped ZoomTranscripts-MMDDYYYY root with separate Recordings and My Notes directories. Existing files are preserved; conflicts are uniquified.

For an unattended batch, open browser **Settings > Downloads** and turn off **Ask where to save each file** before downloading. Turn it back on afterward if you prefer. The workspace shows this reminder beside the destination. The extension cannot verify that preference or reliably detect a browser save dialog. If a download request does not respond within its bounded wait, the affected source stops and the workspace reports that a browser save dialog may need attention; check the browser and Downloads before retrying.

The collapsible Download settings section on Connect and Review controls the filename pattern, Downloads subfolder, Recording meeting-ID suffix, and cross-source duplicate avoidance. Save or discard edits before scanning or exporting. Review shows separate effective Recording and My Notes filename examples and destinations; these are the saved settings used for export. Duplicate matching uses exact shared occurrence IDs only. A title or numeric meeting ID alone is not enough, and missing associations remain uncertain. Default pattern: `{date} - {time} - {title}`. Tokens: `{date}`, `{time}`, `{title}`, `{meetingId}`. Recording meeting IDs are optional: enabling the ID checkbox includes the ID in every Recording filename where one is available; adding `{meetingId}` to the pattern also enables the checkbox, and unchecking it removes the token. My Notes filenames never include a meeting ID; an empty ID token and its adjacent separator are omitted. Missing date/time uses `unknown-date` / `unknown-time` rather than omitting a note. Review the examples before saving. Arbitrary absolute destinations are not supported; saves stay under browser Downloads.

## Stop, retry, and failures

Stop during a scan cancels discovery without beginning exports. During export it prevents later exports. Completed files remain; depending on the active source operation, the current operation may finish or be canceled safely. Check final counts; Stop does not roll back completed files.

The extension does not certify partial scans, label ambiguous failures as saved, or promise automatic resume. Retry an incomplete scan from Review using that source’s retry action; completed source scans are retained. For export failures, the retry is source-level rather than limited to failed rows. It may export already-saved rows again, creating additional uniquely named copies. Existing files are preserved and conflicts uniquified. Unavailable entries may be skipped; authentication, rate limits, changed Zoom behavior, and ambiguous failures are reported rather than treated as success.

## Legacy page panel (advanced/fallback)

The older in-page panel remains on supported Zoom transcript pages as a manual/advanced workflow, not the primary guided workflow. It has source selection, Save selected sources, a current-page action, and settings/help/debug controls. Older instructions/screenshots referring to Save all, Save page, or an automatically appearing panel describe that legacy UI, not the guided workspace.

## Troubleshooting

- **Workspace did not open:** use the extension toolbar button. For manual installs, reload the extension in the browser Extensions page.
- **Sign-in/access required or readiness timed out:** sign in directly on the indicated Zoom/SSO tab and retry. Readiness waits are bounded to two minutes.
- **My Notes scan incomplete:** a page is complete only after the authenticated Notes API returns an empty `nextPageToken` and the collected row count matches. If that proof is missing, collected rows are partial and cannot be exported as complete.
- **A source scan is incomplete:** use that source’s retry action on Review. A completed source scan is retained; partial rows from the incomplete source cannot be exported.
- **A source export reports errors:** review that source’s saved, unavailable, failed, and remaining counts and the retry warning. Confirm Zoom access and the selected date range, then retry only the source needing attention. A source-level retry can create additional copies of items already saved successfully.
- **Company/source changed:** rescan; target changes invalidate reviewed inventory.
- **No transcripts/some unavailable:** verify the source list and Zoom access. Availability may remain unknown until export.
- **Files not where expected:** check Downloads, configured subfolder, dated root, and the separate source folders.
- **Zoom changed:** the extension depends on Zoom's pages, pagination, authentication, and export behavior. Reload/update then retry; report the source and failure stage without transcript content or authentication data.

## Validation and limitations

User-assisted Edge acceptance completed a full two-source export and reconciled terminal results with downloaded files. Workspace reload recovered terminal totals. A follow-up metadata scan Stop check confirmed that the completed source stayed complete, the incomplete source was marked stopped, and no export began; existing files remained unchanged. Chrome, Stop during active export, rate-limit/expiry behavior, and broader native-wheel rail behavior remain untested. Native scrolling through the Recording inventory was verified live.

Older screenshots and printable PDFs may depict the former recordings-only/legacy panel. This current guide and README describe the guided workflow.

Supported browsers: Google Chrome and Microsoft Edge. Zoom's site behavior can change. Before sharing debug details/screenshots, check for meeting metadata, URLs, or other sensitive information.
