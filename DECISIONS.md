# DECISIONS

## 1. Use a browser-only architecture instead of a localhost helper
- **Session context:** This session, after helper-based attempts failed to provide a reliable user experience
- **Status:** Active
- **Context:** Earlier iterations used a local helper service to receive transcript content and write files directly. This introduced reliability, auth, path, and UX complexity.
- **Decision:** Remove helper from the main workflow. Trigger downloads in the browser and generate a post-download rename kit instead.
- **Consequences:**
  - simpler runtime architecture
  - no localhost service to manage
  - easier cross-machine portability
  - harder to do perfect file matching because browser downloads are not fully controlled
- **Tradeoff:** Simpler system, weaker guarantees about matching downloaded files to meeting metadata

## 2. Generate rename scripts instead of renaming in-extension
- **Session context:** Same session, after repeated helper issues
- **Status:** Active
- **Context:** Chrome extensions are poor at arbitrary local filesystem writes and deterministic post-download renames.
- **Decision:** Generate:
  - manifest JSON
  - macOS `.sh` or Windows `.ps1` script
- **Consequences:**
  - user has an extra manual step
  - more reliable than pretending the extension can fully control local disk state
  - platform-specific script instructions are required
- **Intentional constraint:** The extension is not trying to be a desktop app

## 3. Use the Zoom page’s own download buttons
- **Session context:** Throughout this session
- **Status:** Active
- **Context:** Intercepting transcript network calls and capturing content directly proved brittle.
- **Decision:** Click the actual Zoom download buttons instead of extracting transcript text through helper/interception paths.
- **Consequences:**
  - fewer auth/session problems
  - relies heavily on Zoom’s UI and DOM remaining stable
  - downloaded files are managed by browser defaults rather than extension-controlled paths

## 4. Keep filename pattern customizable but simple
- **Session context:** Settings UX work in this session
- **Status:** Active
- **Context:** The user wants deterministic filenames, but the system should remain understandable.
- **Decision:** Support only four filename tokens:
  - `{date}`
  - `{time}`
  - `{title}`
  - `{meetingId}`
- **Consequences:**
  - easy to explain and document
  - avoids building a full templating engine
  - may be insufficient for future exotic naming needs

## 5. Auto-detect target OS at install time, but allow override
- **Session context:** Late in this session
- **Status:** Active
- **Context:** The extension needs to generate different script types for macOS vs Windows. Asking every user to set this manually is avoidable.
- **Decision:** Infer OS via `chrome.runtime.getPlatformInfo()` and default settings accordingly.
- **Consequences:**
  - better out-of-box UX
  - still supports manual override in Settings
  - only helps for the machine where the extension is installed; not necessarily where files may later be moved

## 6. Drive the main UX from an injected page panel, not the popup
- **Session context:** Mid-session after multiple UI revisions
- **Status:** Active
- **Context:** The popup was too limited for debugging and page-level actions.
- **Decision:** Use an on-page panel as primary UI. Popup files remain but are no longer the main workflow.
- **Consequences:**
  - better contextual UX on the Zoom page
  - less dependence on Chrome popup lifecycle quirks
  - leaves legacy popup files that may confuse future maintainers
- **Known imperfection chosen deliberately:** popup files were not fully removed during this session

## 7. Keep debug logging available but hidden by default
- **Session context:** Multiple debugging cycles in this session
- **Status:** Active
- **Context:** The workflow is DOM- and timing-sensitive, so debugging is necessary, but constant verbosity is ugly for normal users.
- **Decision:** Hide debug output behind a checkbox.
- **Consequences:**
  - cleaner default UX
  - easier bug reproduction when needed
  - log retention is limited and entirely client-side

## 8. Use order-based rename matching in generated scripts
- **Session context:** Script generation design in this session
- **Status:** Active but risky
- **Context:** After downloads are handed off to the browser, there is no strong guaranteed mapping back to local filenames.
- **Decision:** Rename scripts assume an order relationship between downloaded `.txt` files and tracked manifest entries.
- **Consequences:**
  - workable for controlled folders
  - brittle if folder contains unrelated `.txt` files or if browser download ordering differs from assumptions
- **We know this is imperfect:** yes, and it is one of the biggest design weaknesses remaining

## 9. Scope paginator targeting based on observed Zoom HTML
- **Session context:** Very late in this session after debug logs showed the wrong Next button was clicked
- **Status:** Active
- **Context:** Generic next-button selection clicked Zoom’s unrelated tab scroller (`Scroll to next page of tabs`).
- **Decision:** Target the transcript paginator specifically using the observed button selector:
  - `button.btn-next[aria-label="Next page"]`
- **Consequences:**
  - much more likely to click the right paginator
  - still brittle if Zoom changes class names or attributes
- **Tradeoff:** More precise now, but tightly coupled to today’s DOM

## 10. Remove the helper/help UI clutter aggressively
- **Session context:** User-directed iterative UI simplification in this session
- **Status:** Active
- **Context:** The workflow had accumulated helper-era and debug-era UI complexity.
- **Decision:** Remove Help modal/button and reduce main panel to the essential controls.
- **Consequences:**
  - cleaner panel
  - fewer dead-end controls
  - less discoverability for ad hoc troubleshooting from the UI itself
