# Task 3 — Registry-backed scheduler registration and concise server logs

## Status

DONE

## Changed

- Added `apiHubCategories` and `cronOptions` to resolved collector registry entries; validation now requires categories and checks active bindings before registration.
- Replaced handwritten cron registration and API Hub routing in `backend/src/index.js` with exported `registerCollectorSchedules()` and registry-backed processor bindings.
- `runWithLock()` records the execution start before skip checks, keeps the same run context through terminal stats calls, and emits sanitized one-line collector logs.
- Added a testable watchdog lifecycle wrapper that starts only after normal registration and returns the stop handle.
- Preserved the existing radar graphics scheduler test seam while sourcing its schedule and categories from the registry.

## TDD evidence

RED: `npm --prefix backend test -- test/collector-scheduler.test.js` failed because `registerCollectorSchedules` was not exported.

GREEN:

```text
npm --prefix backend test -- test/collector-scheduler.test.js test/kim-scheduler.test.js test/collection-quiesce.test.js
20 passed, 0 failed

npm --prefix backend test -- test/collector-registry.test.js test/collector-execution.test.js
11 passed, 0 failed

npm --prefix backend test -- test/radar-graphics-processor.test.js test/collector-scheduler.test.js test/kim-scheduler.test.js test/collection-quiesce.test.js
31 passed, 0 failed
```

`git diff --check` passed. `graphify update .` completed after code changes.

## Residual risk

The task brief's literal `npm --prefix backend test -- backend/test/...` path is invalid because the package test process runs inside `backend/`; the equivalent `test/...` commands above were used. No browser verification applies to this backend-only scheduler change.
