# Spec: NOTAM Operational Priority Hints

**Status:** Approved
**Created:** 2026-07-21

## Problem / Goal

Airport NOTAMs are currently grouped only by broad Q-code category and sorted by B)/C) time. A runway closure can therefore sit beside or below a reference notice. Add a conservative, explainable operational-priority hint from the collected NOTAM fields, then audit every item in the current Korean NOTAM snapshot.

## Requirements

- FR-001: Preserve D) schedule text from the KML record without changing the raw NOTAM text.
- FR-002: Derive a structured impact target and action from Q-code and E) text: runway, taxiway, approach/procedure, navigation aid, lighting, stand, airspace, obstacle, communication, information, or unknown; and closure, unavailable, restricted, work, degraded, information, or unknown.
- FR-003: Derive only four priority hints: `critical`, `warning`, `info`, and `unclassified`. `unclassified` must be used whenever the parser lacks reliable evidence.
- FR-004: Do not calculate an actual active/inactive state from D) in this change; D) formats vary and must remain visible for later schedule parsing.
- FR-005: Produce a complete audit artifact for every item in the latest saved Korean NOTAM snapshot, including source identifiers, extracted fields, priority hint, and reason.
- FR-006: Add focused regression tests for D) capture and representative priority rules.

## Non-Goals

- No UI color, ordering, or deployment change.
- No official safety classification or go/no-go recommendation.
- No interpretation of D) recurring schedules beyond preserving the source text.
- No external data source or dependency.

## Success Criteria

- SC-001: Each normalized NOTAM exposes `schedule_text` and `operational` fields.
- SC-002: The latest snapshot can be audited end-to-end with no record dropped by the new classifier.
- SC-003: Active-time assumptions remain B)/C)-only until D) parsing is separately validated.

## Open Questions

- Whether the hint should later drive the airport-panel display remains a separate user approval.
