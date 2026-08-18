# KIM 4-run forecast window

## Goal

Keep a current 12-hour KIM forecast window across all four daily KIM analysis cycles while keeping each KMA API Hub key below its daily limit.

## Approved behavior

- Collect KIM NE57 for the 00Z, 06Z, 12Z, and 18Z analysis cycles.
- Collect KIM forecast hours 0 through 12 inclusive at one-hour resolution.
- Use the KIM NWP credential for 00Z, 06Z, and 12Z. Use the aviation/general credential for the complete 18Z KIM run.
- Use the same credential choice for the KTG run with the same analysis time.
- KTG is source-limited to +6, +9, and +12 hours. Do not create hourly KTG fields.
- Retain release retries, locks, last-good publication, and startup collection behavior.

## Credential and safety contract

- Select one credential before a run starts. All KIM grid and KTG requests in that run use it.
- If the distinct aviation/general credential is unavailable for an 18Z run, fail that run without falling back to the KIM credential or an older candidate. A source-data failure after successful 18Z credential selection retains the existing last-good behavior.
- Mixed-key KIM and KTG collectors must not use the scheduler's static KIM-key preflight. The API Hub fetch guard validates the credential selected for each actual request before network I/O.
- API Hub accounting continues to record bytes under the credential actually used and never persists credentials or request URLs.

## Schedule and impact

- KIM runs at minute 12 of 00/01/02, 06/07/08, 12/13/14, and 18/19/20 UTC.
- KTG keeps its four release windows and retry slots, but its collection window becomes +6/+9/+12.
- Existing KIM map, route briefing, and timeline consumers read the published index dynamically; no new frontend state or API route is required.
- The admin usage page already groups usage by credential and endpoint, so 18Z KIM-grid and KTG traffic appears under 항공·일반 automatically.
