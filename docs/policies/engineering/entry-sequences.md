# Recurring entry sequences

Back to the [policy index](../index.md).

## Applies when

Adding a standalone feature route, working on the route-briefing payload, or touching the developer console.

## Sequences

- **Standalone route**: place the feature route under `frontend/src/features/`, branch in `frontend/src/app/App.jsx` before the shell, use URL navigation when sidebar access is needed, then verify direct entry, refresh, and shell routes.
- **Route-briefing payload**: keep interpretation and matching in tested backend briefing modules; expose it through `POST /api/route-briefing`; keep client state in `useRouteBriefing` and rendering in briefing components. Verify backend tests, frontend build, and a browser smoke.
- **Developer console**: test-instance only; reuse real scheduler/evaluation logic, keep trigger/observe API under `backend/src/dev/`, and gate frontend access to the test/development route. Verify with the documented test server and Playwright procedure.

## Hooks

- `PreToolUse` (Bash, Read/Glob) reinforces graphify-first exploration when `graphify-out/graph.json` exists.
- The repository `pre-commit` hook is registered through `core.hooksPath=.githooks` and runs `graphify update .`; failures are visible and stop the commit.
