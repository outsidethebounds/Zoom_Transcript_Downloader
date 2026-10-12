# Zoom Transcript Downloader

Zoom Transcript Downloader is a Chrome and Microsoft Edge extension for saving the transcript `.txt` files that appear on Zoom's web-based **Transcripts** page.

## What It Does

- Finds the transcript entries that Zoom currently allows you to download.
- Works through the transcript result pages for you.
- Saves the available transcripts with organized filenames.
- Skips transcript rows that Zoom shows as unavailable.

The guided workspace opens on first install and from the extension toolbar. Enter or edit your company Zoom subdomain (pre-filled with the verified imprivata value), choose sources, and start a metadata-only scan of both Zoom lists. Review the complete inventory before saving. A failed or partial scan blocks downloads; retry after resolving the indicated access/filter issue.

## Installation

### Recommended: Chrome Web Store

Install from the direct Chrome Web Store listing:

<https://chrome.google.com/webstore/detail/lbmejjnmnbjnoahehjfmhaiheopkgcdg>

This listing is private or unlisted, so most users will open it from the direct link instead of finding it through a normal Chrome Web Store search.

### Alternative: Manual Installation

If you were given the source package directly, or you are testing/developing locally:

1. Download the extension package and extract it first if it arrives as a ZIP file.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the extracted folder that contains `manifest.json`.

See the full guide for step-by-step instructions and screenshots.

## Quick Start

1. Install the extension; its guided workspace opens automatically.
2. Confirm or edit the company Zoom subdomain, then select Recording transcripts and/or My Notes transcripts.
3. Click **Open Zoom and scan sources**. Sign in on Zoom if prompted; both lists are scanned for metadata only.
4. Review the complete inventory and source counts. No downloads start before this review.
5. Click **Save reviewed transcripts** and keep the browser open until the source summaries finish.
6. Find files in your browser’s **Downloads** location, in the dated Recordings and My Notes folders.

## Documentation

- [Full User Guide](./USER_GUIDE.md)
- [Printable User Guide (PDF)](./guide/Zoom-Transcript-Downloader-User-Guide.pdf)
- [Quick Start](./guide/QUICK_START.html)
- [Quick Start PDF](./guide/Zoom-Transcript-Downloader-Quick-Start.pdf)

## Supported Browsers

- Google Chrome
- Microsoft Edge

## Development And Architecture

Developer and maintainer docs are kept separate from the end-user guides:

- [Architecture](./ARCHITECTURE.md)
- [Design notes](./design/README.md)
- [Design choices](./design/DESIGN_CHOICES.md)
- [Testing](./TESTING.md)
- [Release criteria](./RELEASE_CRITERIA.md)

## License

Copyright (c) 2026 Blake Stover. All rights reserved.

This repository is proprietary. No permission is granted to use, copy, modify, or redistribute this code without prior written permission.


## Guided workspace (2026.10)

The extension opens a guided workspace on first install and from the toolbar. Confirm the company Zoom subdomain and choose Recording transcripts, My Notes transcripts, or both. Scanning opens the Zoom lists in background tabs, waits up to two minutes for sign-in/page readiness, and inventories metadata only. No transcript export or file download occurs during discovery. Review both complete source lists before explicitly choosing **Download selected transcripts**; incomplete scans block downloads. Source-specific availability remains Unknown where Zoom provides no verified metadata. Exact matching badges appear only for shared opaque occurrence IDs; unmatched items remain in their original source list.

After review, downloads run sequentially in inactive Zoom tabs. Files are saved beneath `ZoomTranscripts-MMDDYYYY/Recordings/` and `ZoomTranscripts-MMDDYYYY/My Notes/` under the configured Downloads subfolder. My Notes uses Zoom’s authenticated transcript export capability from the list note ID where available, with the existing enabled **Download transcript** UI control as fallback. A file already completed is preserved if Stop is pressed; the coordinator prevents later exports. Read the per-source saved/skipped/failed/pending summary when the run ends. Login, rate limits, unavailable transcripts, and ambiguous failures are not silently reported as successful.

No account login or final production export was performed as part of this release-polish pass. The workspace is covered by mocked metadata-only scan, gating, matching, retry, accessibility, and download-flow tests; real Zoom/browser acceptance remains environment-dependent. Older screenshots and printable PDFs may show the prior recordings-only UI.
