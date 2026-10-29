# Guide files (2026.11)

The current end-user guides are [Quick Start](./QUICK_START.html) and [User Guide](./USER_GUIDE.html). Their checked-in PDF editions are generated from these HTML files:

- [Quick Start PDF](./Zoom-Transcript-Downloader-Quick-Start.pdf)
- [User Guide PDF](./Zoom-Transcript-Downloader-User-Guide.pdf)

The [Markdown user guide](../USER_GUIDE.md) describes the same workflow. After editing either HTML source, regenerate its PDF and inspect every rendered page. The local print commands and verification limits are in [TESTING.md](../TESTING.md). Printing a guide does not validate an authenticated Zoom export or publish an extension-store release.

## Historical illustrations

The following files are retained for design history and are not current workflow instructions:

- [Manual installation illustration](./manual-install-overview.svg): an older extension-manager layout and release label. The current manual installation procedure is in the guides above.
- [Recording panel illustration](./panel-overview.svg): the older recordings-only panel and its Save all / Save page controls.
- [Settings illustration](./settings-overview.svg): the older preferences dialog; it does not show current duplicate-avoidance controls.
- [Anonymized Zoom page screenshot](./zoom-transcript-page-anonymized.png): an older Zoom page layout, not a screenshot of the current guided workspace.

Historical release labels inside illustrations are preserved deliberately. The current extension version is defined by [manifest.json](../manifest.json).
