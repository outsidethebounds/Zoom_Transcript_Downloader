# TESTING

## How to run tests

There is still no full automated browser test suite. Current validation is syntax, lightweight logic tests, and manual browser verification.

### Syntax validation
```bash
node --check --input-type=module < background.js
node --check lib/download-suppression.mjs
node --check content.js
node --check page-hook.js
```

### Lightweight automated logic test
```bash
node tests/logic.test.mjs
node tests/download-suppression.test.mjs
node tests/source-logic.test.mjs
node tests/source-plan.test.mjs
node tests/coordinator.test.mjs
node tests/notes-worker.test.mjs
node tests/notes-full-run.test.mjs
node tests/page-hook-worker.test.mjs
```

## Required manual verification after changes

### 1. Extension boot
- Load unpacked extension in Chrome/Edge
- Open Zoom transcript page
- Click extension icon
- Verify panel appears
- Verify transcript count updates after Zoom renders

### 2. Settings
- Open Settings
- Verify filename pattern changes update the example
- Verify include-meeting-ID toggle persists

### 3. Save all
Must verify all of these:
- run starts by trying to return to page 1
- if page-1 reset fails, run aborts clearly
- pagination advances beyond first page when more pages exist
- starting from a later page still results in a full run
- disabled / greyed-out transcript rows are skipped
- rows using both `1 day` and `N days` parse correctly
- running-job notification appears when bulk download starts
- stop button works
- run planning happens before file saves begin
- `Save page` only saves transcripts from the current page

### 4. Direct-save behavior
For each transcript during save-all:
- page hook captures transcript response data
- background cancels the native Zoom download
- extension saves one final `.txt` file with the planned filename
- the configured Downloads subfolder is applied to the saved file path

### 5. Collision behavior
Verify:
- default filename format is `date - time - title`
- collisions append meeting ID when needed
- filenames are stable across a full run

## Current coverage shape
- Automated tests: pure-logic coverage in `tests/logic.test.mjs` and mocked Chrome download lifecycle coverage in `tests/download-suppression.test.mjs`
- Syntax checks: yes
- Manual testing: still required for end-to-end browser behavior

## Known gaps
No automated tests for:
- pagination state detection
- page-1 reset behavior
- live transcript capture from the page hook
- native-download cancellation timing

## Flaky / risky areas
- Zoom paginator DOM may change
- page-number detection may be absent or unreliable
- Zoom may change how transcript downloads are requested
- native-download cancellation may behave differently across browsers/platforms
- the mocked download lifecycle tests cover both direct-save modes, delayed terminal events after finish, duplicate terminal events, extension-owned and out-of-run downloads, interrupted downloads, already-terminal creation, and bounded suppression tracking

## Recommended future tests
If test coverage is added, prioritize:
1. DOM-fixture tests for row parsing and paginator detection
2. direct-save planning tests across duplicate filenames
3. page-hook message handling tests
4. integration test harness for Zoom transcript capture if feasible

## Selected-source validation

Coordinator mocks cover recording-first order, inactive workers, bounded testLimit in both adapters, wrong-run result rejection, sequential completion, MV3 session restoration, Stop, login pause, exact native export filename routing, unrelated manual URLs, and terminal export delivery after suspension. Notes worker fixtures cover current-list scope, incremental pagination/stable-ID deduplication, disabled export controls, and opaque detail routes. Source tests cover source defaults/persistence normalization, source folders, collision names, and independent source summaries.

For a controlled live check, use the production startSourceRun message with testLimit: 1 (not a full collection click). Both adapters enforce the bound. Inspect artifact sizes/counts only; never print transcript bodies, cookies, or signed export URLs. Reset any CDP allowAndName download override before testing filename routing. A bounded first-row smoke test is not full-collection acceptance: it does not exercise repeated SPA returns, replacement scroll elements, or title-only notes. After a My Notes navigation change, separately verify an unrestricted My Notes-only run via Save selected sources; never repeat successful recordings for that check.

### Recovery smoke evidence (2026-10-11)

