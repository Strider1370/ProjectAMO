# Task 1A report — registry foundation

Status: DONE_WITH_CONCERNS (Task 1A only; not Task 1 complete).

## Implemented

- Added `backend/src/collector-registry.js`: declared collector metadata, active resolution, and validation.
- Added `backend/src/api-operation-registry.js`: API Hub endpoint labels/matchers, initial external-operation inventory, registry validation, explicit id/URL resolution, and cron-parser expected-call descriptions.
- Moved persisted API Hub endpoint labels to the operation registry and delegated `endpointFor(url)` matching to it.
- Added `cron-parser` dependency.
- Added test-first registry coverage.

## TDD evidence

RED command:

```sh
npm --prefix backend test -- test/collector-registry.test.js test/api-operation-registry.test.js
```

RED result: failed with `ERR_MODULE_NOT_FOUND` for both newly specified registry modules, before implementation.

GREEN/focused regression command:

```sh
npm --prefix backend test -- test/collector-registry.test.js test/api-operation-registry.test.js test/api-hub-usage.test.js test/fetch-api-hub.test.js test/admin-data-health.test.js
```

Result: 30 passing, 0 failing.

Additional verification: `git diff --check` passed and `graphify update .` completed.

## Files changed

- `backend/package.json`, `backend/package-lock.json`
- `backend/src/collector-registry.js`
- `backend/src/api-operation-registry.js`
- `backend/src/api-hub-usage.js`
- `backend/src/lib/fetch-api-hub.js`
- `backend/test/collector-registry.test.js`
- `backend/test/api-operation-registry.test.js`

## Explicitly not implemented (approved Task 1A boundary)

- `requestObservedApi`, operation execution state, API usage/admin exposure, and `request-observability.js`.
- Raw outbound transport migration, removal of the global API Hub fetch monkeypatch, and the AST bypass guard.
- Index scheduler wiring to `COLLECTOR_REGISTRY`, startup binding validation, and Architecture.md changes.
- Full real call-site inventory/migration for every external host; the registry contains the initial known external seams needed for later migration.

## Commit

`68457da6 feat(backend): add collector and API operation registries`

## Residual risks

The registry is a declaration and matching foundation only until the later execution seam routes all physical requests through it. Existing fetch guard behavior is deliberately preserved in this slice, so there is not yet universal external-request observation or per-operation execution state.

## Review-fix round 1/5

Added genuine RED tests for canonical real URL resolution, malformed operation structure, midnight quiet-window scanning, fixed-time/nonuniform cadence labels, current IIAC/NOAA timeout contracts, and radar-graphics enablement. The RED command was `npm --prefix backend test -- test/api-operation-registry.test.js test/collector-registry.test.js`; it failed on missing canonical URLs, incomplete validation, quiet-window handling, the IIAC 19:00 boundary, and graphics enablement.

The registry now supplies canonical URLs for each operation and validates that every canonical request maps to exactly one operation; explicit ids must match the same URL. API Hub calls use configured KMA timeout/retry settings; known direct external operations use their current source timeout. NOAA is split by its actual `/metar`, `/taf`, and `/isigmet` endpoints. IIAC uses `*/10 6-19 * * *`. Contract validation now rejects malformed labels/matchers/canonical URLs, categories, policies/overrides, missing collector references, invalid cron/timezone/quiet structures, and missing conditional labels. Expected-call calculation skips quiet-window cron occurrences and displays fixed time lists/nonuniform schedules faithfully.

GREEN command: `npm --prefix backend test -- test/collector-registry.test.js test/api-operation-registry.test.js test/api-hub-usage.test.js test/fetch-api-hub.test.js test/admin-data-health.test.js` — 34 passing, 0 failing. `git diff --check` passed; `graphify update .` completed.
