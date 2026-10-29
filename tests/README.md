# Tests

The repository currently has 99 mocked Node/DOM/Chrome tests. They cover simulated logic and lifecycle behavior, not authenticated browser acceptance.

Run all lightweight suites:


```bash
for test in tests/*.test.mjs; do node "$test" || exit; done
```

Coverage includes recording filename/row logic, source selection and plans, sequential coordinator/MV3 recovery, exact download correlation and suppression, My Notes metadata discovery, full My Notes SPA fallback and direct-first export, and same-run duplicate avoidance from successful nonempty Recording saves. The duplicate-avoidance paths are mocked; no live 2026.11 export has verified the feature end to end.

The full-run fixture uses 32 synthetic notes and 20 initial list rows, replaces the scroll root on every detail return, and calls the production adapter without a full-run scope or test limit. It checks title-only rows, genuine missing/disabled transcript controls, wrong export IDs, one export per save, Stop before/after a save and during a late direct response, login pause, actionable navigation failure, pending counts, and event readiness with frozen polling timers.

These are mocked DOM/Chrome tests, not an authenticated browser suite. Full production acceptance and metadata-only artifact verification are recorded in ../TESTING.md.

The direct capability suite uses changed webpack IDs/export names and a real-shaped native wrapper with regional client routing. It verifies HTTP auth/permission/unsupported/rate-limit classes, Retry-After seconds/date/long waits, response schema validation, capability caching, and late cancellation. Worker/coordinator regressions cover no-detail direct export, bounded signed-URL refresh, same-ID download replay, explicit Chrome filename suggestions, no native arm in direct mode, idless UI fallback, and private digest correlation after suspension. Live external login/rate limits remain simulated, not induced against the account.
