# PROJECT_BRIEF

## One-page summary

This project is a Chrome extension for the Zoom transcript recordings page. It helps a user bulk-download transcript files and then generate a rename kit so those transcript files can be renamed into deterministic filenames on macOS or Windows.

## Problem being solved

Zoom exposes transcript downloads in a paginated web UI, but does not provide the exact local filenames and batch workflow the user wants.

The project tries to solve:
- bulk transcript downloading across pages
- consistent filename generation
- a repeatable post-download rename flow

## Intended user / workflow

User workflow:
1. open Zoom transcript page
2. click extension icon
3. run `Save all available`
4. wait for browser downloads to trigger
5. run `Generate rename kit`
6. execute the generated rename script in the transcript download folder

Target user:
- technically comfortable
- okay with running an unpacked extension and a script

## Current maturity level

Prototype / working tool with known fragility.

It is usable enough to test and sometimes complete the task, but it is tightly coupled to Zoom’s DOM and has known brittle areas.

## What success looks like

- user can download all transcript pages reliably
- rename kit accurately reflects the latest full run
- generated script executes cleanly on the chosen OS
- future maintenance requires small, localized changes when Zoom changes UI

## Explicit non-goals

- not a polished Chrome Web Store product
- not a desktop app
- not a general-purpose Zoom automation framework
- not direct local filesystem management from inside Chrome
- not robust enterprise-grade browser automation yet
