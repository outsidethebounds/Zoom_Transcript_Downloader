# Zoom Transcript Downloader

## License

Copyright (c) 2026 Blake Stover. All rights reserved.

This repository is proprietary. No permission is granted to use, copy, modify, or redistribute
this code without prior written permission.

## What this project does

Chrome extension for Zoom transcript pages that:
- downloads all available transcript `.txt` files across paginated Zoom results
- resets to page 1 before bulk download to make the run deterministic
- plans final filenames across the whole run before saving
- saves transcripts directly with the final filenames and download-folder structure you choose

## Who it is for

- non-technical public users who can follow a short install guide
- users on Chrome/Edge who need repeatable Zoom transcript downloads and clean filenames
- maintainers/LLMs continuing a brittle browser automation codebase

## Core features

- Injected panel on `zoom.us/recording/meeting/transcript*`
- `Save all available` across paginated transcript listings, including a planning pass before saving
- Automatic run reset before each save-all
- Skips greyed-out / unavailable transcript rows and reports how many were unavailable on the current page
- Configurable filename pattern
- Configurable save folder inside Downloads
- Optional meeting ID in filenames
- Collision handling by appending meeting ID when needed
- Direct-save workflow using transcript content captured from the Zoom page
- Running-job notifications in the page UI while bulk download is active
- About/help button (`?`) in the panel header
- Debug mode hidden behind a toggle

## How to run it

### Install in Chrome / Edge
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

### Use it
1. Open the Zoom transcript page
2. Click the extension icon
3. Make sure you plan to use a **clean download folder**
4. Click **Save all available**
5. Leave the tab open while the running-job notification is active
6. Wait for the run to finish
7. Your transcript files should already be saved with final names

## Important commands

### Reload extension after code changes
- Chrome / Edge → `chrome://extensions` → **Reload** → refresh Zoom page

### Validate JS syntax locally
```bash
node --check background.js
node --check content.js
```

### Run the logic tests
```bash
node tests/logic.test.mjs
```

## High-level project structure

```text
zoom-transcript-extension/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── page-hook.js
├── lib/
│   ├── core.js
│   ├── page.js
│   └── runtime.js
├── USER_GUIDE.md
├── README.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── TESTING.md
├── design/
│   ├── README.md
│   └── DESIGN_CHOICES.md
└── tests/
```
