# Zoom Transcript Downloader

## What this project does

Chrome extension for Zoom transcript pages that:
- downloads all available transcript `.txt` files across paginated Zoom results
- resets to page 1 before bulk download to make the run deterministic
- generates a rename kit:
  - manifest JSON
  - OS-specific rename script (`.sh` or `.ps1`)
- captures the **actual observed browser download filenames** and renames from those exact filenames instead of guessing by timestamp order

## Who it is for

- non-technical public users who can follow a short install guide
- users on Chrome/Edge who need repeatable Zoom transcript downloads and clean filenames
- maintainers/LLMs continuing a brittle browser automation codebase

## Core features

- Injected panel on `zoom.us/recording/meeting/transcript*`
- `Save all available` across paginated transcript listings
- Automatic run reset before each save-all
- OS auto-default based on install platform
- Configurable filename pattern
- Optional meeting ID in filenames
- Collision handling by appending meeting ID
- Rename kit generation using captured source filenames
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
5. Wait for the run to finish
6. Click **Generate rename kit**
7. Run the generated script in the folder containing the downloaded transcript `.txt` files

### Run generated script
#### macOS
```bash
cd /path/to/download/folder
chmod +x rename_zoom_transcripts.sh
./rename_zoom_transcripts.sh
```

#### Windows / Edge / Chrome
```powershell
cd C:\path\to\download\folder
powershell -ExecutionPolicy Bypass -File .\rename_zoom_transcripts.ps1
```

## Important commands

### Reload extension after code changes
- Chrome / Edge → `chrome://extensions` → **Reload** → refresh Zoom page

### Validate JS syntax locally
```bash
node --check background.js
node --check content.js
```

### Git commands
```bash
git status
git add .
git commit -m "..."
git push
```

## High-level project structure

```text
zoom-transcript-extension/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── page-hook.js
├── popup.html
├── popup.js
├── USER_GUIDE.md
├── README.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── TESTING.md
└── handoff/
```
