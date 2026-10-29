# Zoom Transcript Downloader

Zoom Transcript Downloader is a Chrome and Microsoft Edge extension that saves transcript files available to the Zoom user signed in through the browser.

## Current workflow (2026.11)

1. Open the extension-owned workspace from the toolbar. On first install, it opens automatically.
2. Enter the organization's Zoom subdomain and choose Recording transcripts, My Notes transcripts, or both. The workspace scans both source lists for review metadata regardless of export selection; source selection controls which complete lists may later be exported.
3. Choose **Open Zoom and scan sources**. The extension opens or reuses the Zoom source tabs and reads list metadata only. Sign in directly on Zoom or the organization's SSO page if prompted. Scans do not export transcript content or download files.
4. Review the inventory and source status. An incomplete source cannot be included in an export; uncheck it or retry it from Review. A completed source scan is retained.
5. Select one or both complete sources and choose **Download selected transcripts** to start export. Sources run sequentially. Review per-source saved, duplicates avoided, unavailable, failed, and remaining counts.

Download settings are in collapsed **Download settings** panes on Connect and Review. Save changes before scanning or exporting. Review displays the saved effective filename examples and destinations used by the next run.

When both sources are selected, **Avoid duplicate meetings across sources** is on by default. It matches only exact shared occurrence IDs and prefers Recording. The matching My Notes item is skipped only when the Recording transcript saves successfully; My Notes is tried when Recording is unavailable or fails for that item. Sign-in or browser prompts can pause the batch before fallback. Turn the setting off to download both copies. A title or numeric meeting ID alone does not establish a match. Items without shared IDs remain uncertain, so the exact unique-meeting total may be unknown. The review estimate is based on exact matches and is conditional on successful saves.

The extension is scoped to items accessible to the signed-in Zoom user, not an organization-wide crawl. It never asks for or stores your Zoom password. Scanning reads review metadata from both source lists regardless of export selection; transcript file content is accessed only after you explicitly start an export. My Notes means transcript files associated with note entries, not note text or AI summaries.

Files are saved under the browser's Downloads folder, optionally inside a configured subfolder, in a dated `ZoomTranscripts-MMDDYYYY` folder with separate `Recordings` and `My Notes` folders. Existing files are preserved and filename conflicts receive unique names. Missing dates or times use `unknown-date` or `unknown-time` in filenames.

For unattended batches, open browser **Settings > Downloads** and turn off **Ask where to save each file** before downloading; turn it back on afterward if you prefer. The extension cannot verify this browser preference. A browser save prompt may need attention. If a source export has errors, its retry is source-level and may save already successful items again as additional uniquely named copies; review the warning before retrying. A warning after three minutes without export-count progress is informational only: long Zoom or network waits can be normal, and the warning does not stop or restart the export.

## Install

Chrome Web Store direct listing: https://chrome.google.com/webstore/detail/lbmejjnmnbjnoahehjfmhaiheopkgcdg . It may be private or unlisted. Edge can install Chrome Web Store extensions if other-store extensions are allowed. For manual installation, extract the package, open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the folder containing `manifest.json`.

## Documentation

- [Changes in 2026.11](./CHANGELOG.md)
- [User guide](./USER_GUIDE.md)
- [Quick Start HTML](./guide/QUICK_START.html)
- [Guide sources and historical illustrations](./guide/README.md)
- [Printable quick-start guide (PDF)](./guide/Zoom-Transcript-Downloader-Quick-Start.pdf)
- [Printable user guide (PDF)](./guide/Zoom-Transcript-Downloader-User-Guide.pdf)
- [Architecture](./ARCHITECTURE.md)
- [Design notes](./design/README.md) and [decisions](./design/DESIGN_CHOICES.md)
- [Testing and evidence limits](./TESTING.md)
- [Release criteria](./RELEASE_CRITERIA.md)
- [Roadmap and research backlog](./ROADMAP.md)

Supported browsers: Chrome and Microsoft Edge. See [LICENSE](./LICENSE).
