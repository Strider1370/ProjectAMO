# ProjectAMO Instructions

## Think Before Coding

Before implementing, state assumptions clearly. If there are multiple reasonable interpretations, present them instead of choosing silently. Say when a simpler approach exists. If something remains unclear, stop, name the uncertainty, and ask the user.

## Simplicity and Surgical Changes

Make the smallest change that satisfies the approved task. Do not add speculative abstractions, features, or unrelated cleanup. Do not extend the scope without the user?s approval. Prefer removing unnecessary code to adding new layers.

## Goal-Driven Execution

Turn each request into a result that can be verified. For multi-step work, first give a brief sequence of `step ? how it will be checked`.

## Architecture Map

Before any task, read `Architecture.md`. If its Task Patterns list a match, follow that numbered entry in `EntryPoints.md`.

Before any UI, CSS, layout, responsive, or design task, also read `docs/design/design-language.md`. It is the design constitution and single source of truth. For major mobile or tablet structural changes, capture evidence and write a proposal before implementation unless the user explicitly approves the change.

Before changing `MapView.jsx` or adding a map layer, overlay, visibility sync, or timeline behavior, read `docs/adr/0001-mapview-layer-gravity.md`. New layer, overlay, and timeline logic belongs in a `useXOverlay` hook in its owning feature module. Do not add new state or `useEffect` calls to `MapView.jsx`.

After work, update these documents when they no longer describe reality. Keep them unchanged when no update is needed.

## Encoding Safety

Never overwrite UTF-8 files with PowerShell `Set-Content`, `Out-File`, or `>` redirection. Use `apply_patch` for edits or Node `fs.writeFileSync(path, content, 'utf8')` for mechanical rewrites. Read `docs/policies/encoding-safety.md` before handling encoding-sensitive work.

## Code Knowledge Graph (graphify)

Before broad code reading, when `graphify-out/graph.json` exists, run `graphify query "<question>"`. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for a focused concept. If the current environment requires approval to use graphify, first name the skill and why it is needed, then obtain approval. After code changes, run `graphify update .`.

Graph results guide exploration only. They never replace build, runtime, or browser verification.

## Browser Verification

For browser-visible behavior?UI, layout, responsive behavior, or rendering?verify with Playwright using `npx playwright ...`. Do not use an embedded preview as verification evidence in place of Playwright. Before starting a local server or taking a Playwright screenshot, read and follow `docs/dev-server-and-capture.md`.

## Long Context Tasks

First read and follow `docs/policies/long-context-handoff.md` if two or more of these apply: expected work of one hour or more; ten or more files to touch or explore; three or more independent work units; both backend and frontend; a new API endpoint, database schema, or directory; work unlikely to finish in one session; security, authentication, payment, or migration work; or context use already at 40% or more.

## Session Hygiene

If the same problem-solving approach fails twice in a row, stop repeating it. Re-state the hypothesis, evidence, and changes; then restart from a smaller, verified scope with a new approach.

For work that may span sessions, keep a one-page status record in `docs/superpowers/status/` with the current state, completed work, and the next verification step.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, treat it as an explicit request to use the `graphify` skill. State that skill and why it applies, then obtain any required consent before running it.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
