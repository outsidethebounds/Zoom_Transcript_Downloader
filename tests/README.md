# Tests

Run all lightweight suites:


```bash
for test in tests/*.test.mjs; do node "$test" || exit; done
```

Coverage includes recording filename/row logic, source selection and plans, sequential coordinator/MV3 recovery, exact download correlation and suppression, My Notes metadata discovery, and full My Notes SPA planning/export.

The full-run fixture uses 32 synthetic notes and 20 initial list rows, replaces the scroll root on every detail return, and calls the production adapter without a full-run scope or test limit. It checks title-only rows, genuine missing/disabled transcript controls, wrong export IDs, one export per save, Stop in both phases, login pause, actionable navigation failure, pending counts, and event readiness with frozen polling timers.

These are mocked DOM/Chrome tests, not an authenticated browser suite. Full production acceptance and metadata-only artifact verification are recorded in ../TESTING.md.
