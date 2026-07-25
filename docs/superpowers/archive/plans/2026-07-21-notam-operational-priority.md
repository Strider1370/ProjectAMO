# Plan: NOTAM Operational Priority Hints

**Spec:** docs/superpowers/specs/2026-07-21-notam-operational-priority.md
**Goal:** Enrich normalized NOTAMs with conservative operational hints and audit the latest snapshot.

## Global Constraints

- Preserve source times as UTC; preserve D) verbatim only.
- `unclassified` is the safe fallback; no UI behavior changes.
- Use current KML parser and processor; add no dependency.

---

## Task 1: Parse and classify normalized records

**Files:**
- Modify: `backend/src/parsers/notam-parser.js`
- Modify: `backend/src/processors/notam-processor.js`
- Test: `backend/test/notam-parser.test.js`
- Test: `backend/test/notam-processor.test.js`

**Interfaces:**
- Consumes: parsed `qcode`, `summary`, and `scheduleText`.
- Produces: `schedule_text` and `operational` on each stored NOTAM.

- [ ] Extract D) as `scheduleText` without interpreting it.
- [ ] Add one pure `classifyOperationalNotam(qcode, summary)` processor helper returning target, action, priority, and reason.
- [ ] Copy the parsed fields into the stored item shape.
- [ ] Verify — run `node --test backend/test/notam-parser.test.js backend/test/notam-processor.test.js`, expect all pass.

## Task 2: Audit current snapshot

**Files:**
- Create: `backend/scripts/audit-notam-priority.mjs`

**Interfaces:**
- Consumes: `backend/data/notam/latest.json` and `classifyOperationalNotam`.
- Produces: an ignored JSON audit artifact with every record and a console summary.

- [ ] Generate one JSON row per latest-snapshot NOTAM, retaining id, qcode, summary, schedule, classification, and reason.
- [ ] Fail the audit script if a snapshot is empty, an item is omitted, or a priority is invalid.
- [ ] Verify — run the audit script, expect item count to equal the latest snapshot count.

## Task 3: Record the contract

**Files:**
- Modify: `Architecture.md`
- Modify: `docs/superpowers/status/notam-operational-priority.status.md`

- [ ] Document the parser/processor contract as an operational hint, not a safety grade.
- [ ] Record exact audit and test results for handoff.
- [ ] Verify — run `git diff --check`, expect no whitespace errors.
