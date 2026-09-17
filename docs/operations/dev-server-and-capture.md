# ProjectAMO Dev Server and Capture Procedure

Commands for local backend/frontend servers and Playwright screenshots.

This is a Linux-only project (WSL Ubuntu or any Linux host). The clean-install runtime is exactly Node `22.23.1` from `.nvmrc` and npm `10.9.8` from the root/backend/frontend `packageManager` declarations. `bash scripts/bootstrap-linux.sh` validates both values after `nvm install`/`nvm use`; do not substitute a globally installed, different Node or package manager.

The default application install covers three independent npm roots, not the prototype:

```
npm ci && npm --prefix backend ci && npm --prefix frontend ci
```

`prototypes/destination-weather-comparison` is an independent Vite/Sites project. Install it only when running its build or `test:sites`:

```
npm run install:prototype
```

The default bootstrap also installs Chromium plus Linux system dependencies for frontend Playwright contracts and the backend NOTAM Chromium consumer:

```
npm run install:browsers:chromium
```

WebKit is intentionally separate because only selected Safari/organization contract projects need it:

```
npm run install:browsers:webkit
```

Python/GIS generation is outside every npm install and normal test gate. In a reviewed, writable data environment, make a local virtual environment and install only the tools needed by the selected generator:

```
python3 -m venv .artifacts/gis-venv
.artifacts/gis-venv/bin/pip install --upgrade pip
.artifacts/gis-venv/bin/pip install shapely numpy rasterio Pillow
```

The terrain/navdata commands may download inputs or overwrite configured outputs; see the root verification policy before running them.

Symptoms of a stale install: `Cannot find module`, an `@esbuild/*` or `@rollup/*` mismatch error, or `sharp` failing to load.

## Standard Ports

- Backend: `http://127.0.0.1:3001`
- Backend health check: `http://127.0.0.1:3001/api/health`
- Frontend: `http://127.0.0.1:5173`
- Frontend app URL for Playwright: `PROJECTAMO_URL=http://127.0.0.1:5173`

Use `npm run dev:serve` for persistent development. `npm run dev:test` disables automatic collection; fixed-data fixtures are provided by the browser contract runner.

Playwright contracts use a separate managed path. `npm run dev:contract -- --grep <contract-id>` checks that 3001 and 5173 are free, then Playwright owns the verification backend and frontend. It does not reuse or stop a human-run server.

## Preflight

Check whether the ports are already taken:

```
ss -ltnp | grep -E ':3001|:5173'
```

If either port is already in use, identify whether it is an existing ProjectAMO server before starting another copy. Keep Vite on `5173` with `--strictPort` so it does not silently move to another port.

## Start Servers for Verification

Prefer the repo-local Node launcher (`scripts/projectamo-dev.mjs`). It starts both servers from repository-relative paths, waits for readiness, runs the selected check, and cleans up child processes.

Start both servers and verify readiness:

```
npm run dev:verify
```

Start both servers and keep them running:

```
npm run dev:serve
```

`dev:serve` leaves servers running for manual/browser work. `dev:smoke` and `dev:screenshots` start servers, verify readiness, run the task, and clean up automatically.

Run responsive smoke with managed servers:

```
npm run dev:smoke
```

Run baseline responsive screenshots with managed servers:

```
PROJECTAMO_SCREENSHOT_PHASE=<phase> PROJECTAMO_SCREENSHOT_LABEL=<label> npm run dev:screenshots
```

The launcher starts `backend/server.js` and Vite directly with Node instead of keeping long-running servers behind npm wrapper processes. It writes server logs under `artifacts/runtime-logs/`; readiness requires both the expected HTTP response and the launcher-owned child PID to remain alive. Thus a pre-existing response on 3001/5173 cannot be reported as this launch succeeding, and cleanup signals only launcher-owned child process groups.

Expected timing:

- `npm run dev:verify`: usually a few seconds.
- `npm run dev:smoke`: usually under 15 seconds.
- `npm run dev:screenshots`: usually about 20-30 seconds for the 18-image baseline matrix.

If a single screenshot is needed, do not run the full 18-image baseline matrix. Write/run a focused Playwright capture for the exact route, viewport, and UI state requested.

Manual commands, when the launcher is not appropriate:

```
npm run dev --prefix backend
npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

The launcher is preferred because it keeps the startup, readiness checks, and cleanup behavior consistent.

## Manual Readiness Checks

```
curl -s http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5173/
```

Expected backend health content includes:

```json
{"ok":true}
```

## Playwright Capture

Managed screenshot commands: `npm run dev:smoke`, or `npm run dev:screenshots` with the phase/label variables set as shown above.

If servers are already running and verified, the lower-level frontend scripts can still be used directly with `PROJECTAMO_URL=http://127.0.0.1:5173` set, calling `npm run smoke:responsive --prefix frontend` or `npm run screenshots:responsive --prefix frontend`.

Playwright writes `*-linux.png` baselines. A baseline captured on a different OS will not match because font rasterization differs; regenerate on Linux rather than porting one in.

For UI states that the baseline script does not cover, write or run focused Playwright steps that open the relevant panel, tab, dialog, or route before capturing. Store responsive evidence under:

```text
artifacts/responsive-screenshots/<phase>/<YYYY-MM-DD_HHMM_label>/
```

## Known Failure Modes

- `node: command not found` in a script, hook, or any non-interactive shell. nvm loads from `~/.bashrc` below its non-interactive guard, so only interactive shells see it. `node`, `npm`, and `npx` are symlinked into `/usr/local/bin` to cover every shell; if a new tool is missing, symlink it the same way. Re-run the symlinks after `nvm use` switches versions.
- `3001` or `5173` is already in use: the launcher fails when its own child exits even if the existing service returns healthy HTTP. It never stops that existing process; identify its owner and either reuse it deliberately or stop it outside the launcher. Because `--strictPort` is required, Vite will not silently move to another port.
- Backend starts but upstream data collection logs `fetch failed`: this is not a readiness blocker by itself. The server is considered ready when `/api/health` returns success; live external API refresh may still fail because of network/API availability.
- Stopping only the parent process may leave child node processes behind. Clean up by checking the listening ports above and stopping the owning process for `3001` and `5173`.
- Avoid `networkidle` as the default screenshot wait condition for this app. Mapbox tiles and polling can keep the network busy; prefer route-specific DOM readiness selectors.
