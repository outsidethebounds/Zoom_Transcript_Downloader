# RELEASE CRITERIA

## Purpose

This document defines what must be true before treating this private repo as a stable general-availability-quality release for its intended audience.

## Product target

### Audience
- non-technical public users

### Distribution
- private repo
- stable enough for repeated real-world use
- distributed either through the direct Chrome Web Store listing or manual unpacked installation

### Supported environments
- Chrome on macOS
- Chrome on Windows
- Edge on Windows
- `zoom.us` subdomain variants
- current stable browser versions only

## Accepted workflow

The accepted user workflow is:
1. install the extension from the Chrome Web Store link or by manual unpacked install
2. open Zoom transcript page
3. click **Save all**
4. wait for downloads to finish
5. confirm the transcript files were saved with the expected names in the chosen Downloads subfolder

This workflow is acceptable as long as the instructions remain clear and accurate.

## Must-pass release criteria

### A. All-pages download reliability
The extension must:
- open correctly on the Zoom transcript page
- detect downloadable rows accurately
- exclude rows whose download button is disabled/unavailable
- reset to page 1 before `Save all`
- abort clearly if page-1 reset fails
- traverse all available transcript pages
- not loop indefinitely across pages
- support starting from a non-first page without producing a partial run

### B. Direct-save and filename reliability
The extension must:
- save one final `.txt` file per transcript directly from the extension workflow
- suppress or clean up duplicate native Zoom downloads during bulk saves
- use default filename format:
  - `date - time - title`
- apply the configured filename pattern to final saved files
- support saving into a user-configured Downloads subfolder
- append meeting ID on collisions
- support optional meeting ID inclusion in every filename

### C. End-user usability
The extension must:
- default to collapsed panel state
- keep debug mode hidden behind a toggle
- provide a visible running-job notification during bulk download
- provide Settings, Help & About, expand/collapse, and close affordances from the panel footer
- clearly communicate the chosen save location and filename pattern

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
- [x] running-job notification appears when save-all starts
- [x] Help & About button opens the in-page Help & About window
- [x] settings save correctly

### Save-all validation
- [x] starting on page 1 works
- [x] starting on page 2+ resets correctly and still completes full run
- [x] multi-page download goes past 15 items
- [x] stop button works during run
- [x] planned filenames stay stable across the full batch

### Direct-save validation
- [x] exactly one final transcript file is kept per row
- [x] final output matches expected filenames
- [x] configured filename pattern is applied to saved files
- [x] configured Downloads subfolder is applied to saved files
- [x] collision handling appends meeting ID when needed

## Known acceptable limitations at release time
These are acceptable for now if the core workflow is stable:
- manual unpacked install remains necessary for development and some fallback installs
- `content.js` remains large and not fully refactored
- automated test coverage may remain basic/lightweight

## Not acceptable at release time
These are blockers:
- stopping after page 1 during a normal multi-page run
- saving duplicate transcript files for one row
- silently saving the wrong final filename
- requiring hidden/manual debugging knowledge for normal use
- docs that contradict actual workflow
