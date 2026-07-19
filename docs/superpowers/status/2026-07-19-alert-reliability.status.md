# Alert Baseline and Recurrence Reliability Status

Updated: 2026-07-19 KST
Spec: docs/superpowers/specs/2026-07-19-alert-reliability.md
Plan: docs/superpowers/plans/2026-07-19-alert-reliability.md

## Resume Point

- Last completed: implementation and verification.
- Next: no pending work in this packet. Route geometry persistence remains deliberately deferred until the unfinished alert feature is specified.

## Verified

- A route now stores its last briefing snapshot as JSON as well as its existing hash.
- Evaluation uses the in-memory cache when available and the stored JSON after a server restart.
- Alert insertion and baseline persistence are one database transaction; an insertion failure cannot advance the baseline.
- Historical `dedup_key` rows remain as audit history but no longer permanently suppress a later, recovered-and-worsened condition.
- Focused alert tests, the full backend suite, the full frontend suite, build, dependency-cruiser, and Playwright responsive smoke all pass.

## Open Decisions Resolved Mid-Implementation

- Re-alert after recovery without a new episode table; the existing diff supplies continuous-state suppression.
- Do not include route geometry storage in this repair.
