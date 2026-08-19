# DECISIONS

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
- **Session context:** Release `2026.08`
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
- **Decision:** `Save all available` must attempt to return to page 1 before downloading.
- **Consequences:**
  - deterministic runs
  - if reset fails, run must abort

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

## 10. Keep debug mode, but behind a toggle
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** Keep debug logging available but hidden by default.
- **Consequences:**
  - cleaner UX
  - still debuggable when Zoom DOM changes

## 11. Optimize for simplicity in user UX, allow complexity internally
- **Session context:** User explicitly approved this in session
- **Status:** Active
- **Decision:** Internal implementation can get more sophisticated if needed, as long as user workflow stays simple.
- **Consequences:**
  - code may become more complex
  - UI/workflow should remain constrained and clear

## 12. Support both direct-link Web Store install and manual install
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** Treat the direct Chrome Web Store listing as the recommended install path, while keeping manual Load unpacked installation fully documented for development, testing, and fallback use.
- **Consequences:**
  - end-user docs should present the Web Store first
  - manual install remains part of the supported workflow

## 13. Treat unavailable transcript rows as first-class UI state
- **Session context:** Release hardening / bug-fix pass
- **Status:** Active
- **Decision:** Count greyed-out transcript rows separately and tell the user when rows are unavailable instead of pretending the page has fewer rows.
- **Consequences:**
  - clearer user expectations during save-all runs
  - less confusion when some meetings have no transcript available

## 14. Accept both `1 day` and `N days` in row parsing
- **Session context:** Real-world pagination bug fix on live Zoom data
- **Status:** Active
- **Decision:** Row parser must accept both singular and plural age text from Zoom transcript listings.
- **Consequences:**
  - avoids dropping last-page rows that say `1 day`
  - protected by the local logic regression test

## 15. Show lightweight in-page job notifications for save-all runs
- **Session context:** UX polish pass
- **Status:** Active
- **Decision:** Show a visible running-job message/toast when bulk download begins and a completion/stop notification afterward.
- **Consequences:**
  - users get immediate feedback that the job is active
  - slightly more UI state to maintain
