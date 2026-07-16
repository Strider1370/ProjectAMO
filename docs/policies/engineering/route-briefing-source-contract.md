# Route briefing source contract

## Applies when

Adding, changing, or reviewing any data layer that contributes to an en-route briefing: for example SIGMET/AIRMET, volcanic ash, tropical cyclone, convective weather, lightning, model weather, AIP constraints, or NOTAM.

## Does not apply when

Pure map display without route comparison belongs to map and layers. Airport-only or terminal-procedure material does not become en-route data unless the feature explicitly defines that range.

## Re-check trigger

Re-check the policy index when the work also changes source collection, timestamps, map rendering, or a user-facing briefing view.

## Common route contract

- Use the versioned common `routeModel`; do not rebuild distance positions or infer route segments in an individual source layer.
- Use `enRouteRange` for en-route comparison. SID, STAR, IAP, and airport-only areas are excluded unless the feature explicitly defines and labels another range.
- Keep horizontal position, planned-altitude applicability, and time validity as separate findings. A layer may omit an item only when a known comparison proves it does not apply.
- Never convert missing, unresolved, expired, conflicting, or unaligned input into `clear`, `matched`, or a normal candidate. Return the applicable status and reason instead.
- Preserve the source record's identifier, run or publication identity, effective/valid time, and source status in the response provenance. Keep only the fields that the source actually supplies.
- Reuse the existing route-axis, exposure, AIP-constraint, and provenance modules where their interface fits. Put source-specific parsing and interpretation behind its own adapter; do not duplicate route matching in the new layer.

## Safety boundary

- A briefing layer reports comparisons and data state. It must not produce a safety score, route choice, altitude choice, aircraft-performance calculation, ETA/fuel calculation, or recommendation.
- AIP constraints retain their original values and direction-specific series. Do not derive a new usable ceiling, floor, or route-level recommendation from incomplete or conflicting records.

## Verification

- Add or extend one shared-fixture case for the layer's normal result and each material unavailable, unresolved, or conflict state.
- Verify the route ID, source/advisory ID, publication or run identity, and relevant valid/effective time survive to the composed briefing response.
