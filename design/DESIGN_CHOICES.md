# Design choices

Last updated: 2026-10-12

## Current product workflow (2026.10)

The extension-owned guided workspace is the primary entry. It opens on first install and from the toolbar. The user supplies a Zoom subdomain and source choices, scans both supported lists for metadata, reviews the complete inventory, then explicitly starts the selected-source download. The legacy injected panel remains advanced/manual fallback and its old Save all / Save page workflow is not the current primary workflow.

### Discovery and consent

Discovery reads accessible Zoom list metadata and does not export transcript bodies or download files. User authentication stays on Zoom/SSO; the extension never prompts for or stores passwords. The account boundary is the signed-in user's accessible data, not an organization-wide crawl. Transcript content access begins only after explicit user download action.

### Association and unknown state

Recording and My Notes remain separate source lists and folders. Only an exact verified shared occurrence identifier earns reciprocal cross-source badges; titles and numeric meeting IDs alone do not. Missing association data remains uncertain, so the exact unique meeting total can be unknown. Export availability is a separate state and may be unknown until save.

### Export and safe outcomes

Selected sources process sequentially in inactive Zoom tabs. Files go to a dated root with separate Recordings and My Notes folders under browser Downloads. Completed files are preserved, conflicts uniquified, and Stop prevents later exports. A current operation may finish or be safely canceled. Results must distinguish saved, unavailable, failed, and pending. Do not promise automatic resume or per-asset selection.

My Notes uses Zoom's authenticated app export capability where available and retains the enabled Download transcript UI fallback for supported capability changes. It exports transcript files, not note text, AI summaries, or other documents. Avoid logging credentials, transcript contents, or signed URLs.

### Guided workspace presentation

Connect/setup fields are hidden on review/results. Responsive workspace content is distinct from the operating system window size. Inventory lists use an accessible custom scroll rail with keyboard and pointer interactions; native-wheel behavior still requires acceptance verification. Readiness waits are bounded to two minutes with explicit attention-needed outcomes.

### Settings and outputs

Filename pattern defaults to {date} - {time} - {title}; supported fields include date, time, title, meeting ID. Optional destination is a subfolder under browser Downloads, not an arbitrary absolute path. Date-stamped root uses ZoomTranscripts-MMDDYYYY.

## Preserved historical decisions

The older in-page recordings panel, its Save all and Save page actions, its two-pass pagination plan, and associated panel screenshots describe the legacy/manual workflow. They remain useful only for that surface and must not override the guided workflow in current end-user instructions. Earlier release label 2026.09 and its recordings-only assumptions are historical, superseded by the 2026.10 guided baseline. Keep the historical record; don't retroactively rewrite it as if the old design was always different.

## Release/version policy

The repository's existing policy requires incrementing manifest version before packaging or store upload and aligning the human-facing version. A docs-only commit is not a store or extension release.
