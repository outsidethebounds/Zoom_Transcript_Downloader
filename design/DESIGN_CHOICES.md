# Design Choices

Last updated: 2026-08-18

## Release identity

- Human-facing release label: `2026.08`
- Manifest `version`: `2026.8`
- Manifest `version_name`: `2026.08`

Why:
- Chrome and Edge extension updates compare numeric dot-separated version segments.
- We keep the machine version compatible with that rule while preserving the desired release label in the UI and docs.

## Primary product goal

This extension is meant to make Zoom transcript export feel like a single-step batch save, not a manual download-plus-rename process.

Core goals:
- save transcript files directly with final names
- avoid duplicate native Zoom downloads
- keep the workflow understandable for a non-technical user
- stay browser-only

## Two-pass direct-save flow

The extension intentionally runs in two passes:

1. scan every page and plan the final filenames
2. go back and save files using that plan

Why:
- collision handling must work across the whole batch, not just one page
- Zoom pagination is brittle, so planning first gives a stable save plan
- it avoids inconsistent naming caused by save order

## Transcript capture model

The extension does not trust Zoom’s native download filename behavior.

Instead it:
- clicks the Zoom download control
- intercepts transcript response data in the page context
- reads transcript text from that response
- saves the file itself through the extension downloads API

Why:
- direct-save is simpler for users
- the extension controls final filenames
- rename scripts are no longer the primary workflow

## Native-download suppression

During direct-save batches, Zoom’s own transcript download should be suppressed and cleaned up.

Why:
- otherwise users can get duplicate files
- extension-owned saves are the intended output

## Filename pattern setting

The filename pattern field is intended to drive the actual saved filename.

Supported tokens:
- `{date}`
- `{time}`
- `{title}`
- `{meetingId}`

Default:
- `{date} - {time} - {title}`

Why:
- the preview should closely match the final saved result
- the user should be able to control naming without editing code
- sanitization still must protect against invalid filesystem characters

## Save-location setting

The extension supports choosing a save subfolder under the browser Downloads folder.

Example:
- `Downloads/Work/Zoom/ZoomTranscripts-08182026`

Why this is limited:
- the current Chrome / Edge downloads API supports relative download paths
- it does not offer a clean arbitrary absolute-folder picker for this workflow

Design decision:
- be honest in the UI about the constraint
- support subfolders under `Downloads`
- do not fake absolute-path selection

The main panel should also make the active destination visible without forcing the user to open Settings.

## Settings UI

The settings modal intentionally avoids raw JSON output.

Instead it shows:
- a live filename example
- a live save-location example
- a plain saved confirmation

Why:
- examples are more useful than internal state dumps
- the intended user flow is non-technical

## Help & About modal

The `?` button now opens an in-page Help & About modal.

It contains:
- creator attribution
- contact email
- GitHub repo link

Why:
- it keeps the user in context
- it is more useful than redirecting immediately to docs

## Code organization

Shared logic was split out of the old page monolith into:
- `lib/core.js`
- `lib/page.js`
- `lib/runtime.js`

Why:
- reduce duplication between runtime and tests
- keep parsing and naming logic reusable
- make future changes safer

## Known tradeoffs

- Zoom DOM and network behavior are still external dependencies and can change.
- `content.js` is smaller than before, but still orchestrates most runtime behavior.
- The browser Downloads UI may not always reflect the real saved-file count during native-download suppression.

## Guidance for future changes

- preserve the direct-save model unless Zoom forces a fallback
- keep the settings preview truthful to actual behavior
- prefer clarity in the UI over internal debug noise
- treat duplicate native downloads as regressions
