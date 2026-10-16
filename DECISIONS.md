# Decisions

## Current workflow decisions (2026.10.2; authoritative for current product)

- The extension-owned guided workspace is the primary user entry; the older injected panel and its Save all / Save page actions are legacy/advanced fallback.
- Discovery scans accessible metadata from both Recording transcripts and My Notes; it does not export transcript bodies. Only fully scanned selected sources can be exported; incomplete sources must remain unselected.
- Authentication stays on Zoom/SSO; no extension password prompt or storage. Scope is the signed-in user's accessible items, not company-wide.
- Exact verified shared occurrence identifiers alone produce reciprocal cross-source badges. Missing association and unknown availability remain distinct; do not invent a unique count.
- Stop prevents subsequent exports; completed files are preserved. Do not promise automatic resume or asset-level selection.
- Files use a dated root with source-separated folders under Downloads. My Notes means transcript files only.
- The repository uses mocked Node tests for logic and lifecycle coverage. User-assisted Edge acceptance completed a full export for both selected sources and reconciled terminal results with saved files; workspace reload recovered terminal totals. A follow-up metadata Stop check showed completed and incomplete sources accurately, without starting an export. Chrome, Stop during active export, rate-limit/expiry behavior, and broader native-wheel behavior remain untested.

The numbered decisions below are preserved historical records. Where they describe the injected recordings panel, Save all, Save page, or 2026.09 behavior, they apply only to that older surface and are superseded for the primary guided workflow by the decisions above.

---

## 1. Use a browser-only architecture instead of a localhost helper
- **Session context:** This session
- **Status:** Active
- **Context:** Helper-based designs were brittle and complicated for end users.
- **Decision:** Browser-only workflow with direct-save downloads inside the extension.
- **Consequences:**
  - simpler install/runtime
  - no local service to maintain
  - browser/download behavior becomes the core dependency
  - background download handling is now part of the critical path

## 2. Save transcript content directly with final filenames
- **Session context:** Release `2026.09`
- **Status:** Active
- **Context:** Rename-script workflows left stale artifacts, extra user steps, and confusing filename behavior.
- **Decision:** Capture transcript content from the Zoom page and save extension-owned files directly with the final filename.
- **Consequences:**
  - no post-run rename step
  - fewer stale repo artifacts
  - more dependence on the page hook and native-download suppression timing

## 3. Use Zoom’s own download buttons
- **Session context:** This session
- **Status:** Active
- **Decision:** Trigger actual Zoom downloads rather than fully scraping transcript content.
- **Consequences:**
  - fewer auth/session problems
  - more coupling to Zoom UI

## 4. Default filename pattern is `date - time - title`
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** Default filename pattern is `{date} - {time} - {title}`
- **Consequences:**
  - simpler user-facing default
  - meeting ID becomes optional, not default

## 5. Meeting ID is optional by default, but used for collisions
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** Do not include meeting ID by default, but append it automatically when collisions occur.
- **Consequences:**
  - cleaner filenames in normal cases
  - safer uniqueness when collisions happen

## 6. Save-all must always reset to page 1
- **Session context:** User specified in this session
- **Status:** Active
- **Context:** Starting from page 3 and downloading from there would create partial/inaccurate runs.
- **Decision:** `Save all` must attempt to return to page 1 before downloading.
- **Consequences:**
  - deterministic runs
  - if reset fails, run must abort

## 9. Keep a separate current-page action alongside the batch action
- **Session context:** UX polish pass
- **Status:** Active
- **Decision:** Expose both `Save all` for the full cross-page batch and `Save page` for the current page only.
- **Consequences:**
  - user intent is clearer
  - docs must explain the difference between the two actions

## 7. Abort instead of proceeding if page-1 reset fails
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** If page-1 reset fails, abort with a clear error instead of continuing from current page.
- **Consequences:**
  - fewer silent partial failures
  - more conservative behavior

## 8. Recommend a dedicated transcript folder, but do not require one
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** Recommend a dedicated transcript folder for organization, but do not require an empty or isolated folder.
- **Consequences:**
  - docs can encourage tidy organization without overstating a technical requirement
  - user workflow stays simple and honest
