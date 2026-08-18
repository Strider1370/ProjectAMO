# AWS EC2 Operations

## Runtime

- Deployment target: `AWS EC2 VM`
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
- `rainviewer` (해외 레이더): 단일 메타 파일 1개만 덮어씀. 보존 대상 없음 — 타일 이미지는 서버에 저장하지 않고 브라우저가 RainViewer CDN에서 직접 받는다.

Current behavior:

- JSON retention is controlled by `backend/src/config.js` and enforced by `backend/src/store.js`.
- `sigwx_low` front/cloud overlay files are deleted when the corresponding snapshot disappears.
- On restart, the server reloads `latest.json` files into memory before the next collector run.

## Demo Mode

시연 모드는 데이터 교체와 시각 변경을 따로 수행하지 않는다. 관리자 화면에서 준비 완료된 스냅샷의 `시연 시작` 또는 진행 중인 시연의 `시연 종료`만 사용한다.

시연 시작 계약:

- 수집기는 기존 `DATA_PATH` 실황 루트에 계속 게시한다.
- 준비 점검을 통과한 스냅샷으로 만든 뷰를 `DATA_PATH/.active-data`에 원자적으로 연결하고, 서버·브라우저의 유효 현재시각도 그 뷰의 기준시각에서 파생한다.
- 준비 점검은 핵심 자료 21종, 레이더 36장, 위성 18장, 참조 파일, KIM/KTG 인덱스와 ADS-B 시각 오차 30분 이하를 요구한다.
- 과거 스냅샷이 소유하지 않는 검증된 AIP·이후 추가 자료(현재는 태풍)·정적 지형은 실황 루트로 명시적으로 통과 연결한다.
- 시작은 외부 API, 수집 drain, `_live_backup`, 스냅샷 복사를 수행하지 않는다.

시연 종료 계약:

- 외부 API를 호출하지 않고 `.active-data`를 계속 수집 중이던 실황 루트로 원자 전환한다.
- 종료 시점에 이미 디스크에 저장된 최신 실황을 즉시 제공하며 파일 복사나 수집 완료 대기가 없다.
- 활성 링크와 뷰 메타가 재시작 후 모드 복구의 단일 진실원이다.

로컬 스냅샷 준비 점검에서 레이더·위성 이력이 부족하거나 ADS-B 시각이 어긋나면 다음 도구로 과거 프레임을 채우고 오래된 항공기 위치를 안전하게 비운다. 과거 ADS-B 위치는 보간하거나 현재 위치로 위장하지 않는다.

```bash
npm run demo:repair-weather -- --data-root backend/data --name demo
```

이미 준비된 레이더·위성을 그대로 두고 ADS-B만 정리할 때:

```bash
npm run demo:repair-weather -- --data-root backend/data --name demo --skip-weather
```

운영 서버 적용은 로컬의 준비 점검, 시연 시작, 경로 확인, 비행 전 브리핑, 시연 종료 후 파일 해시 복원이 모두 통과하고 운영자가 승인한 뒤에만 진행한다.

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
- `rainviewerMeta`
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
- `/data/radar/rainviewer_meta.json`: `no-cache`
- `/data/satellite/sat_meta.json`: `no-cache`
- `/data/sigwx_low/fronts_meta_<tmfc>.json`: `no-cache`
- `/data/sigwx_low/clouds_meta_<tmfc>.json`: `no-cache`

### Frontend/static assets served by nginx

- Hashed frontend build assets: `public, max-age=31536000, immutable`
- `index.html`: `no-cache`
- Navdata / geojson / topojson / symbols: `public, max-age=31536000, immutable`

## PM2

PM2 owns only the long-lived API server and scheduler. Every satellite collection
(IR/FOG, CI/CTPS, and VI006 visible) runs in one short-lived child Node process.
The child exits after it atomically publishes its result, which releases h5wasm,
HDF5, and image-processing memory without restarting the API server. The queue
permits only one satellite child at a time on the 2 GiB VM.

During a collection, inspect the parent and temporary child separately:

```bash
pm2 status projectamo-backend
pgrep -af 'backend/src/satellite/worker-entry.js' || true
ps -o pid,ppid,rss,etimes,args -C node
curl -fsS http://127.0.0.1:3001/api/snapshot-meta
```

One worker is expected only while a satellite collection is active; after it
finishes, `pgrep` must be empty. A PM2 memory restart is not the primary remedy
for satellite memory growth: investigate a worker that remains alive or a failed
worker cleanup instead.

Recommended start command:

```bash
pm2 start backend/server.js --name projectamo-backend
pm2 save
pm2 startup
```

Recommended update flow:

```bash
deploy/deploy-vm-full.sh # use when package manifests or lockfiles changed
```

`deploy/deploy-vm.sh` is the fast path and is valid only when backend and frontend package manifests and lockfiles have not changed. Dependency changes require `deploy/deploy-vm-full.sh`; the fast path intentionally performs no dependency installation.

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
- During one normal and one visible satellite collection, verify at most one
  `worker-entry.js` child exists and that it disappears afterward

## Stale Data Policy

- User-facing policy: keep serving the last stored `latest.json` payload.
- Operational meaning: restart or upstream collection failure should not blank the UI immediately.
- Follow-up enhancement, if needed: extend `/api/health` with a `degraded` state when recent collection failures accumulate.
