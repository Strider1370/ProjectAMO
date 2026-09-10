# Domestic En-route NAVDATA Consolidation Plan

## Goal

Replace the duplicated domestic en-route runtime JSON files with one AIP-derived `frontend/public/data/navdata/enroute.json`, without changing airport, procedure, or overseas data behavior.

## Tasks

1. Build `enroute.json` from the validated `backend/data/aip/current` snapshot and its navigation-aid data. Preserve the full reviewed segment record, publication, effective time, combined points, and only sequence-compatible direction metadata.
2. Derive the route graph in `routePlanner` from the loaded segments. Keep the existing route-confirmation inputs and result shape unchanged.
3. Generate `frontend/public/data/airways.geojson` from the same active segments.
4. Run the generator after a successful AIP activation and bootstrap the current active publication once.
5. Verify point/segment/route counts, direction metadata carry-over, representative path resolution, briefing AIP publication matching, frontend build, and the browser route-confirmation flow.
6. Remove obsolete domestic runtime route files and their legacy generator path only after all consumers use `enroute.json`.

## Non-goals

- No airport, SID, STAR, IAP, or overseas NAVDATA migration.
- No direction authorization inferred from track values.
- No new NAVDATA directory hierarchy, product API, or stored route-graph index.
