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
