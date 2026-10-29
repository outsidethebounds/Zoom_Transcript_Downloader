# Roadmap and research backlog

## Current 2026.11 acceptance status

The guided workflow and default-on, same-run exact-ID duplicate avoidance are implemented and covered by mocked tests. Live Edge metadata/UI checks verified the setting and conditional Review estimate. A live export with duplicate avoidance enabled has not yet been accepted; the 2026-10-16 full export predates that feature. Keep this acceptance item open until verified. Duplicate avoidance does not use prior-run state or infer matches from titles, dates, or transcript content; missing IDs may overlap.

## Possible future: authenticated-context, tabless export (NOT implemented)

Investigate whether Recording Transcripts and My Notes can both be exported without extension-created worker tabs, using authenticated extension context. This is an investigation item only; there is no feasibility verdict, estimate, implementation, or supported tabless path. Current downloads still depend on Zoom source-page workers.

Research questions before any design decision:

- Which authenticated requests are available to an extension context for each source, and do they depend on page-specific tokens, origin/session state, CSRF values, or tab context?
- How does MV3 service-worker suspension affect long batches, progress, cancellation, and recovery after browser/service-worker restart?
- Which interfaces are documented versus inferred from Zoom's current app behavior, and how fragile are undocumented endpoints/schema assumptions?
- Would a hybrid approach actually reduce risk, or merely move authentication and lifecycle coupling?

Bounded acceptance, only after a separate explicit implementation approval: one authorized Recording transcript and one authorized My Notes transcript; retrieval success and correct files; login expiry; interrupted request; and browser/service-worker restart during a batch. Confirm no transcript export begins during discovery and no user-created/reused tab is closed. Use a dedicated test account/profile and never record transcript bodies, credentials, cookies, or signed URLs in test evidence.

## Current source-tab behavior

The guided workspace may reuse source-list tabs for metadata review/retry; they remain open because the Recording tab is also the export origin and retry target. The coordinator creates inactive worker tabs for actual source exports. It retains a worker when sign-in or other user action is needed, and only closes an extension-created worker after a terminal result if the tab is still on that run's Zoom source URL. If the user navigates that worker tab elsewhere, cleanup leaves it open. User-created and reused tabs are never cleanup targets. Closing the workspace does not turn guided source tabs back into legacy-panel pages.
