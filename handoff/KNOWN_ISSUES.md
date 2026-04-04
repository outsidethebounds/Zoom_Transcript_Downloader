# KNOWN_ISSUES

## Bugs

- `currentPageNumber()`-style page inference is still weak and may return `null` in some Zoom DOM states
- Generated script download extension handling has historically been inconsistent (`.sh` sometimes arriving as `.txt`)
- Rename-kit generation depends on correctly observing browser downloads; if observation fails, it fails closed

## Flaky behavior

- DOM parsing of transcript rows is based on one specific text pattern and can break if Zoom changes wording/layout
- Pagination success is inferred from page text or row-key changes; both are heuristic
- Browser download ordering may not perfectly match manifest ordering

## Tech debt

- `content.js` is too large and mixes UI, automation, parsing, state, and script generation
- old UI files (`popup.html`, `popup.js`) still exist but are no longer the main UX
- `page-hook.js` still exists though current main workflow no longer depends on helper-style capture

## Performance concerns

- Save-all is intentionally throttled to 1.5 seconds between triggers
- Full-run downloads across many pages can take a while and are still fully sequential
- DOM rescans are mutation-driven and not especially optimized

## Confusing areas of the code

- which files are current vs legacy (`content.js` vs popup files vs page-hook)
- whether the rename kit is authoritative for the latest run; it is only as good as `downloadManifest`
- the extension summary/UI may imply stronger guarantees than the current matching logic really provides

## Places where future changes could easily break things

- any change to Zoom row text structure
- any change to Zoom pagination button classes/ARIA labels
- browser download filename handling
- script-generation assumptions about local file order
- UI changes to the main action panel if they alter state flow around `downloadManifest`
