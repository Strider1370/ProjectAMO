# ProjectAMO agent entrypoint

`AGENTS.md` (Codex) and `CLAUDE.md` (Claude) are the same document. Change both together. Both names are case-sensitive on Linux — keep `CLAUDE.md` uppercase or Claude Code will not load it.

Read [the policy index](docs/policies/index.md) and the relevant `Architecture.md` section before editing. Follow the index's matching detailed policy; for ambiguous work, read up to two and re-check routing if exploration crosses a boundary.

Fallback when policy routing or a hook is unavailable: use `Architecture.md` and [the policy index](docs/policies/index.md); hooks never replace these documents.

## Workflow

Process is owned by the superpowers skills. **Invoke a matching skill directly — do not ask for approval first.** If there is any chance a skill applies, invoke it.

### Feature pipeline — the user decides when it runs

There is no size threshold and no checklist. The user judges whether a piece of work warrants the pipeline. When the user calls for this workflow, run every step in order and skip none. Invoking `brainstorming` means the pipeline is on. Otherwise, just do the work.

1. **`brainstorming`** — settle requirements, alternatives, and design in conversation, then write the spec to `docs/superpowers/specs/`. **The user reviews the spec themselves — do not dispatch a reviewer subagent for it.** Proceed only on explicit approval.
2. **`writing-plans`** — decompose the approved spec into an executable plan under `docs/superpowers/plans/`.
3. **Plan review** — dispatch the `reviewer` subagent with both the plan and the approved spec, plus the policies routed by [the policy index](docs/policies/index.md). It checks that every requirement maps to a task, that no task invents a user-affecting decision absent from the spec, and that the named files and interfaces actually exist. Resolve the findings, then obtain explicit user approval.
4. **Implement** — `subagent-driven-development` when the work is large or main-session context is already tight; continuity then comes from the plan and status files rather than the chat history. `executing-plans` when it fits inline with checkpoints. Use `test-driven-development` inside either path.
5. **`verification-before-completion`** — run the real thing, the app or the browser contract, and show its output. An embedded preview is not evidence. No completion claim without it.
6. **`systematic-debugging`** — the moment anything fails, at any step above. Root cause, not the symptom; return to the failed step rather than patching around it.
7. **`finishing-a-development-branch`** — finish, commit, push, or PR requests.

### Outside the pipeline

`systematic-debugging`, `verification-before-completion`, and `test-driven-development` apply to any work, pipeline or not. `requesting-code-review` / `receiving-code-review` cover review cycles on implemented code. `using-git-worktrees` and `dispatching-parallel-agents` cover isolation and independent parallel work.

Task packet documents live under `docs/superpowers/{specs,plans,status}/`.

## Environment

This is a Linux-only project. The repository lives in Linux at `~/ProjectAMO` (WSL Ubuntu today, any Linux host tomorrow). Run `git`, `npm`, `node`, and `graphify` from a Linux shell only — never from `cmd.exe`, PowerShell, or a Windows-side tool.

- After a fresh clone, run `bash scripts/bootstrap-linux.sh` once before anything else — it pins the Node version, installs dependencies with `npm ci`, fetches the Playwright browser, and sets `core.hooksPath` / line-ending git config.
- Commands and docs use `npm`, `bash`, `curl`, `ss`, and `~/.ssh/...` — no PowerShell, no `.cmd`/`.exe` binaries, no `C:\` paths.
- Playwright snapshot baselines are Linux-only (`*-linux.png`).

## Always

- **Ponytail on every coding task** — implementation, fixes, refactors, reviews, technical design. Make the smallest safe change *after* understanding the flow. It never waives investigation, tests, security, accessibility, or validation at trust boundaries.
- **Graphify before broad code reading** — when `graphify-out/graph.json` exists, run `graphify query "<question>"`; use `path`/`explain` to narrow relationships. Graph results guide exploration and never replace tests or browser verification. Run `graphify update .` after code changes. This applies to subagents too — include it in every subagent prompt involving code exploration.
- State material assumptions and make the smallest approved change.
- Read [encoding safety](docs/policies/encoding-safety.md) before edits touching Korean or other non-ASCII text.
- Browser-visible work requires Playwright evidence, not an embedded preview: [browser verification](docs/policies/verification/browser-verification.md), [the contract registry](docs/policies/verification/contracts.md), and [the dev-server procedure](docs/operations/dev-server-and-capture.md).
- Keep temporary outputs in ignored artifact locations; remove only files the current task created.
- Update architecture or policy documents only when they no longer describe reality.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
