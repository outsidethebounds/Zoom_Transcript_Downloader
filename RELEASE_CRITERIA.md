# RELEASE CRITERIA

## Purpose

This document defines what must be true before treating this private repo as a stable general-availability-quality release for its intended audience.

## Product target

### Audience
- non-technical public users

### Distribution
- private repo
- stable enough for repeated real-world use
- not intended for Chrome Web Store packaging right now

### Supported environments
- Chrome on macOS
- Chrome on Windows
- Edge on Windows
- `zoom.us` subdomain variants
- current stable browser versions only

## Accepted workflow

The accepted user workflow is:
1. load unpacked extension
2. open Zoom transcript page
3. click **Save all available**
4. wait for downloads to finish
5. click **Generate rename kit**
6. run generated script in a clean download folder

This workflow is acceptable as long as the instructions remain clear and accurate.

## Must-pass release criteria

### A. All-pages download reliability
The extension must:
- open correctly on the Zoom transcript page
- detect downloadable rows accurately
- exclude rows whose download button is disabled/unavailable
- reset to page 1 before `Save all available`
- abort clearly if page-1 reset fails
- traverse all available transcript pages
- not loop indefinitely across pages
- support starting from a non-first page without producing a partial run

### B. Rename kit reliability
The extension must:
- generate a manifest JSON and OS-specific script after a successful run
- use observed browser download filenames rather than raw mtime ordering
- fail closed if source-file matching is unreliable
- use default filename format:
  - `date - time - title`
- append meeting ID on collisions
- support optional meeting ID inclusion in every filename

### C. End-user usability
The extension must:
- default to collapsed panel state
- default target OS based on install platform
- keep debug mode hidden behind a toggle
- provide clear script execution instructions for macOS and Windows
- clearly communicate the clean-folder requirement

### D. Documentation quality
The repo must contain:
- end-user instructions that match the actual workflow
- maintainer handoff docs reflecting current architecture
- testing guidance that matches actual verification expectations
- release criteria that reflect the current intended product shape

## Manual validation checklist

### Browser/runtime validation
- [x] extension loads without stale-runtime issues after install/reload
- [x] panel opens from extension icon
- [x] transcript count looks sane
- [x] disabled transcript rows are skipped
- [x] settings save correctly

### Save-all validation
- [x] starting on page 1 works
- [x] starting on page 2+ resets correctly and still completes full run
- [x] multi-page download goes past 15 items
- [x] stop button works during run
- [x] manifest resets between runs

### Rename-kit validation
- [x] manifest downloads
- [x] script downloads
- [x] macOS script executes successfully
- [x] Windows script executes successfully via PowerShell bypass command
- [x] renamed output matches expected filenames
- [x] collision handling appends meeting ID when needed

## Known acceptable limitations at release time
These are acceptable for now if the core workflow is stable:
- extension still distributed as unpacked extension
- `content.js` remains large and not fully refactored
- legacy files may remain in repo if documented clearly
- automated test coverage may remain basic/lightweight

## Not acceptable at release time
These are blockers:
- stopping after page 1 during a normal multi-page run
- generating a rename kit from incomplete or silently wrong source matching
- silently renaming the wrong files
- requiring hidden/manual debugging knowledge for normal use
- docs that contradict actual workflow
