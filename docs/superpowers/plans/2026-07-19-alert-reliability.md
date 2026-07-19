# Plan: Alert Baseline and Recurrence Reliability

**Spec:** docs/superpowers/specs/2026-07-19-alert-reliability.md
**Goal:** Persist the scheduler baseline and re-arm an alert after recovery without changing alert delivery behavior.

## Global Constraints

- Reuse SQLite, better-sqlite3 transactions, and existing test tooling; add no dependency.
- Preserve existing alert rows and user-visible notification behavior.
- Do not add route geometry work.

---

## Task 1: Persist the alert baseline

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.js`
- Modify: `backend/test/db.test.js`

**Interfaces:**
- Produces: nullable `routes.last_briefing_snapshot_json` available to the scheduler.

- [ ] Add nullable `last_briefing_snapshot_json TEXT` to new and existing `routes` tables through the existing `ensureColumns` migration path.
- [ ] Add a DB regression assertion that a fresh database exposes the column.
- [ ] Verify — run `npm --prefix backend test -- db.test.js`, expect passing tests.

## Task 2: Make scheduler evaluation restart-safe and recurrence-safe

**Files:**
- Modify: `backend/src/alerts/scheduler.js`
- Modify: `backend/src/db/schema.sql`

**Interfaces:**
- Consumes: `routes.last_briefing_snapshot_json` from Task 1.
- Produces: atomic alert rows plus updated persisted baseline.

- [ ] Read the previous snapshot from the cache first, then from the route JSON column; malformed or absent legacy JSON establishes a baseline.
- [ ] Remove the historical `alreadyFired` gate. Keep `dedup_key` as alert-history data only.
- [ ] Write alert rows and both snapshot fields inside one better-sqlite3 transaction; update the in-memory cache only after commit.
- [ ] Remove the unused `idx_alerts_dedup` index for both new and existing databases.
- [ ] Verify — run `npm --prefix backend test -- alert-scheduler.test.js`, expect passing tests.

## Task 3: Lock the repaired behavior with focused tests

**Files:**
- Modify: `backend/test/alert-scheduler.test.js`

**Interfaces:**
- Consumes: `evaluateFlight`.

- [ ] Cover persisted-baseline restart detection, unchanged-condition suppression, recovery then recurrence, and legacy no-baseline behavior.
- [ ] Cover transactional rollback by injecting a write failure through the database test seam or a controlled failing statement.
- [ ] Verify — run `npm --prefix backend test`, expect all backend tests passing.
