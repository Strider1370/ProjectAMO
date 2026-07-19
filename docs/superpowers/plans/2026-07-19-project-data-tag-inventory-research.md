# Plan: Project Data Tag Inventory Research

**Spec:** docs/superpowers/specs/2026-07-19-project-data-tag-inventory-research.md
**Goal:** Build a code-evidenced inventory of ProjectAMO datasets and propose minimal tag, schema, and original-source records for each.

## Global Constraints

- Read-only code investigation; do not change runtime behavior.
- A dataset is included only when it crosses a collection, storage, module, API, display, or notification boundary.
- Mark uncertainty explicitly and cite concrete files or generated-data locations.
- Use UTC/epoch as the canonical instant when the current code represents an instant; record source timezone separately.

---

## Task 1: External inputs and original data

**Files:**
- Inspect: `backend/src/api-client.js`
- Inspect: `backend/src/parsers/`
- Inspect: `backend/src/processors/`
- Inspect: `backend/src/notam/`
- Inspect: `backend/src/index.js`
- Inspect: `backend/collect.js`

**Interfaces:**
- Consumes: upstream response shapes and collector configuration
- Produces: evidence-backed raw and normalized dataset inventory

- [ ] Step 1: Enumerate every collector and manually loaded runtime source.
- [ ] Step 2: Trace each source through parser and processor boundaries.
- [ ] Step 3: Record original provider, format, time/space semantics, raw retention, and proposed tag.
- [ ] Step 4: Verify — cross-check processor save calls against scheduler registrations and API routes; expect no unexplained collected store type.

## Task 2: Storage and derived products

**Files:**
- Inspect: `backend/src/store.js`
- Inspect: `backend/src/db/`
- Inspect: `backend/src/briefing/`
- Inspect: `backend/src/alerts/`
- Inspect: `backend/src/terrain/`
- Inspect: `backend/server.js`

**Interfaces:**
- Consumes: raw and normalized dataset inventory from Task 1
- Produces: stored, calculated, briefing, terrain, and alert dataset inventory

- [ ] Step 1: Enumerate snapshot types, database records, files, and caches.
- [ ] Step 2: Trace calculated products to their source datasets.
- [ ] Step 3: Record provenance gaps and proposed tags for reusable derived products.
- [ ] Step 4: Verify — cross-check store reads, DB reads, and response composers; expect every persistent or cross-module product to have a producer and consumer.

## Task 3: APIs, frontend data, and user outputs

**Files:**
- Inspect: `frontend/src/api/`
- Inspect: `frontend/src/app/useWeatherPolling.js`
- Inspect: `frontend/src/features/`
- Inspect: `frontend/src/shared/weather/`
- Inspect: `frontend/public/data/`

**Interfaces:**
- Consumes: backend API and derived-product inventory from Tasks 1-2
- Produces: API payload, frontend-derived view-model, map-layer, briefing, and alert-consumer inventory

- [ ] Step 1: Enumerate frontend API responses and static runtime datasets.
- [ ] Step 2: Identify reusable transformations that produce display, map, briefing, or notification data.
- [ ] Step 3: Match each frontend consumer to its backend or static original source.
- [ ] Step 4: Verify — cross-check API helpers against backend routes and feature consumers; expect no unexplained operational payload.

## Task 4: Integrate and report

**Files:**
- Create: `docs/superpowers/specs/refs/2026-07-19-project-data-tag-inventory.md`
- Modify: `docs/superpowers/status/2026-07-19-project-data-tag-inventory-research.status.md`

**Interfaces:**
- Consumes: evidence-backed inventories from Tasks 1-3
- Produces: consolidated tag candidate table and gaps for the later common contract design

- [ ] Step 1: Merge duplicate entries by meaning while preserving distinct domestic/overseas or raw/normalized stages.
- [ ] Step 2: Apply one naming pattern and record tag, meaning, source, schema reference, time, space, transformation, storage, and consumers.
- [ ] Step 3: Separate confirmed inventory from unresolved questions and design recommendations.
- [ ] Step 4: Verify — search collector registration, store type, API route, and frontend API references against the final table; expect all identified operational boundaries to be covered.
- [ ] Step 5: Update the status handoff with evidence and the next design decision.