Headed Chrome for Testing 155, authenticated dedicated profile, production coordinator with testLimit 1. Sequential selected-source run exported one recording (47,649 bytes) and one My Notes transcript (27,687 bytes), complete and nonempty, into their separate dated source folders. Origin stayed on All notes; both inactive workers closed; no active runs remained. Tests inspected artifact metadata only. Earlier recovery probes exposed and corrected a preexisting CDP allowAndName override, missing DownloadItem.tabId, and asynchronous tooltip readiness; preexisting/probe files were retained, not deleted. At that smoke-test stage, full collection and real login/permission expiry remained unverified; mocks covered auth pause/stop/session restoration. The full-collection result below supersedes that gap for the tested account.

Live metadata-only pagination probe confirmed 20 initial rows expand to 32 through Zoom’s existing onLoadMore UI callback. The MAIN-world bridge invokes that callback only at the list bottom; no raw authenticated list API is replayed.

### Full-run regression coverage

`notes-full-run.test.mjs` drives the production adapter without `testLimit` or an injected full-run scope. The 32-item DOM fixture starts with 20 list rows, reloads only 20 rows after each detail visit, replaces the scroll element on every return, includes title-only labels and inaccessible controls, and correlates one terminal native export per planned note. It also checks Stop, current-page scope, unknown permission metadata with an enabled UI control, and actionable rediscovery failure with pending counts. `notes-worker.test.mjs` rejects unrelated global tooltip text as export-control identification.

The original notes-worker suite never called `processNotes`; its discovery-only pagination fixture and one-row production smoke could not expose this repeated-navigation defect. The new full-run fixture fails against f06fd6a (21 saved / 4 skipped rather than the fixture’s 29 eligible saves / 3 genuine skips; seven title-only notes were omitted).

An additional fixture reproduces the user’s exact pre-fix report: `saved: 0, skipped: 24, failed: 1, processed: 0`, with no error cause. With f06fd6a, the final dated note’s detail-readiness timeout increments `failed` and continues without returning to All notes. The export phase then searches the detail page for list rows and falsely skips all 24 planned exports. The corrected adapter stops that path with a stage-specific error and pending count instead. Live pre-fix notes-only reproduction also failed after 15 saves with no cause; the original result alone did not identify which silent navigation branch fired.

Metadata-only live checks confirmed list items contain stable string IDs, titles, string updated times, participants, and an optional meeting object; they do not provide a mandatory permission/recording Boolean. Detail permission state uses Boolean `hasPermission` / `canAccessTranscript` and an object `downloadTranscriptPrivilege`. Eligibility remains the enabled native Download transcript control, not a guessed or default-false permission field. A hidden-worker 100 ms timer took 1,023 ms; route/list/control waits now react to DOM mutations instead of chained readiness polling.

### Corrected unrestricted production evidence (2026-10-11)

Headed Chrome for Testing 155, existing authenticated dedicated profile, **Save selected sources** clicked with only My Notes selected. The coordinator snapshot confirmed `testLimit: null`, `scope: null`, and no recordings in the selected plan. Production discovery included all 32 rows (20 initial plus pagination), including seven title-only rows. Final report: **31 saved, 1 genuinely inaccessible skipped, 0 failed, 31 processed exports, 32 discovered, 31 eligible, 0 pending, not stopped, no user action required**.

Chrome reported exactly 31 complete downloads with 31 unique final file paths, all under `ZoomTranscripts-10112026/My Notes/`, and zero recording downloads in this run. The 31 new nonempty files total 1,634,087 bytes (171–195,787 bytes). Existing collision behavior preserved all 17 earlier diagnostic files; none were overwritten. All 55 recording files remained byte-for-byte unchanged (2,433,527 bytes total). One origin tab remained on All notes; the inactive worker closed, active run count was zero, and no pending export/download session keys remained. Artifact checks used sizes, hashes, timestamps, and counts only—never transcript content or authentication data.

