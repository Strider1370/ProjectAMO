# Spec: NOTAM Time, Confidence, and Context

**Status:** Approved
**Created:** 2026-07-21

## Problem / Goal

Make NOTAM operational hints safer by respecting simple D) schedules, exposing classifier confidence, and separating airport-direct notices from FIR/route notices in the airport panel.

## Requirements

- FR-001: Parse daily D) `HHMM-HHMM` windows (with optional `DLY`) to UTC intervals; preserve unsupported text without guessing.
- FR-002: Store classifier confidence as `high`, `medium`, or `review`.
- FR-003: Airport tabs MUST show airport-direct notices before a separate FIR/route-check group.
- FR-004: A parsed inactive D) window MUST not display as active; unsupported D) MUST disclose time confirmation is needed.

## Non-Goals

- No full ICAO D) grammar parser.
- No official safety grade or automatic go/no-go recommendation.
- No new route matching logic.

## Success Criteria

- SC-001: Daily schedule parsing has UTC-boundary tests.
- SC-002: Airport panel visibly separates direct and FIR notices.
- SC-003: Existing browser and backend tests pass.
