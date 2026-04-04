# Tests

Current tests are intentionally lightweight.

## Run

```bash
node tests/logic.test.mjs
```

## What is covered

- title sanitization
- date/time normalization
- filename generation
- collision handling
- transcript row text parsing

## What is not covered

- real DOM interaction
- paginator traversal
- browser download observation
- generated artifact downloads
- end-to-end script execution

These tests are meant as regression protection for the pure logic only.
