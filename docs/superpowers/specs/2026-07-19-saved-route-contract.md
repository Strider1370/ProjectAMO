# Spec: Saved Route Contract Safety

**Status:** Approved
**Created:** 2026-07-19

## Problem / Goal

New saved routes are normalized by the frontend to snapshot version 3, but the server accepts any JSON object and silently turns malformed stored JSON into an empty route. Validate the current write contract without rewriting existing user data, and make malformed legacy rows visible instead of silently pretending they are empty routes.

## Requirements

- **FR-001:** New authenticated route saves must accept only snapshot version 3 with a base design containing an object `routeForm`, an object `enroute`, and a string `routeString`; optional known v3 fields must have their expected JSON types.
- **FR-002:** The server must continue to return valid legacy route JSON unchanged so the existing frontend normalization can read versionless and version 2 snapshots.
- **FR-003:** The server must not rewrite a legacy payload during read or migration. A user re-saving a loaded route creates a newly validated version 3 row through the existing create-only API.
- **FR-004:** If a stored route payload cannot be parsed as JSON, the API must return that route with an explicit `invalidPayload` marker and without inventing an empty snapshot. Other valid routes must still be returned.
- **FR-005:** Route-selection UI must show malformed saved routes as unavailable for loading or alert registration while leaving their existing delete action available.

## Non-Goals (out of scope)

- Saving route geometry or changing alert-registration behavior.
- Adding a route update endpoint, DB payload-version column, or bulk data rewrite.
- Replacing frontend version-2 and versionless read normalization.

## Success Criteria

- **SC-001:** A valid v3 route save round-trips unchanged through the API.
- **SC-002:** A versionless or version-2 stored fixture remains readable by the frontend normalization path and its DB payload remains byte-for-byte unchanged.
- **SC-003:** Invalid new snapshots are rejected with `invalid_input` before storage.
- **SC-004:** One malformed stored payload is marked unavailable without hiding or corrupting other saved routes.
- **SC-005:** Route-load and alert-template UI does not offer a malformed saved route as usable input.

## Alternatives Considered

| Option | Trade-off | Why not chosen |
|---|---|---|
| Rewrite every existing row to v3 | One uniform DB shape | A bulk rewrite risks user data and is unnecessary because the frontend already reads legacy versions. |
| Return malformed JSON as `{}` | No UI change | It hides corruption and can be mistaken for a valid empty route. |
| Add route geometry now | Helps unfinished alert work | Geometry policy belongs to the later alert-completion work and is intentionally deferred. |

## Open Questions

- None.
