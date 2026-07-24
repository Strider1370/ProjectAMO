# ProjectAMO

Korean aviation weather and operational-awareness dashboard. It combines airport weather, advisories, NOTAMs, map overlays, route briefing, and operational monitoring in a React/Mapbox frontend with a Node/Express backend.

## What it provides

- Airport panels for METAR, TAF, AMOS, warnings, and airport information.
- Map overlays for radar, satellite, lightning, SIGWX, SIGMET/AIRMET, KIM/KTG products, aviation GeoJSON, ADS-B, and NOTAMs.
- IFR/VFR route planning, route preview, vertical profile, and route-aware briefing.
- Overseas NOAA weather displayed separately from Korean KMA data, then combined only where a UI flow needs it.
- Monitoring and test-instance developer tools.

## Stack

- Frontend: React 19, Vite 7, Mapbox GL.
- Backend: Node.js, Express, scheduled collectors, local snapshots, and SQLite-backed user features.
- Verification: Node test runner and Playwright.
- Deployment: AWS EC2, PM2, and nginx.

## Quick start

This is a Linux-only project (WSL Ubuntu or any Linux host). After cloning, run the bootstrap script once:

```bash
bash scripts/bootstrap-linux.sh
```

It installs dependencies at the pinned Node version (see `.nvmrc`), fetches the Playwright browser, and sets the local git line-ending and hooks config. To install dependencies manually instead:

```bash
npm ci
npm --prefix frontend ci
npm --prefix backend ci
```

Create a root `.env` as needed. Use [`backend/.env.example`](backend/.env.example) for backend/session settings and set `VITE_MAPBOX_TOKEN` for the map. Do not commit secrets.

Start both services and verify readiness:

```bash
npm run dev:verify
```

Keep the development services running:

```bash
npm run dev:serve
```

- Frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:3001/api/health`

Use `npm run dev:test` for fixed-data test-instance work. For all server, browser, and screenshot details, follow [the development and capture guide](docs/operations/dev-server-and-capture.md).

## Verification

```bash
npm --prefix backend test
npm --prefix frontend test
npm run build
npm run dev:smoke
```

Run baseline responsive screenshots with the managed launcher:

```bash
PROJECTAMO_SCREENSHOT_PHASE=manual PROJECTAMO_SCREENSHOT_LABEL=after npm run dev:screenshots
```

## Repository map

```text
frontend/   React/Vite application and Mapbox UI
backend/    Express API, collectors, parsers, processors, snapshots, and tests
shared/     frontend/backend shared constants
scripts/    repository-local tooling
docs/       policies, operations, research, plans, and historical records
```

See [Architecture.md](Architecture.md) for the current file-role map.

## Documentation

- [Documentation index](docs/README.md)
- [Project policies](docs/policies/index.md)
- [Development and Playwright capture](docs/operations/dev-server-and-capture.md)
- [Operations](docs/operations/operations.md)
- [EC2 deployment](docs/operations/aws-ec2-manual-deploy.md)

Historical drafts are under [`docs/archive/`](docs/archive/); they are not current implementation guidance.
