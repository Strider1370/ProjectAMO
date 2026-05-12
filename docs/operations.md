# GCP VM Operations

## Runtime

- Deployment target: `GCE VM`
- Process manager: `PM2`
- Reverse proxy: `nginx`
- Data storage: VM local disk at `/opt/projectamo/shared/data`
- Backend bind: `127.0.0.1`

Terrain runtime path:

- PM2 sets `DATA_PATH=/opt/projectamo/shared/data`.
- Vertical profile terrain tiles must exist at `/opt/projectamo/shared/data/terrain/tiles/metadata.json` plus the `E###_N##.bin` tile files.
- Local development can use `backend/data/terrain/tiles/` when `DATA_PATH` is unset.

## Retention

- Default JSON datasets: `latest.json + 10` history files
- `lightning`: `48` history files
- `sigwx_low`: `12` history files minimum
- `radar`: `36` loop frames
- `satellite`: `18` loop frames

Current behavior:

- JSON retention is controlled by `backend/src/config.js` and enforced by `backend/src/store.js`.
- `sigwx_low` front/cloud overlay files are deleted when the corresponding snapshot disappears.
- On restart, the server reloads `latest.json` files into memory before the next collector run.

## Fetch Strategy

- Frontend performs one full weather load at startup.
- After startup, the app polls `/api/snapshot-meta` every 60 seconds.
- Only changed datasets are refetched.
- Static airport definitions and frontend public navdata are not part of the polling loop.

Current incremental keys:

- `metar`
- `taf`
- `warning`
- `sigmet`
- `airmet`
- `sigwxLow`
- `amos`
- `lightning`
- `airportInfo`
- `echoMeta`
- `satMeta`

## Cache Policy

### API

- `/api/*`: `Cache-Control: no-store`

### Generated overlay frames

- `/data/radar/echo_korea_<tm>.png`: `public, max-age=10800, immutable`
- `/data/satellite/sat_korea_<tm>.webp|png`: `public, max-age=10800, immutable`
- `/data/sigwx_low/fronts_<tmfc>.png`: `public, max-age=10800, immutable`
- `/data/sigwx_low/clouds_<tmfc>.png`: `public, max-age=10800, immutable`

### Generated metadata

- `/data/radar/echo_meta.json`: `no-cache`
- `/data/satellite/sat_meta.json`: `no-cache`
- `/data/sigwx_low/fronts_meta_<tmfc>.json`: `no-cache`
- `/data/sigwx_low/clouds_meta_<tmfc>.json`: `no-cache`

### Frontend/static assets served by nginx

- Hashed frontend build assets: `public, max-age=31536000, immutable`
- `index.html`: `no-cache`
- Navdata / geojson / topojson / symbols: `public, max-age=31536000, immutable`

## PM2

Recommended start command:

```bash
pm2 start backend/server.js --name projectamo-backend
pm2 save
pm2 startup
```

Recommended update flow:

```bash
git pull --ff-only origin main
npm install
npm --prefix frontend install
npm --prefix frontend run build
pm2 restart projectamo-backend
```

## nginx Notes

- Expose only nginx publicly.
- Keep Node on `127.0.0.1:<backend-port>`.
- Forward `X-Forwarded-For` and `X-Forwarded-Proto`.
- Apply rate limit to `/api/*`.
- Exclude `/data/*` from the strict API limit, or apply a much looser limit.
- Prefer nginx to serve built frontend assets and long-cache static assets directly.

Minimum proxy shape:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3001;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Deployment Checklist

### Before deploy

- `.env` exists on the VM
- `DATA_PATH` points to the intended local disk path
- Terrain tiles exist under `$DATA_PATH/terrain/tiles/` when vertical profiles are enabled
- PM2 app name and start command are fixed
- nginx reverse proxy is configured
- nginx cache headers for frontend static assets are configured
- `/api/*` rate limit policy is configured

### After deploy

- `curl http://127.0.0.1:3001/api/health`
- `curl http://127.0.0.1:3001/api/snapshot-meta`
- Verify `/api/*` returns `Cache-Control: no-store`
- Verify radar/satellite/SIGWX frame files return `max-age=10800, immutable`
- Verify meta JSON returns `no-cache`
- Verify `SIGWX_LOW` history keeps at least 2 days of snapshots
- Verify `pm2 restart` preserves service using existing `latest.json`

## Stale Data Policy

- User-facing policy: keep serving the last stored `latest.json` payload.
- Operational meaning: restart or upstream collection failure should not blank the UI immediately.
- Follow-up enhancement, if needed: extend `/api/health` with a `degraded` state when recent collection failures accumulate.
