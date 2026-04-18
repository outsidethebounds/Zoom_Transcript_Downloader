# DECISIONS

## 1. Use a browser-only architecture instead of a localhost helper
- **Session context:** This session
- **Status:** Active
- **Context:** Helper-based designs were brittle and complicated for end users.
- **Decision:** Browser-only workflow plus rename kit.
- **Consequences:**
  - simpler install/runtime
  - no local service to maintain
  - browser/download behavior becomes the core dependency

## 2. Generate rename scripts instead of writing files directly from the extension
- **Session context:** This session
- **Status:** Active
- **Context:** Chrome extensions are bad at deterministic local disk writes and post-download renames.
- **Decision:** Generate manifest JSON + OS-specific script.
- **Consequences:**
  - extra manual step for user
  - simpler extension architecture
  - requires good user instructions

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

## 8. Require a clean download folder
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** Product documentation and workflow assume a clean transcript download folder.
- **Consequences:**
  - simpler, safer rename process
  - user must manage download folder hygiene

## 9. Replace order-based rename matching with exact observed source filenames
- **Session context:** This session, after recognizing order-based matching was unacceptable for GA
- **Status:** Active
- **Context:** Renaming by mtime/order was too brittle.
- **Decision:** Observe actual browser downloads in `background.js`, store exact source filenames in `downloadManifest`, and generate scripts that rename those exact filenames.
- **Consequences:**
  - much safer rename behavior
  - depends on successful Chrome download observation
  - if download observation fails, rename-kit generation should refuse to guess

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

## 12. Keep project private and stable, not Chrome Web Store oriented
- **Session context:** User specified in this session
- **Status:** Active
- **Decision:** Stable private repo, not web-store packaging work.
- **Consequences:**
  - less packaging overhead
  - still acceptable to rely on unpacked-extension workflow

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