All eight suites, JavaScript/module syntax checks, and `git diff --check` pass. The original seven suites remain unchanged in purpose; the new full-run and frozen-timer cases close the bounded-test coverage gap. Real future login/permission expiry remains environment-dependent; mock regressions exercise pause and Stop.

### Direct-first My Notes acceptance (2026-10-11)

The approved implementation uses the native authenticated app export capability from All notes, rather than a plain-fetch endpoint replay. Numeric webpack module IDs are not baked in; changed factory IDs/export names and regional Docs routing are tested. A cached, validated endpoint-specific wrapper supplies the existing app client's authentication/refresh/cluster behavior. The real response schema is top-level signedUrl/expiresAt; no credentials or signed URL values were printed or stored in extension state.

Authenticated headed Chrome for Testing 155, dedicated existing profile, actual production coordinator with My Notes only, mode all, **no injected scope or testLimit**: **32 discovered, 31 direct saved, 0 fallback saved, 1 HTTP-404 unavailable skipped, 0 failed, 32 API attempts, 31 confirmed eligible, 0 pending**. Network metadata recorded 31 export HTTP-200 responses and one 404. The worker stayed on All notes throughout: **zero detail navigations**. The original list remained on All notes and the worker closed.

The full run created exactly **31 unique, nonempty .txt paths** beneath Downloads/ztd-direct-validation-full-20261011/ZoomTranscripts-10112026/My Notes/: **1,634,087 bytes total**, **171–195,787 bytes** per file, including **seven title-only/unknown-date filenames**. No recording source was selected or rerun. Existing downloads were never deleted or overwritten. The prior recording baseline JSON contains shortened, non-resolvable path strings, so this implementation run does not claim a new full 55-file hash re-verification; the earlier acceptance evidence above is retained, and this run's recording-download count is zero.

A two-note current-list check saved exactly two direct files (27,687 and 32,308 bytes) with the correct planned names/source folder and no detail navigation. The first new direct file is valid UTF-8 and hash-identical to the existing byte-equivalent native/direct proof. A controlled runtime-only capability-unavailable check produced **0 direct / 1 real native fallback save**, with one detail visit, one native export HTTP-200, and return to the list. It did not click Copy link. The fallback file is 27,687 bytes and filename collisions are uniquified.

Stop was exercised through the original panel while the second real export response was held at the browser response boundary: the first file completed, Stop prevented the second file save and next export, the result was **1 direct saved / 1 pending / stopped**, and the original stayed on All notes. Late-response/no-next-save, cancellation during retry waits, and cancellation of an active Chrome download are also covered by deterministic fixtures.

Live testing exposed a real Chrome filename-listener pitfall: bare suggest() reverted extension-initiated downloads to the server's filename despite chrome.downloads.download options. The fix reiterates the exact planned path only for the extension-owned, exact ephemeral source URL; a regression tests that actual schema. Four early diagnostic extension downloads consequently remain under their server filenames in Downloads (preserved, not deleted). Subsequent bounded and full runs used correct source paths, one file per attempt. Native fallback session recovery now persists a SHA-256 URL digest rather than the signed URL; redirected initial-URL correlation and unrelated manual URLs are tested.

All **nine** suites (the eight existing suites plus notes-direct.test.mjs), classic/module JavaScript syntax checks, manifest JSON parsing, and git diff --check pass. Tests cover 401 Action needed, 403/404/no-transcript handling, hard login navigation preserving acknowledged counters, bounded 429 Retry-After seconds/date/long waits, one signed-URL refresh, changed app builds, missing list IDs, exact download ownership/dedupe, and late Stop. Independent same-role read-only QA found no confirmed blocker; its repeated-discovery concern was addressed with capability caching and its live-verification concerns were exercised. Real account expiry, regional account login, and Zoom rate limiting were not deliberately induced. A future non-anchor native export mechanism safely stops on uncorrelated download rather than attributing a manual file.

An LLM-provider rate-limit interruption paused engineering after the checkpoint; recovery reconciled an idle source coordinator and terminal downloads before continuing. It was not a user cancellation and no Gateway restart/configuration change was needed.
