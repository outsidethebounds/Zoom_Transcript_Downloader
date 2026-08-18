# REPO_MANIFEST_LOG

## Purpose

This file is the living maintainer manifest for the repo.

Use it to capture:
- what the project is for
- what parts are active vs legacy
- why key design choices were made
- what was verified recently
- what future maintainers should watch closely

Append to this file over time instead of rewriting it from scratch.

## Repo identity

- Repo: `zoom-transcript-extension`
- Current product shape: private Manifest V3 browser extension
- Primary target: Zoom transcript recordings pages
- Core promise: bulk-download transcript `.txt` files, then generate a deterministic rename kit

## Developer purpose

The developer appears to be optimizing for a practical, low-friction tool rather than a polished store-distributed product.

Primary goals:
- make transcript collection repeatable across paginated Zoom results
- avoid partial runs by forcing page-1 reset first
- avoid unsafe rename guessing by tying rename output to observed browser downloads
- keep end-user workflow simple even if internals stay a bit ugly

Explicitly deprioritized:
- Chrome Web Store packaging
- desktop helper/service complexity
- broad browser automation beyond this narrow Zoom workflow
- major UI polish

## Functional summary

User flow:
1. Load the unpacked extension.
2. Open a Zoom transcript recordings page.
3. Click the extension icon to open the injected panel.
4. Run `Save all available`.
5. Let the extension walk pages and trigger Zoom's own download buttons.
6. Run `Generate rename kit`.
7. Execute the generated `.sh` or `.ps1` script in the clean transcript download folder.

Important behavioral contract:
- the extension should refuse to continue if it cannot safely reset to page 1
- the rename kit should refuse to generate if any download could not be matched to an observed browser filename

## Active architecture

### Active files

- `manifest.json`
  - MV3 configuration
  - content script injection for Zoom transcript URLs
  - service worker background entry
- `background.js`
  - settings bootstrap and OS defaulting
  - action badge behavior
  - download observation via `chrome.downloads`
  - artifact download endpoint for manifest/script generation
- `content.js`
  - UI injection
  - row parsing
  - pagination/reset logic
  - save-all runtime state
  - rename kit generation
- `content.css`
  - panel and modal styling
- `tests/logic.test.mjs`
  - lightweight pure-logic regression coverage

### Likely legacy files

- `popup.html`
- `popup.js`
- `page-hook.js`

Notes:
- `popup.*` still reflects the older localhost-helper architecture and stale settings like `helperBaseUrl`.
- `page-hook.js` is still declared web-accessible and injected, but the current `content.js` path does not appear to consume any posted messages from it.
- These files should be audited before removal, but they currently read as historical baggage rather than core runtime.

## Design choices worth preserving

### 1. Browser-only architecture

The repo deliberately abandoned a localhost helper. That is the right simplification for this tool unless Chrome limitations become a blocker again.

### 2. Use Zoom's own download buttons

This avoids rebuilding transcript export logic and reduces auth/session weirdness, but it tightly couples the extension to Zoom DOM and button behavior.

### 3. Fail closed on unsafe rename generation

This is one of the healthiest design choices in the repo. If exact observed source filenames are missing, the tool refuses to guess.

### 4. Reset to page 1 before every bulk run

This is effectively a data-integrity rule, not just a UX preference. It prevents accidentally treating a mid-list run as complete.

### 5. Script generation instead of in-extension file writes

This is a pragmatic compromise. The extra user step is acceptable given the file-system awkwardness of browser extensions.

## Code reality check as of 2026-08-15

What I verified directly:
- `background.js` parses with `node --check`
- `content.js` parses with `node --check`
- `tests/logic.test.mjs` passes
- current code path is panel-driven, not popup-driven
- download observation is implemented in `background.js`
- rename kit generation depends on `sourceFilename` captured during the save-all run

What still needs browser/manual verification for confidence:
- Zoom DOM selectors still match the live site
- paginator heuristics still work on real multi-page data
- page-1 reset still behaves correctly on all relevant transcript pages
- generated artifact download naming/extension behavior remains correct across browsers/OSes

## Design and maintenance risks

### Highest risks

- `content.js` is overloaded and mixes unrelated concerns
- row parsing depends on a brittle single regex over flattened row text
- pagination detection is heuristic, not model-driven
- legacy files create ambiguity about the current architecture

### Specific fragile seams

- `parseRowText()` assumes a specific row text structure ending in `Download Delete`
- pagination logic depends on current button labels, classes, and `aria-current`
- `waitForObservedDownload()` assumes download events arrive cleanly and in a usable order
- generated scripts trust `sourceFilename` values from the same run, which is good, but still browser-dependent

## Documentation quality notes

The repo docs are already better than average for a small automation tool. The handoff folder is useful and mostly coherent with the code.

Notable doc inconsistency to fix later:
- `manifest.json` reports version `1.4.5`
- `USER_GUIDE.md` header says `Version: 1.4.5`
- later in the same guide the "Current version" section says `v1.4.1`

That is minor, but exactly the kind of drift this manifest should keep visible.

## Suggested ongoing note-taking format

When future work happens, append entries like this:

### 2026-08-15
- Change:
- Why:
- Files touched:
- What was verified:
- New risks introduced:
- Docs updated:

## Better way to manage this long-term

This manifest is useful, but I would not rely on a single narrative file alone.

Best lightweight setup:
- keep this file as the high-level maintainer map
- keep `DECISIONS.md` for durable architecture decisions only
- add a small append-only `handoff/CHANGE_NOTES.md` with dated entries after each meaningful session
- extract pure logic from `content.js` into testable helpers so the repo's real source of truth becomes code plus tests, not prose

If you want one stronger improvement, do this next:
- create a tiny `src/lib/` or similar helper split for parsing, filename generation, and script generation
- point tests at those helpers
- leave DOM orchestration in `content.js`

That would reduce future rediscovery work more than adding even more documentation.
