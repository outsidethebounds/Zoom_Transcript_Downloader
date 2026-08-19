# Zoom Transcript Downloader — User Guide

Version: 2026.08

## What this extension does

This extension helps you:
- download all Zoom transcript files across all available transcript pages
- skip entries where Zoom shows a disabled or greyed-out download button
- save the files directly with clean final filenames

## Important rule before you start

Use a **clean folder** for transcript downloads.

That means the folder where the extension is saving these transcript `.txt` files should not also contain unrelated `.txt` files.

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

### Download all transcripts
Click **Save all available**.

The extension should:
- reset to page 1 first
- plan filenames across all pages
- show a visible in-page notification that the download job is running
- save transcript files from all available pages
- skip greyed-out transcript rows that are unavailable
- stop with a clear error if page-1 reset fails

When the run finishes, the files should already have their final names.

## Settings

Open the gear icon to set:
- **Filename pattern**
- **Save folder inside Downloads**
- whether to include **meeting ID** in every filename

Use the **`?`** button in the panel header to open the About window with creator/contact details and the GitHub repo link.

### Default filename format
Default:

`{date} - {time} - {title}`

Example:

`2026-04-04 - 0930 - Weekly Sync.txt`

### Save folder
The extension can save into a subfolder under your browser's normal `Downloads` folder.

Example:

`Downloads/Work/Zoom/ZoomTranscripts-08182026`

The browser download API used here does not allow the extension to pick an arbitrary absolute folder on disk.

The filename pattern and save-folder settings both apply to the actual saved files.

### Optional meeting ID
Meeting ID is **not** included by default.

It can still be used automatically when two files would otherwise collide.

## Troubleshooting

### It does not download all pages
Turn on **Show debug** and try again.

### It says page-1 reset failed
The extension is designed to abort rather than risk a partial run.
Refresh the page and try again.

### It says the page no longer matches the plan
Zoom likely changed the visible list while the run was happening.
Refresh the page and try again.

## Current version

This guide was written for:

**Zoom Transcript Downloader v2026.08**
