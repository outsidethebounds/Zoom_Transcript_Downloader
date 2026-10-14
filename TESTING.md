# Testing and verification

## Automated checks

Run from the repository root:

	test -f manifest.json
	node --check --input-type=module < background.js
	node --check lib/download-suppression.mjs
	node --check content.js
	node --check page-hook.js
	node --check --input-type=module < workspace.js
	node --test tests/*.test.mjs

The 2026.10 repository currently has 18 Node test files and 32 test cases. Tests are mocked Node/DOM/Chrome tests, not a full authenticated browser suite. Coverage includes guided inventory and exact matching, review and target guards, metadata-only scan boundaries, explicit terminal paging/authoritative totals, bounded readiness retry and Stop, metadata bridge allowlisting, source sequencing, export outcomes, download routing, live guided-job presentation, tab ownership, and pacing.

## Current pacing and guided status

Recording transcript loops enforce a minimum 1500 ms start-to-start interval. Time already spent awaiting the prior transcript response and Chrome download completion counts toward that interval, so no extra fixed pause is added afterward when work took 1500 ms or longer. This is pacing behavior, not a guarantee that each download completes within 1.5 seconds or that network latency improves. Route readiness, transcript response waits, loading timeouts, and server Retry-After/backoff are separate and unchanged; processing remains serial. My Notes virtualization/tooltip readiness waits and rate-limit retry policy are also unchanged.

The guided workspace shows a centered, high-contrast in-progress panel with live counts; its visual dimmer has pointer-events disabled so extension automation continues to work. Guided runs reuse eligible existing source tabs and only close extension-created worker tabs.

## What has and has not been verified

- Guided workflow code and tests enforce metadata-only discovery; exports start only after explicit reviewed-source selection.
- Recording completeness requires an actual terminal signal, not an assumed live count. Empty terminal data is accepted only with hasNextPage false; reported totals must reconcile.
- Both reciprocal association badges and source-list preservation are tested. Missing associations leave exact cross-source unique total unknown.
- The inventory's custom scroll rail supports keyboard and pointer/track interaction. Live visual/metadata checks have been made; native-wheel behavior through the custom rail is not confirmed by fresh acceptance.
- No fresh SSO-to-export acceptance run is claimed for this documentation pass. Prior test or historical live evidence must not be described as proof of current fresh-login success.

## Manual acceptance checklist for a product release

1. Install/reload the exact build in a supported Chrome or Edge profile.
2. Verify first-install workspace and toolbar entry; do not rely on the legacy injected panel.
3. Use a test account only with authorization. Confirm SSO happens on Zoom, no extension password prompt exists, and scan reads metadata without starting export/downloads.
4. Verify both source lists, visible scroll behavior using keyboard, pointer drag/track click, and native wheel. Check source labels, reciprocal exact-match badges, missing-association uncertainty, and availability Unknown separately.
5. Verify scan failure/incomplete terminal paging blocks export; verify recognized login/access readiness gives actionable state and stops waiting after at most two minutes.
6. Review sources, initiate export explicitly, verify the chosen source set, source-separated output folders, truthful saved/unavailable/failed/pending results, and Stop behavior. Confirm the centered source-page status bubble is read-only and visible only during active work/action-required state, then hides after terminal outcomes. Confirm completed files are retained and no automatic resume or per-asset selection is implied.
7. Verify workspace close does not restore legacy source panels; sign-in/action-required workers remain open; terminal cleanup closes only an extension-created worker still at the run source URL; a repurposed worker tab remains open; and no user-created/reused source tab is closed.
8. Change the company/source target after review and verify that the inventory is invalidated before export.
9. Inspect only artifact names, paths, sizes, and counts in ordinary test notes. Never record transcript text, credentials, cookies, or signed URLs.

Do not perform live scans, sign-ins, or downloads as routine unit-test validation. They require a separately authorized test account and user acceptance plan.

## Documentation checks

- Run the syntax and Node test commands above.
- Verify relative links and referenced repository files exist.
- Search documentation for stale workflow labels, version labels, unverified company defaults, live asset counts, and claims of fresh login/export acceptance.
- Printable PDFs are generated from `guide/QUICK_START.html` and `guide/USER_GUIDE.html` with an installed Chrome/Edge headless browser. On macOS with Edge installed, run from the repository root (uses a temporary isolated profile; do not use a normal or dedicated Zoom profile):

  ```sh
  EDGE="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  PROFILE="$(mktemp -d /tmp/zoom-guide-edge-profile.XXXXXX)"
  trap 'rm -rf "$PROFILE"' EXIT
  "$EDGE" --headless --disable-gpu --disable-extensions --disable-sync --disable-background-networking --no-first-run --no-default-browser-check --user-data-dir="$PROFILE" --no-pdf-header-footer --print-to-pdf="$PWD/guide/Zoom-Transcript-Downloader-Quick-Start.pdf" "file://$PWD/guide/QUICK_START.html"
  "$EDGE" --headless --disable-gpu --disable-extensions --disable-sync --disable-background-networking --no-first-run --no-default-browser-check --user-data-dir="$PROFILE" --no-pdf-header-footer --print-to-pdf="$PWD/guide/Zoom-Transcript-Downloader-User-Guide.pdf" "file://$PWD/guide/USER_GUIDE.html"
  ```

  Then inspect both PDFs for current scan/review/explicit-download, two-source, and privacy language; check page count/text and visual layout before removing legacy labels. The PDFs are local HTML prints only—do not load Zoom pages or export real data for this task. Keep older screenshots marked as historical if they show the former recordings-only panel.
