# Project Data Tag Inventory Research Status

Updated: 2026-07-19 18:45 KST
Spec: docs/superpowers/specs/2026-07-19-project-data-tag-inventory-research.md
Plan: docs/superpowers/plans/2026-07-19-project-data-tag-inventory-research.md

## Resume Point

- Last completed: Three parallel audits and the consolidated inventory report are complete.
- Next: this research is superseded by the approved common operational data spec and its implementation plan; use those packet files for implementation.

## Verified

- Existing `graphify-out/graph.json` queried with graph vocabulary terms for data-source and producer-consumer boundaries.
- External inputs, internal storage/derived products, and API/frontend outputs were independently audited with file-and-line evidence.
- `backend/src/store.js` allowed types, all `backend/src/db/schema.sql` tables, and backend data API projections were cross-checked against the inventory.
- UTF-8 integrity and Markdown placeholder checks passed for the consolidated report.
- The report was revised after review: tags use the short `domain.dataset` form; scope, representation, and schema version are separate fields; the route-payload migration risk, alert re-notification risk, and unproduced `ground_overview` path are the first three priorities.

## Unverified / Skipped

- No runtime behavior was changed, so browser and application tests were not required.
- Exact field-level schemas have not been authored; this research identifies the current code locations that act as schemas.

## Open Decisions Resolved Mid-Implementation

- Tags identify semantic data families; schema versions and storage locations remain separate metadata.
- Frontend-only view models remain local contracts and inherit source references instead of becoming global publication tags.
