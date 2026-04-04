# GLOSSARY

## Transcript page
The Zoom web page listing transcript recordings, targeted by this extension.

## Transcript row
One visible row in the Zoom transcript table representing one downloadable transcript.

## Save all available
Main extension action intended to download transcripts across all available pages, not just the current visible page.

## Rename kit
The pair of generated files used after downloading transcripts:
- manifest JSON
- OS-specific rename script

## Manifest JSON
Reference/debug file containing the tracked transcript entries and expected filenames.

## Target OS
The operating system the generated rename script should target:
- `macos`
- `windows`

## Filename pattern
User-defined naming template using tokens such as `{date}` and `{title}`.

## `downloadManifest`
In-memory array in `content.js` that tracks what the extension believes it downloaded and how each file should be renamed.

## Paginator / next-page button
Zoom transcript page control used to navigate between transcript listing pages.

## MV3
Manifest V3, Chrome’s current extension model using a service worker background.

## page-hook
A page-world script artifact from earlier iterations. Currently not the primary mechanism for the active workflow.
