# Zoom Transcript Downloader

Zoom Transcript Downloader is a Chrome and Microsoft Edge extension for saving the transcript `.txt` files that appear on Zoom's web-based **Transcripts** page.

## What It Does

- Finds the transcript entries that Zoom currently allows you to download.
- Works through the transcript result pages for you.
- Saves the available transcripts with organized filenames.
- Skips transcript rows that Zoom shows as unavailable.

The intended flow is simple:

> Open your Zoom **Transcripts** page, confirm the panel appears, then click **Save all**.

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

1. Install the extension.
2. Sign in to your Zoom web portal and open the **Transcripts** page for your recordings.
3. Confirm the Zoom Transcript Downloader panel appears on the page.
4. Click **Save all**.
5. Keep the Zoom tab open until the extension finishes.
6. Look in your browser's **Downloads** location and configured transcript subfolder.

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
