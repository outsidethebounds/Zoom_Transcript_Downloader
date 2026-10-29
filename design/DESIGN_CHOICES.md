# Design choices

Last updated: 2026-10-28

## Current product workflow (2026.11)

The extension-owned guided workspace is the primary entry. It opens on first install and from the toolbar. The user supplies a Zoom subdomain and source choices, scans both supported lists for metadata, reviews the complete inventory, then explicitly starts the selected-source download. The legacy injected panel remains advanced/manual fallback and its old Save all / Save page workflow is not the current primary workflow.

### Discovery and consent

Discovery reads accessible Zoom list metadata and does not export transcript bodies or download files. User authentication stays on Zoom/SSO; the extension never prompts for or stores passwords. The account boundary is the signed-in user's accessible data, not an organization-wide crawl. Transcript content access begins only after explicit user download action.

### Association and unknown state

Recording and My Notes remain separate source lists and folders. Only an exact verified shared occurrence identifier earns reciprocal cross-source badges; titles and numeric meeting IDs alone do not. Missing association data remains uncertain, so the exact unique meeting total can be unknown. Export availability is a separate state and may be unknown until save.

With both sources selected, the default-on duplicate-avoidance setting processes Recording first and skips a My Notes row only when its trimmed, nonempty occurrence ID matches an ID from a successful nonempty Recording save in the current run. Per-item Recording unavailability/failure leaves that My Notes row eligible as fallback. A sign-in or browser prompt can pause before fallback. The option can be turned off to save both copies. Missing IDs may overlap; no title, date, or transcript-content matching is performed. Review's estimate is conditional and not a live export guarantee. The feature has mocked test coverage and a live metadata/UI check, but no live 2026.11 export acceptance yet.

### Export and safe outcomes

Selected sources process sequentially in inactive Zoom tabs. Files go to a dated root with separate Recordings and My Notes folders under browser Downloads. Completed files are preserved, conflicts uniquified, and Stop prevents later exports. A current operation may finish or be safely canceled. Results must distinguish saved, unavailable, failed, and pending. Do not promise automatic resume or per-asset selection.

My Notes uses Zoom's authenticated app export capability where available and retains the enabled Download transcript UI fallback when the capability is unavailable. Per-item unavailability/failure in the Recording source is a separate case: that matching My Notes row remains eligible. Authentication or browser prompts require user action and may pause the sequential batch. It exports transcript files, not note text, AI summaries, or other documents. Avoid logging credentials, transcript contents, or signed URLs.

### Guided workspace presentation

The company field is hidden after Connect. Source choices and settings disclosures remain available on Review and collapse on stage changes; settings are hidden on Results. Saved setting changes apply to the next run, and Discard restores saved values. Responsive workspace content is distinct from the operating system window size. Inventory lists use an accessible custom scroll rail with keyboard and pointer interactions; native scrolling was verified for the Recording inventory, while broader rail behavior remains untested. Readiness waits are bounded to two minutes with explicit attention-needed outcomes. A three-minute export-count stall message is a read-only warning and does not stop or restart a run.

### Settings and outputs

Filename pattern defaults to {date} - {time} - {title}; supported fields include date, time, title, meeting ID. Optional destination is a subfolder under browser Downloads, not an arbitrary absolute path. Date-stamped root uses ZoomTranscripts-MMDDYYYY. My Notes first parses a strict ISO date/time suffix in the accessible row label, then falls back to the Date created cell and accepts only an exact calendar date and clock time. Relative labels such as “14 hours ago” fall back to `unknown-date` and `unknown-time`.

## Preserved historical decisions

The older in-page recordings panel, its Save all and Save page actions, its two-pass pagination plan, and associated panel screenshots describe the legacy/manual workflow. They remain useful only for that surface and must not override the guided workflow in current end-user instructions. Earlier release label 2026.09 and its recordings-only assumptions are historical, superseded by the 2026.11 guided baseline. Keep the historical record; don't retroactively rewrite it as if the old design was always different.

## Release/version policy

The repository's existing policy requires incrementing manifest version before packaging or store upload and aligning the human-facing version. A docs-only commit is not a store or extension release.
