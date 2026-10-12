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

The current 2026.10 baseline has 13 Node test files and 24 test cases. Tests are mocked Node/DOM/Chrome tests, not a full authenticated browser suite. Coverage includes guided inventory and exact matching, review and target guards, metadata-only scan boundaries, explicit terminal paging/authoritative totals, bounded readiness retry and Stop, metadata bridge allowlisting, source sequencing, export outcomes, and download routing.

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
6. Review sources, initiate export explicitly, verify the chosen source set, source-separated output folders, truthful saved/unavailable/failed/pending results, and Stop behavior. Confirm completed files are retained and no automatic resume or per-asset selection is implied.
7. Change the company/source target after review and verify that the inventory is invalidated before export.
8. Inspect only artifact names, paths, sizes, and counts in ordinary test notes. Never record transcript text, credentials, cookies, or signed URLs.

Do not perform live scans, sign-ins, or downloads as routine unit-test validation. They require a separately authorized test account and user acceptance plan.

## Documentation checks

- Run the syntax and Node test commands above.
- Verify relative links and referenced repository files exist.
- Search documentation for stale workflow labels, version labels, unverified company defaults, live asset counts, and claims of fresh login/export acceptance.
- Keep PDFs/screenshots clearly marked legacy unless regenerated from current sources and verified. See README and USER_GUIDE.md.
