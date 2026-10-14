# Release criteria

## Product target

A usable Chrome/Edge extension for a signed-in Zoom user's accessible transcript files, with an extension-owned guided scan → review → explicit download workflow. It is not a company-wide inventory or export tool.

## Required user workflow

1. First install opens the guided workspace; the toolbar button reopens it.
2. User enters their Zoom company subdomain and selects Recording transcripts and/or My Notes transcripts.
3. Both source lists are opened/reused and scanned for metadata only. Sign-in and SSO occur directly on Zoom.
4. Both scans must be complete and the inventory reviewed. An incomplete/ambiguous scan blocks export.
5. The user selects source(s) and explicitly chooses Download selected transcripts.
6. Results distinguish saved, unavailable, failed, and remaining items per source; attention-needed states are not success.

## Must-pass criteria

### Privacy, scope, and consent
- Never request or store a Zoom password.
- Scan only accessible signed-in-user source lists; do not imply company-wide access.
- Discovery reads metadata only and never exports transcript content or downloads files.
- Transcript file content is accessed only after explicit user download action.
- Explain My Notes means transcript files only, not note text, AI summaries, or other documents.

### Inventory correctness
- Recording pagination finishes only with Zoom's explicit terminal hasNextPage false signal and any authoritative total matches collected rows; no hardcoded live item counts.
- Both source lists are retained separately. Only verified exact shared occurrence identifiers produce reciprocal association badges. Missing links remain uncertain, and exact unique-total availability is stated separately.
- Source availability supports available/unavailable/unknown and is not conflated with cross-source matching.
- Company or source URL changes after review invalidate the inventory before export.
- Custom scroll rail keyboard and pointer behavior is verified; native-wheel and fresh SSO-to-export acceptance must be explicitly recorded before claiming them.

### Export and completion truth
- No export starts during discovery or before review and explicit source selection.
- Saves are separated into dated Recordings and My Notes folders under Downloads.
- Existing completed files are preserved; conflicts do not overwrite them.
- Stop prevents later exports. Final summaries report actual outcomes and remaining work. Do not claim automatic resume, granular asset-level selection, or full export success unless implemented and verified.
- Login/access/readiness and other failures remain actionable, bounded, and clearly distinguished from completion.

### Documentation and packaging
- End-user docs reflect the guided primary workflow and separate the legacy page panel.
- Privacy, source scope, Unknown states, retries/Stop, outputs, and real verification limits are clear.
- Relative references work; old screenshots/PDFs are labelled as legacy until updated.
- Manifest version/version_name follow repository release policy before packaging/store upload. A docs-only commit does not itself publish a release.

## Verification status for 2026.10.1 source commit

The repository has 20 Node test files with 54 mocked Node/DOM/Chrome test cases. On 2026-10-14, an authorized live metadata-only scan in the dedicated Chrome test profile completed Recording discovery (60 assets) and then paused at My Notes sign-in/page readiness; it was stopped before any export. The live check exposed that the legacy Recording panel had its hidden attribute set but still occupied 497 px because ID-based layout CSS overrode the browser default hidden rule. Version 2026.10.1 adds an explicit CSS override for both legacy panels and retains startup-state race protection. The fix is covered by a CSS rule test and a post-fix live check after reloading both source tabs: the Recording panel and a deliberately recreated My Notes panel each had hidden=true, computed display none, zero height, and zero client rects while the guided workspace was open. A 13-item pending value in mocked tests is not proof that a live 13-asset discrepancy was reconciled. Live Stop-during-export and fresh SSO-to-export acceptance remain unverified. Native-wheel behavior is not freshly confirmed. This source commit does not publish a store package or GitHub Release. See TESTING.md for the manual checklist.
