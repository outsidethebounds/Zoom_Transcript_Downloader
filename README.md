# Zoom Transcript Downloader

## What this project does

Chrome extension for the Zoom transcript recordings page that:
- downloads transcript `.txt` files from Zoom
- attempts to traverse all transcript pages, not just the first page
- generates a rename kit:
  - manifest JSON
  - OS-specific rename script (`.sh` or `.ps1`)

The extension does **not** rename files directly inside Chrome. Renaming happens by running the generated script in the folder containing the downloaded transcript files.

## Who it is for

- a user manually downloading Zoom meeting transcripts from the Zoom web UI
- a technically comfortable user willing to load an unpacked extension and run a script afterward
- future developers/LLMs iterating on a very stateful browser automation workflow

## Core features

- Injects a UI onto `zoom.us/recording/meeting/transcript*`
- Detects visible transcript rows from the Zoom table DOM
- Supports `Save all available` across paginated transcript listings
- Generates:
  - manifest JSON of tracked downloads
  - rename script for macOS or Windows
- Auto-selects default target OS at install based on the platform where the extension is installed
- Lets the user customize filename pattern and target OS in Settings

## How to run it

### Install in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

### Use it
1. Open the Zoom transcript page
2. Click the extension icon
3. Click **Save all available**
4. Wait for downloads to finish
5. Click **Generate rename kit**
6. Run the generated script in the folder where the transcript `.txt` files were downloaded

### Run generated script
#### macOS
```bash
cd /path/to/download/folder
chmod +x rename_zoom_transcripts.sh
./rename_zoom_transcripts.sh
```

#### Windows
```powershell
cd C:\path\to\download\folder
powershell -ExecutionPolicy Bypass -File .\rename_zoom_transcripts.ps1
```

## Important commands

### Reload extension after code changes
- Chrome → `chrome://extensions` → **Reload** → refresh Zoom page

### Validate JS syntax locally
```bash
node --check background.js
node --check content.js
```

### Push repo changes
```bash
git status
git add .
git commit -m "..."
git push
```

## High-level project structure

```text
zoom-transcript-extension/
├── manifest.json          # Chrome extension manifest (MV3)
├── background.js          # service worker: settings, platform default OS, artifact downloads
├── content.js             # main in-page UI and Zoom page automation
├── content.css            # injected UI styling
├── page-hook.js           # page-world hook placeholder/injection support
├── popup.html             # older popup artifact, currently not the primary UX
├── popup.js               # older popup artifact, currently not the primary UX
├── USER_GUIDE.md          # user-facing install + usage guide
├── ARCHITECTURE.md        # system overview for maintainers
├── DECISIONS.md           # major design decisions and tradeoffs
├── TESTING.md             # testing guidance and gaps
└── handoff/
    ├── PROJECT_BRIEF.md
    ├── CURRENT_STATE.md
    ├── ACTIVE_PRIORITIES.md
    ├── KNOWN_ISSUES.md
    ├── SESSION_LOG.md
    ├── GLOSSARY.md
    └── PROMPTS.md
```
