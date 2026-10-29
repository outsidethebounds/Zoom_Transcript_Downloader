# Zoom Transcript Downloader User Guide

Version: 2026.11 · guided workspace

## What it does

Zoom Transcript Downloader is a Chrome and Microsoft Edge extension for transcript files available to the Zoom account signed in through your browser. Its primary workflow opens an extension-owned workspace, scans the Recording and My Notes lists for review metadata, and exports only after you explicitly choose **Download selected transcripts**.

- **Recording transcripts** are transcript files in Zoom cloud recordings.
- **My Notes transcripts** are transcript files exposed by Zoom My Notes entries. The extension does not download note text, AI summaries, or other meeting documents.

The extension sees items accessible to the signed-in Zoom user. It does not perform an organization-wide crawl. Scanning reads list metadata only; it does not export transcript text or download files. Transcript content is read only during a user-requested export. Titles, dates, and other metadata can be sensitive, so handle the review inventory and downloaded files accordingly.

## Privacy and sign-in

Sign in directly on Zoom or your organization's SSO page. The extension never asks for or stores your Zoom password. It reads accessible transcript-list metadata from both sources for review. Transcript file content is accessed only after you start an export.

## Install

Install from the direct [Chrome Web Store listing](https://chrome.google.com/webstore/detail/lbmejjnmnbjnoahehjfmhaiheopkgcdg). The listing may be private or unlisted and may not appear in ordinary store search. Edge can install Chrome Web Store extensions if you allow extensions from other stores when prompted.

For manual installation, extract the supplied package, open `chrome://extensions` (Chrome) or `edge://extensions` (Edge), enable Developer mode, choose **Load unpacked**, and select the extracted directory containing `manifest.json`.

## Guided workflow: scan, review, download

1. Install the extension. The guided workspace opens on first install; later open it with the extension toolbar button.
2. Enter your organization's Zoom subdomain (the part before `.zoom.us`). Do not enter a password. Choose Recording transcripts, My Notes transcripts, or both for a later download. The scan reads metadata from both source lists; selection determines which complete sources can be exported.
3. Choose **Open Zoom and scan sources**. The extension opens or reuses the Zoom source tabs and scans metadata only. Sign in on Zoom or SSO if prompted. The workspace waits up to two minutes for recognized sign-in or page readiness. **Stop** cancels discovery. The extension may bring a Zoom tab forward when attention is needed.
4. Review source status and availability. Recording pagination completes only after Zoom reports its terminal page and the collected total matches. My Notes completeness uses the authenticated list API's empty `nextPageToken` and a matching count of collected metadata. An incomplete source cannot be included in an export; uncheck it or retry it from Review. A completed source scan is retained.
5. Select one or both fully scanned sources and choose **Download selected transcripts**. If none is selected, the workspace asks you to select at least one. Sources are processed sequentially. Active Zoom source pages show a centered progress bubble with live counts and a **Stop download** button. Completed files are preserved.
6. Review per-source saved, duplicates avoided, unavailable, failed, and remaining counts, plus the destination used for that run. **Action needed** is not success: follow the action shown for that source. Sign in only if requested; if a browser save dialog is outstanding, close or cancel it before retrying. A source-level export retry can save already successful items again and create additional uniquely named copies; review the retry warning before continuing.

Download settings can be opened from the collapsed **Download settings** section on both Connect and Review. Settings changes must be saved or discarded before scanning or exporting can continue. Review shows saved effective filename examples and destinations. Changing the company target or a reviewed Zoom source URL invalidates the inventory; scan again. Results show the destination captured for that run, including after reopening the workspace. For older runs without a recorded destination, the path is shown as unavailable. Source-list tabs may remain open for review and retry; the extension does not close user-created or reused tabs. Keep the browser open during a run.

## Understand the inventory and duplicate handling

Recording and My Notes items remain in separate lists. A verified exact shared occurrence ID can produce reciprocal **Also in My Notes** or **Also in Recordings** badges. A title or numeric meeting ID alone is not enough to match. Missing associations remain uncertain or unknown, not falsely grouped. Therefore the exact unique-meeting total across sources can be unknown even when both scans complete.

When both sources are selected, **Avoid duplicate meetings across sources** is enabled by default. For an exact shared occurrence ID, Recording is tried first. The matching My Notes transcript is avoided only if Recording saves successfully; My Notes is tried if Recording is unavailable or its export fails for that item. Sign-in or browser prompts can pause the batch before My Notes fallback runs. Turn the setting off to download both copies. The review estimate uses exact matches only, excludes known unavailable transcripts, and depends on successful Recording saves.

Availability is distinct from association: **Available**, **Unavailable**, or **Availability unknown until save**. List metadata may not establish export permission; unknown is neither unavailable nor a guarantee. Results report actual saved, unavailable, failed, and pending outcomes.

## Files and naming

Files go under the browser's Downloads directory, optionally inside the configured subfolder. Each run uses a dated `ZoomTranscripts-MMDDYYYY` folder with separate `Recordings` and `My Notes` folders. Existing files are preserved; filename conflicts are uniquified. Arbitrary absolute destinations are not supported.

The collapsed **Download settings** section on Connect and Review controls the filename pattern, optional Downloads subfolder, Recording meeting-ID suffix, and cross-source duplicate avoidance. Review shows separate effective Recording and My Notes filename examples and destinations; these are the saved settings used for export. The default pattern is `{date} - {time} - {title}`. Available tokens are `{date}`, `{time}`, `{title}`, and `{meetingId}`. Recording meeting IDs are optional: enabling the ID checkbox includes an ID in each Recording filename where available; adding `{meetingId}` to the pattern also enables the checkbox. Unchecking it removes the token. My Notes filenames never include a meeting ID. Empty optional tokens and adjacent separators are omitted. If date or time is missing, filenames use `unknown-date` or `unknown-time` instead of omitting the item. Review the examples before saving.

For an unattended batch, open browser **Settings > Downloads** and turn off **Ask where to save each file** before downloading. Turn it back on afterward if you prefer. The workspace repeats this reminder beside the destination. The extension cannot verify that preference or reliably detect a browser save dialog. If a download request does not respond within its bounded wait, the affected source stops and the workspace reports that a browser save dialog may need attention; check the browser and Downloads before retrying.

## Stop, retry, and progress warnings

Stop during a scan cancels discovery without starting exports. During export, Stop prevents later exports. Depending on the current source operation, that operation may finish or be canceled safely. Completed files remain; Stop does not roll them back.

For scan failures, retry the incomplete source from Review. Partial rows from that source cannot be exported as a complete inventory, while a completed source scan is retained. For export failures, retry is at the source level, not limited to failed rows. It can export already-saved rows again and create additional uniquely named copies. Existing files are preserved and conflicts are uniquified. Review the warning before retrying. Unavailable entries may be skipped; authentication, rate limits, changed Zoom behavior, and ambiguous failures are reported rather than treated as success.

If there is no export-count progress for three minutes, the workspace displays a warning. Long bounded Zoom or network waits can be normal. This warning is informational only: it does not stop or restart the export. Check the Zoom source tab or Downloads, and use **Stop download** only if you choose to end the export.

## Legacy page panel (advanced/fallback)

The older in-page panel remains on supported Zoom transcript pages as a manual or advanced workflow, separate from the primary guided workspace. It has source selection, save-selected-sources, a current-page action, and settings/help/debug controls. Older instructions or screenshots referring to **Save all**, **Save page**, or an automatically appearing panel describe that legacy UI.

## Troubleshooting

- **Workspace did not open:** use the extension toolbar button. For manual installs, reload the extension in the browser Extensions page.
- **Sign-in/access required or readiness timed out:** sign in directly on the indicated Zoom or SSO tab and retry. Readiness waits are bounded to two minutes.
- **A source scan is incomplete:** use that source's retry action on Review. A completed source scan is retained; partial rows from the incomplete source cannot be exported.
- **An export reports errors:** review that source's saved, unavailable, failed, and remaining counts and the retry warning. Confirm Zoom access and the selected date range, then retry the source needing attention. A source-level retry can create additional copies of items already saved successfully.
- **Company or source changed:** rescan; target changes invalidate the reviewed inventory.
- **No transcripts or some unavailable:** verify the source list and Zoom access. Availability may remain unknown until export.
- **Files not where expected:** check Downloads, the configured subfolder, dated folder, and separate source folders.
- **Zoom changed:** the extension depends on Zoom's pages, pagination, authentication, and export behavior. Reload or update, then retry. Report the source and failure stage without transcript content or authentication data.

Older screenshots may depict the former recordings-only or legacy panel. This guide describes the current guided workflow.

Supported browsers: Google Chrome and Microsoft Edge. Before sharing debug details or screenshots, check for meeting metadata, URLs, and other sensitive information.
