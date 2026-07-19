# Plan: Saved Route Contract Safety

**Spec:** docs/superpowers/specs/2026-07-19-saved-route-contract.md
**Goal:** Validate new v3 saved routes while preserving legacy payloads and making corrupted rows safely unavailable.

## Global Constraints

- Reuse Zod already installed in the backend; add no dependency or database rewrite.
- Keep the frontend's existing legacy read normalization.
- Do not store route geometry in this work.

---

## Task 1: Validate only new version-3 route saves

**Files:**
- Modify: `backend/src/me/routes.js`
- Modify: `backend/test/me-routes.test.js`

**Interfaces:**
- Produces: POST `/api/me/routes` accepts the documented v3 snapshot shape or returns `invalid_input`.

- [ ] Replace the unrestricted snapshot object schema with a minimal v3 Zod contract for the persisted design fields.
- [ ] Retain the existing payload-size and owner checks.
- [ ] Add API tests for accepted v3 and rejected malformed or legacy write payloads.
- [ ] Verify — run `npm --prefix backend test -- me-routes.test.js`, expect passing tests.

## Task 2: Preserve legacy reads and expose malformed rows

**Files:**
- Modify: `backend/src/me/routes.js`
- Modify: `backend/test/me-routes.test.js`
- Modify: `frontend/src/features/route-briefing/lib/routeStore.test.js`

**Interfaces:**
- Produces: `invalidPayload: true` for malformed stored rows; valid legacy JSON remains unchanged.

- [ ] Return valid parsed legacy payloads untouched from GET.
- [ ] Return a marker instead of `{}` when JSON parsing fails, while preserving the route id, name, and deletion capability.
- [ ] Add fixtures proving versionless and v2 snapshots still normalize on the frontend and their stored strings do not change.
- [ ] Verify — run the backend route tests and `npm --prefix frontend test -- routeStore.test.js`, expect passing tests.

## Task 3: Prevent use of malformed saved routes

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx`
- Modify: `frontend/src/app/App.jsx`

**Interfaces:**
- Consumes: `invalidPayload` from Task 2.

- [ ] Mark malformed routes as recovery-needed and disable their load control while retaining delete.
- [ ] Exclude malformed routes from alert-template selection.
- [ ] Do not deep-link load a malformed route.
- [ ] Verify — run focused frontend tests and then the frontend test suite.

## Task 4: Full verification

**Files:**
- Modify: none

- [ ] Verify — run `npm --prefix backend test`, `npm --prefix frontend test`, `npx depcruise .`, and `npx knip`.
- [ ] Verify browser-visible saved-route behavior with Playwright using the project dev-server procedure.
