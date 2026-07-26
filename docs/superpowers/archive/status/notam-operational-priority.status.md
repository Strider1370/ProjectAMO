# NOTAM Operational Priority Status

Updated: 2026-07-21 16:45 KST
Spec: docs/superpowers/specs/2026-07-21-notam-operational-priority.md
Plan: docs/superpowers/plans/2026-07-21-notam-operational-priority.md

## Resume Point

- Last completed: Tasks 1–3 — parser, classifier, full latest-snapshot audit, and architecture contract completed.
- Next: User decision on whether the priority hint should drive NOTAM panel ordering or highlighting.

## Verified

- Latest snapshot has 454 Korean NOTAM items and retains Q-code, B)/C), summary, raw text, altitude, and geometry.
- Focused parser/processor tests: 8 pass, 0 fail.
- `node backend/scripts/audit-notam-priority.mjs`: 454/454 classified — 22 critical, 411 warning, 21 info, 0 unclassified.
- Critical is limited to direct airport-operation effects; nationwide airspace items stay warning until route, altitude, and time relevance are known.
- `npm test --prefix backend`: 378 pass, 0 fail.

## Open Decisions Resolved Mid-Implementation

- Priority is an operational hint (`critical`, `warning`, `info`, `unclassified`), not an official safety grade.
- D) is preserved but not interpreted in this phase.
