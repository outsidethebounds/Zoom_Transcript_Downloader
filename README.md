# Zoom Transcript Downloader

Zoom Transcript Downloader is a Chrome and Microsoft Edge extension for saving transcript files available to the signed-in Zoom user.

## Current primary workflow (2026.10.1)

1. Install the extension. The extension-owned guided workspace opens on first install; later open it from the toolbar button.
2. Enter your organization's Zoom subdomain and choose Recording transcripts and/or My Notes transcripts.
3. Select **Open Zoom and scan sources**. The extension opens/reuses both Zoom lists in background tabs and scans accessible metadata only. Sign in directly on Zoom/SSO if prompted. Discovery does not export transcript content or download files.
4. Review both completed source inventories. Incomplete scans block download; recognized sign-in/readiness waits are bounded to two minutes.
5. Select the sources to export and explicitly choose **Download selected transcripts**. Review per-source saved, unavailable, failed, and remaining results.

The scope is the signed-in user's accessible items, not a company-wide crawl. The extension never asks for or stores your password. It reads transcript metadata for review and transcript content only during a user-requested export. My Notes refers to transcript files, not note text, AI summaries, or other documents.

A verified exact shared occurrence ID may produce a reciprocal **Also in My Notes / Also in Recordings** badge. Titles or numeric meeting IDs alone do not match. Missing associations stay uncertain; the exact cross-source unique-meeting total can remain unknown. Availability can also remain unknown until export.

Files are saved beneath Downloads in a date-stamped ZoomTranscripts-MMDDYYYY folder with separate Recordings and My Notes subfolders. Existing files are preserved and conflicts uniquified. The collapsible Download settings section on Connect (also available in the legacy page panel) controls the filename pattern, optional Downloads subfolder, and Recording meeting-ID suffix. Changes are explicitly saved and apply to future runs.

## Install

Chrome Web Store direct listing: https://chrome.google.com/webstore/detail/lbmejjnmnbjnoahehjfmhaiheopkgcdg . It may be private/unlisted. Edge can install Chrome Web Store extensions if allowed. For manual install, extract the package, open chrome://extensions or edge://extensions, enable Developer mode, choose Load unpacked, and select the folder containing manifest.json.

## Documentation

- [Current user guide](./USER_GUIDE.md)
- [Quick Start HTML](./guide/QUICK_START.html)
- [Printable quick-start guide (PDF)](./guide/Zoom-Transcript-Downloader-Quick-Start.pdf)
- [Printable user guide (PDF)](./guide/Zoom-Transcript-Downloader-User-Guide.pdf)
- [Architecture](./ARCHITECTURE.md)
- [Design notes](./design/README.md) and [decisions](./design/DESIGN_CHOICES.md)
- [Testing and evidence limits](./TESTING.md)
- [Release criteria](./RELEASE_CRITERIA.md)
- [Roadmap and research backlog](./ROADMAP.md) (possible authenticated-context/tabless enhancement is not implemented)

The printable PDFs are regenerated from the current guided-workflow HTML guides. Older screenshots may still show the former recordings-only UI; follow the current guides for the supported workflow.

Supported browsers: Chrome and Microsoft Edge. See [LICENSE](./LICENSE).
