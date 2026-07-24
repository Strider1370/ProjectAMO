# ProjectAMO Dev Server and Capture Procedure

Use this guide whenever a task requires opening the local backend, opening the frontend, or running Playwright screenshots against the local app.

This is a Linux-only project (WSL Ubuntu or any Linux host). After a fresh clone or a Node version change, reinstall before running anything:

```
npm ci && npm --prefix backend ci && npm --prefix frontend ci
```

Symptoms of a stale install: `Cannot find module`, an `@esbuild/*` or `@rollup/*` mismatch error, or `sharp` failing to load.

## Standard Ports

- Backend: `http://127.0.0.1:3001`
- Backend health check: `http://127.0.0.1:3001/api/health`
- Frontend: `http://127.0.0.1:5173`
- Frontend app URL for Playwright: `PROJECTAMO_URL=http://127.0.0.1:5173`

Use `npm run dev:serve` for persistent development and `npm run dev:test` for fixed-data verification.

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

Use `dev:serve` only when the user explicitly wants the app left running for manual/browser work. For automated screenshots or smoke checks, use `dev:smoke` or `dev:screenshots` so the launcher starts, verifies, runs the task, and cleans up in one bounded command.

Run responsive smoke with managed servers:

```
npm run dev:smoke
```

Run baseline responsive screenshots with managed servers:

```
PROJECTAMO_SCREENSHOT_PHASE=<phase> PROJECTAMO_SCREENSHOT_LABEL=<label> npm run dev:screenshots
```

The launcher starts `backend/server.js` and Vite directly with Node instead of keeping long-running servers behind npm wrapper processes. It writes server logs under `artifacts/runtime-logs/`.

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

Use the managed launcher before creating one-off screenshot scripts: `npm run dev:smoke`, or `npm run dev:screenshots` with the phase/label variables set as shown above.

If servers are already running and verified, the lower-level frontend scripts can still be used directly with `PROJECTAMO_URL=http://127.0.0.1:5173` set, calling `npm run smoke:responsive --prefix frontend` or `npm run screenshots:responsive --prefix frontend`.

Playwright writes `*-linux.png` baselines. A baseline captured on a different OS will not match because font rasterization differs; regenerate on Linux rather than porting one in.

For UI states that the baseline script does not cover, write or run focused Playwright steps that open the relevant panel, tab, dialog, or route before capturing. Store responsive evidence under:

```text
artifacts/responsive-screenshots/<phase>/<YYYY-MM-DD_HHMM_label>/
```

Include a short README or manifest with the capture time, branch/commit, viewport matrix, capture method, and verification commands when the capture is part of responsive/UI work.

## Known Failure Modes

- `node: command not found` in a script, hook, or any non-interactive shell. nvm loads from `~/.bashrc` below its non-interactive guard, so only interactive shells see it. `node`, `npm`, `npx`, `graphify`, and `graphify-mcp` are symlinked into `/usr/local/bin` to cover every shell; if a new tool is missing, symlink it the same way. Re-run the symlinks after `nvm use` switches versions.
- `5173` is already in use: because `--strictPort` is required, the frontend will fail instead of moving ports. Find and stop the existing ProjectAMO frontend or reuse it after verifying it serves the current workspace.
- Backend starts but upstream data collection logs `fetch failed`: this is not a readiness blocker by itself. The server is considered ready when `/api/health` returns success; live external API refresh may still fail because of network/API availability.
- Stopping only the parent process may leave child node processes behind. Clean up by checking the listening ports above and stopping the owning process for `3001` and `5173`.
- Avoid `networkidle` as the default screenshot wait condition for this app. Mapbox tiles and polling can keep the network busy; prefer route-specific DOM readiness selectors.
