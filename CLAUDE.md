# ProjectAMO

Vite + React aviation weather dashboard with a Node/Express backend.
`AGENTS.md` and `CLAUDE.md` contain the same project reference; keep them identical.

## Environment and commands

- Linux only (including WSL). Node version: `.nvmrc`; package manager: npm.
- Fresh clone: `bash scripts/bootstrap-linux.sh`.
- Development servers: `npm run dev:serve` (backend 3001, frontend 5173).
- Server readiness check with automatic cleanup: `npm run dev:verify`.
- Tests: `npm test`; frontend build: `npm run build`; both: `npm run check`.
- Browser contract: `npm run dev:contract -- --grep <contract-id>`.
- Source files use UTF-8 and LF. Playwright screenshot baselines are Linux-only.
- Temporary output belongs under ignored `artifacts/` or `.artifacts/`.

## Project references

- [Architecture](Architecture.md): directories, module ownership, and import boundaries.
- [Engineering and design references](docs/policies/index.md): data, time, maps, UI, and verification contracts.
- [Local servers and screenshots](docs/operations/dev-server-and-capture.md).
- [Operations and deployment](docs/operations/operations.md).

## Important contracts

- Store and compare instants as UTC or epoch values; parse source times in their documented timezone and honor the selected display timezone.
- Preserve the last usable snapshot when collection partially fails; validate upstream data at the boundary.
- Use the existing design tokens and preserve accessibility and responsive behavior.
- Backend code does not import frontend code. Frontend shared modules stay frontend-only.
- Production data lives at `/opt/projectamo/shared/data`. Dependency changes require `deploy/deploy-vm-full.sh`; the fast deploy does not install dependencies.

## Working preferences

- Carry implementation and fix requests through to completion and relevant verification within the authorized scope.
- Make reasonable assumptions for routine, reversible decisions; ask when missing information materially affects correctness, scope, or authorization.
- Follow existing project patterns and keep changes focused on the request.
- Match verification to the affected behavior and report any checks you could not complete.
- Respond in Korean. Lead with the result, then briefly explain meaningful changes, verification, and remaining issues.
- Before requesting approval, complete preparation that is already authorized and present a concrete, reviewable result.
- Explicit user instructions take precedence over conflicting skill guidelines, subject to higher-priority instructions and actual permission boundaries. If a skill causes a pause or deviation, identify the file and relevant rule, distinguish explicit requirements from your interpretation, and continue unaffected authorized work.
- Avoid repetitive transitions, stock phrases, and boilerplate warnings about hypothetical risks. Use lists when they improve readability.
