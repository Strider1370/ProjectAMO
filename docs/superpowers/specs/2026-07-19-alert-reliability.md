# Spec: Alert Baseline and Recurrence Reliability

**Status:** Approved
**Created:** 2026-07-19

## Problem / Goal

The alert scheduler keeps its previous briefing snapshot only in process memory, so its first evaluation after a restart silently establishes a new baseline. It also treats any past row with the same deduplication key as permanently sent, preventing a recovered condition from alerting again when it recurs. Preserve alert history while making restart and recurrence behavior reliable.

## Requirements

- **FR-001:** Each alert-enabled route must persist the last successfully evaluated briefing snapshot as JSON together with its existing snapshot hash.
- **FR-002:** An evaluation must use the in-memory snapshot when available and otherwise restore the persisted snapshot. A legacy route without a persisted snapshot must establish one baseline without sending an alert.
- **FR-003:** A condition that remains bad across consecutive evaluations must not create repeated alerts.
- **FR-004:** A condition that returns to normal and later becomes bad again must create a new alert, even when its historical `dedup_key` matches a prior alert.
- **FR-005:** Alert-row insertion and saved-snapshot update must commit atomically. A failed write must leave neither a new alert nor a newer snapshot behind.
- **FR-006:** Existing alert history, including `dedup_key`, read state, and delivery state, must be preserved. The permanent historical deduplication lookup and its unused index must be removed.

## Non-Goals (out of scope)

- User-facing recovery notifications.
- Web Push delivery, re-notification intervals, or multi-process scheduler locking.
- Splitting alert occurrence, feed, and delivery tables; that remains part of the common operational-data contract work.
- Route geometry storage or alert-registration UX changes.

## Success Criteria

- **SC-001:** A simulated restart with a persisted baseline detects the next deterioration and records one alert.
- **SC-002:** Normal → bad → unchanged creates one alert; normal → bad → normal → bad creates two alerts.
- **SC-003:** A legacy route with no JSON baseline establishes a no-alert baseline once.
- **SC-004:** A forced database failure rolls back both alert insertion and snapshot persistence.
- **SC-005:** Existing scheduler, sender, and notification tests remain green.

## Alternatives Considered

| Option | Trade-off | Why not chosen |
|---|---|---|
| Keep permanent `dedup_key` lookup | Smallest code change | It suppresses legitimate recurrence forever. |
| New alert-episode tables | More explicit lifecycle | The diff already prevents duplicate alerts while a condition remains bad; an episode model is unnecessary for this repair. |
| Reconstruct prior snapshot from hash | No new column | A hash cannot be compared by the diff engine. |

## Open Questions

- None.
