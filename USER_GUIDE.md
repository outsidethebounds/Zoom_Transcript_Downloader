# Zoom Transcript Downloader — User Guide

Version: 1.4.5

## What this extension does

This extension helps you:
- download all Zoom transcript files across all available transcript pages
- skip entries where Zoom shows a disabled/greyed-out download button
- generate a rename kit that renames those files into clean filenames

The rename kit contains:
- a manifest JSON file
- a script for macOS or Windows

## Important rule before you start

Use a **clean folder** for transcript downloads.

That means the folder where Zoom is downloading these transcript `.txt` files should not also contain unrelated `.txt` files.

## Install the extension

1. Open Chrome or Edge
2. Go to `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked**
5. Select the `zoom-transcript-extension` folder

If you update the extension later:
1. go back to `chrome://extensions`
2. click **Reload**
3. refresh the Zoom transcript page

## Open the extension

1. Open the Zoom transcript page
2. Click the extension icon

## Main workflow

### 1. Download all transcripts
Click **Save all available**.

The extension should:
- reset to page 1 first
- download transcript files from all available pages
- stop with a clear error if page-1 reset fails

### 2. Generate the rename kit
After downloads finish, click **Generate rename kit**.

This downloads:
- a manifest JSON file
- a rename script

### 3. Run the script in the download folder
Run the script in the same folder where the transcript `.txt` files were downloaded.

## Settings

Open the gear icon to set:
- **Filename pattern**
- **Target OS**
- whether to include **meeting ID** in every filename

### Default filename format
Default:

`{date} - {time} - {title}`

Example:

`2026-04-04 - 0930 - Weekly Sync.txt`

### Optional meeting ID
Meeting ID is **not** included by default.

It can still be used automatically when two files would otherwise collide.

## Running the rename script

### macOS
```bash
cd /path/to/download/folder
chmod +x rename_zoom_transcripts.sh
./rename_zoom_transcripts.sh
```

### Windows / Edge / Chrome
```powershell
cd C:\path\to\download\folder
powershell -ExecutionPolicy Bypass -File .\rename_zoom_transcripts.ps1
```

## What the JSON file is for

The JSON manifest is not something you run.

It is a record of:
- what transcripts were tracked
- what filenames were expected
- what script instructions were generated

## Troubleshooting

### It does not download all pages
Turn on **Show debug** and try again.

### It says page-1 reset failed
The extension is designed to abort rather than risk a partial run.
Refresh the page and try again.

### The script will not run on Windows
Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\rename_zoom_transcripts.ps1
```

### The script is not a `.sh` file on macOS
Rename it to:

`rename_zoom_transcripts.sh`

Then run:

```bash
chmod +x rename_zoom_transcripts.sh
./rename_zoom_transcripts.sh
```

## Current version

This guide was written for:

**Zoom Transcript Downloader v1.4.1**
