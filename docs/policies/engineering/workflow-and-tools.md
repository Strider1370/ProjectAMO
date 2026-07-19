# Workflow and tools

## Applies when

General implementation, repository exploration, tools, hooks, delegation, temporary files, standalone routes, route-briefing payload work, developer-console scenarios, or test scenarios are involved.

## Does not apply when

Use the more specific data/time, map/layers, design, delivery, spec/plan/status format, or encoding policy for its boundary; pair this policy only when general workflow still applies.

## Re-check trigger

Re-check the policy index when exploration changes the affected boundary, a new persistent rule is introduced, or a hook/tool capability is unavailable.

## Working rules

- State material assumptions, make the smallest approved change, and leave a result that can be verified. Update architecture or policy documents only when they no longer describe reality.
- Use the Ponytail skill for every coding task, including implementation, fixes, refactors, reviews, and technical design. Apply its minimum-safe-change discipline after understanding the relevant flow. It does not waive required investigation, tests, security, accessibility, or this project's consent gate.
- Before broad code reading, use `graphify query` when `graphify-out/graph.json` exists; use path/explain to narrow relationships. Graph results guide exploration and never replace tests or browser verification. Update the graph after code changes.
- Use the applicable skill, plugin, and environment capability; do not copy their tool-owned procedures into project policy. Approval and sandbox limits still apply.
- Delegate only bounded, independently verifiable work with explicit scope, constraints, evidence, and a concise handoff. The main agent retains requirements, integration, rapid debugging, browser capture, and final verification.
- Keep temporary outputs in ignored artifact locations and remove only files created for the current task when they are no longer needed.
- Repository hooks reinforce this policy but are not the only routing source. Document each hook's trigger, reinforced rule, and verification here when it is registered.
- Registered `PreToolUse` checks reinforce graphify-first exploration. `SessionStart` is unverified in this environment: the Codex manual fetch could not reach the official source and no current docs provider exposed a hook schema, so no `SessionStart` registration is present. Use the `AGENTS.md`/`claude.md` → policy-index fallback; revisit only with an authoritative current-environment schema and fresh-session injection evidence.

The repository `pre-commit` hook is registered through `core.hooksPath=.githooks` and runs `graphify update .`; failures are visible and stop the commit.

## Recurring entry sequences

- Standalone route: place the feature route under `frontend/src/features/`, branch in `frontend/src/app/App.jsx` before the shell, use URL navigation when sidebar access is needed, then verify direct entry, refresh, and shell routes.
- Route-briefing payload: keep interpretation and matching in tested backend briefing modules; expose it through `POST /api/route-briefing`; keep client state in `useRouteBriefing` and rendering in briefing components. Verify backend tests, frontend build, and a browser smoke.
- Developer console: test-instance only; reuse real scheduler/evaluation logic, keep trigger/observe API under `backend/src/dev/`, and gate frontend access to the test/development route. Verify with the documented test server and Playwright procedure.
