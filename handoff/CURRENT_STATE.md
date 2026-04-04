# CURRENT_STATE

## What works now

- Extension loads as unpacked MV3 extension
- Panel opens on the Zoom transcript page
- Target OS defaults based on install platform
- Filename pattern can be configured
- Transcript count updates dynamically instead of freezing permanently at zero
- `Save all available` exists and attempts to walk pagination
- `Generate rename kit` generates:
  - manifest JSON
  - macOS or Windows rename script
- Generated scripts have been manually run successfully at least in basic cases
- Repo is initialized and pushed to GitHub

## What is partially implemented

- Pagination across all pages
  - now targets the observed Zoom paginator selector
  - still not fully proven reliable
- Rename kit generation
  - works in some cases, but browser file-extension handling has been inconsistent in past iterations
- Cross-platform behavior
  - Windows and macOS outputs exist
  - Windows execution requires explicit PowerShell bypass command

## What is broken or risky

- Pagination remains the biggest risk area
- `currentPageNumber()` uses weak text parsing and may often return `null`
- rename scripts use order-based matching of local `.txt` files; this is brittle
- `content.js` is large and entangled
- leftover files (`popup.html`, `popup.js`, `page-hook.js`) may confuse future maintainers

## What was being worked on most recently

Most recent work focused on:
- cleaning up the panel UI
- removing helper architecture
- switching to rename-kit workflow
- debugging paginator detection
- using the real transcript next-page button selector provided by the user:
  - `button.btn-next[aria-label="Next page"]`

## Best next place to resume

Resume in `content.js`, specifically:
- `findNextPageButton()`
- `gotoNextPage()`
- the `Save all available` loop

Then manually test on a real Zoom transcript page with more than 15 items.

## Files/modules most relevant to the current state

- `content.js`
- `background.js`
- `manifest.json`
- `USER_GUIDE.md`
- `README.md`
- `handoff/KNOWN_ISSUES.md`
