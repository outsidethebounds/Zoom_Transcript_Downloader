# Release criteria

## Product target

A usable Chrome/Edge extension for a signed-in Zoom user's accessible transcript files, with an extension-owned guided scan → review → explicit download workflow. It is not a company-wide inventory or export tool.

## Required user workflow

1. First install opens the guided workspace; the toolbar button reopens it.
2. User enters their Zoom company subdomain and selects Recording transcripts and/or My Notes transcripts.
3. Both source lists are opened/reused and scanned for metadata only. Sign-in and SSO occur directly on Zoom.
4. Review source-specific completeness. Partial My Notes rows remain reference-only and are never treated as a complete/exportable inventory; a different fully scanned source may be selected alone.
5. The user selects only complete source(s) and explicitly chooses Download selected transcripts. Recording has a live-verified POST-XHR/Blob contract (`/rest/meeting/transcript/user/download`, `meetingId` + `sortKey`, text/plain response) and strict request-to-row correlation. A user-assisted Edge acceptance run completed both selected sources; per-source terminal results reconciled with downloaded files in the dated Recordings and My Notes folders. Workspace reload recovered terminal totals. Chrome, Stop during an active export, rate-limit/expiry behavior, and broader native-wheel behavior remain untested.
6. Results distinguish saved, unavailable, failed, and remaining items per source; attention-needed states are not success.

## Must-pass criteria

### Privacy, scope, and consent
- Never request or store a Zoom password.
- Scan only accessible signed-in-user source lists; do not imply company-wide access.
- Discovery reads metadata only and never exports transcript content or downloads files.
- Transcript file content is accessed only after explicit user download action. Recording capture requires the verified exact Zoom route/method/ID-placement/response contract and strict request-to-row correlation.
- Explain My Notes means transcript files only, not note text, AI summaries, or other documents.

### Inventory correctness
- Recording pagination finishes only with Zoom's explicit terminal hasNextPage false signal and any authoritative total matches collected rows; no hardcoded live item counts.
- Both source lists are retained separately. An unverified My Notes terminal signal keeps its results explicitly partial and non-exportable; fully scanned sources can proceed without it. Only verified exact shared occurrence identifiers produce reciprocal association badges. Missing links remain uncertain, and exact unique-total availability is stated separately.
- Source availability supports available/unavailable/unknown and is not conflated with cross-source matching.
- Company or source URL changes after review invalidate the inventory before export.
- Custom scroll rail keyboard and pointer behavior is covered; native scrolling through the Recording inventory was verified live. Broader rail acceptance remains scoped to the tested interactions.

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

## Verification status for 2026.10.2 source commit

The repository includes mocked Node/DOM/Chrome tests; run the commands in TESTING.md for current results. User-assisted Edge acceptance completed a full export for both selected sources, with terminal results reconciled against saved files; workspace reload recovered terminal totals. A subsequent metadata scan was stopped while Notes discovery was incomplete. The UI retained the completed-source result, marked the incomplete source stopped, and reported that no export began; existing files remained unchanged. Chrome, Stop during active export, rate-limit/expiry behavior, and broader native-wheel behavior remain untested. This source commit does not publish a store package or GitHub Release. See TESTING.md for the manual checklist.
