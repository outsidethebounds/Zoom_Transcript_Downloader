# Changelog

## 2026.11

This version identifies the repository's extension source and printable guides. Updating it does not publish a Chrome Web Store package or GitHub Release.

- Added default-on duplicate avoidance across selected sources. A My Notes transcript is skipped only after a nonempty Recording file for the same exact occurrence ID is confirmed saved. Opt-out downloads both versions; missing IDs remain uncertain. No existing files are removed or deduplicated across runs.
- Added conditional match estimates and separate duplicates-avoided counts to progress and results. Per-item Recording failures leave My Notes eligible; authentication or browser prompts can pause the batch before fallback.
- Recovered missing My Notes filename dates from exact Date created timestamps when the accessible label lacks a supported date. Relative dates are not guessed.
- Stabilized My Notes pagination and metadata collection, Recording row parsing, and worker diagnostics.
- Kept source and download-settings sections collapsed by default, with explicit Save/Discard settings and stage-specific controls.
- Added an informational warning after three minutes without export-count progress. It does not stop or restart an export.
- Updated Markdown, HTML, and PDF guides and technical documentation. Historical illustrations are clearly marked.

Automated logic and lifecycle tests pass, and the duplicate-avoidance setting and Review estimate were checked in a metadata-only Edge scan. Live duplicate-avoidance export, Chrome acceptance, and other open checks remain documented in [TESTING.md](./TESTING.md).
