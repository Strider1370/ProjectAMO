# Common Operational Data Contract Status

Updated: 2026-07-19 23:05 KST
Spec: `docs/superpowers/specs/2026-07-19-common-operational-data-contract.md`
Plan: `docs/superpowers/plans/2026-07-19-common-operational-data-contract-implementation.md`

## Resume Point

- Last completed: approved spec, required policies/Architecture, current producer→store→API→frontend paths, all 36 active + 1 suspended family, 15 internal names, pilot order, and phased plan were reviewed. No implementation code was changed.
- Next: obtain user approval for implementation segment A. After approval, begin Task 1 only; segment B requires a new approval after G0 evidence.

## Verified

- Existing graph was queried first, then actual code and tests were inspected because the graph did not expose enough family-level storage relationships.
- Plan contains all 36 active families, `weather.flight_category_overlay`, all 15 internal names, `model.kim_surface_wind` removal, and the explicit absence of `weather.ground_overview`.
- FR-001–FR-048 (including FR-012A) and SC-001–SC-013 (including SC-007A) are mapped to tasks and gates.
- Independent reviews checked pilot risk, remaining family paths, provider/retention/instance requirements, rollback seams, and plan compliance. Final review omissions were added for route-exposure batch, NOTAM briefing/alert consumers, dev scenario direct store access, and notification Playwright coverage.
- A stale-review claim about missing FR-012A/FR-048/SC-007A/SC-013 was rejected against the current approved spec; FR-044 still authorizes the alert occurrence/feed/delivery migration.
- Existing user-modified and untracked files were left untouched. This packet added only this plan and status file.

## Unverified / Skipped

- No implementation, migration, generated JSON Schema, runtime API, full test suite, structural check, or Playwright contract was run because this session was planning-only.
- `npx knip` is expected to retain the repository's known baseline noise until a project entry configuration exists; implementation gates judge newly introduced paths, not the existing count.

## Open Decisions Resolved Mid-Implementation

- First canary: `imagery.radar_tiles`; first general JSON pilot: `aviation.notam`; then `weather.metar`, `weather.taf`, and `model.kim`.
- Global latest storage is tag-sharded with per-tag queues, not one contended file. `traffic.callsign_route` keeps its 6-hour memory hot path; only provider misses are stored, with 6-hour/1,000-instance pruning and no user/session identifiers.
- Approval is split into segment A Tasks 1–3, segment B Tasks 4–8, and segment C Tasks 9–15; no workday estimate is used.
- Current request-bound briefing families are `ephemeral`: validated envelopes only, with no storage, latest index, common GET, or route-coordinate accumulation.
- `alert.triggered` is the final principal/SQLite wave after briefing source envelopes exist; occurrence, notification feed, and delivery state are separated without changing route geometry or recurrence behavior.
