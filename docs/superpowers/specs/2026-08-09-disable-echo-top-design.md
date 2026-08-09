# Temporarily Disable Echo Top

## Goal

Temporarily stop all Echo Top collection on the backend and hide its weather-layer button in the frontend so the radar/satellite API key stops receiving Echo Top requests.

## Design

- Reuse the existing `RADAR_ECHO_TOP_ENABLED` configuration flag.
- When disabled, do not register the Echo Top cron job and do not run startup backfill. The existing processor-level guard remains as a second safety boundary.
- Add a frontend build flag, `VITE_ECHO_TOP_ENABLED`, defaulting to enabled for existing local behavior. When set to `0`, omit Echo Top from the observation layer button list.
- Do not delete existing Echo Top files or metadata.
- Do not change ordinary radar, satellite, CI, CTPS, WISSDOM, or QPF collection.

## Verification

- Unit tests prove disabled backend scheduling registers neither the cron job nor startup backfill.
- Frontend source test proves the observation list conditionally excludes Echo Top when the build flag is `0`.
- Run focused backend/frontend tests and frontend production build locally.
- Deploy the code, set both disable flags in the server environment, restart PM2, and verify health plus absence of new `echo_top` activity in PM2 logs.
