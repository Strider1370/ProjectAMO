# Plan: Automatic-route altitude comparison latency

**Spec:** `docs/superpowers/specs/2026-07-20-altitude-comparison-latency.md`

## Steps

1. In `altitude-weather-comparison.js`, replace private distance-based searches with matching sample indexes and construct weights once.
2. Return the cross-section from `/api/briefing/altitudes`; pass it through `useRouteBriefing` to the immediately following vertical-profile request, retaining the direct request fallback for all other callers.
3. Extend the existing route-workflow fixture to count cross-section calls and assert none occur in the altitude-comparison flow.
4. Run backend tests, frontend build, dependency-cruiser, the route-workflow contract, then deploy and measure the same production scenario.
