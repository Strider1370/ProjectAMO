# ProjectAMO agent entrypoint

Read [the policy index](docs/policies/index.md) and the relevant `Architecture.md` section before editing. Follow the index's matching detailed policy; for ambiguous work, read up to two and re-check routing if exploration crosses a boundary.

Fallback when policy routing or a hook is unavailable: use `AGENTS.md`, `Architecture.md`, and [the policy index](docs/policies/index.md); hooks never replace these documents.

- State material assumptions, make the smallest approved change, and verify the result.
- Read [encoding safety](docs/policies/encoding-safety.md) before encoding-sensitive edits; use `apply_patch` for manual text changes.
- Before broad code reading, use graphify when the repository graph exists. Graph results guide exploration only; run `graphify update .` after code changes.
- Browser-visible work requires Playwright verification and [the dev-server procedure](docs/operations/dev-server-and-capture.md).
- Follow [delivery and completion](docs/policies/verification/delivery-and-completion.md) for finish, commit, push, or PR requests.

## When to write a spec, plan, and status file

Always follow the [spec/plan/status format](docs/policies/spec-plan-status-format.md) when the user explicitly asks for a spec, design doc, or implementation plan — regardless of the criteria below.

Otherwise, follow it if **two or more** of these apply:
- Estimated time 1 hour+
- 10+ files to touch or explore
- 3+ independent work units
- Both backend and frontend (or multiple domains)
- New API endpoint, DB schema, or directory structure
- Unlikely to finish in one session
- Security, auth, payments, or migrations
- Context utilization already at 40%+

If none or only one applies, treat the work as light: proceed with a short prompt, no spec/plan/status. When it does apply, get the design approved in conversation first, then write the spec, plan, and status file.

## Delegation: main agent vs. subagent

Do directly in the main agent:
- Changes under 5 minutes or 3 tool calls
- Integration points: route registration, prop wiring, shared hook/store definitions, cron/scheduler registration
- Rapid debug loops (error → one-line fix → rerun)
- Exploratory or fuzzy work without crisp success criteria
- Files already in context
- Decision-making work
- Security- or operations-critical changes

Delegate to a subagent if any apply:
- 10+ files to explore or review
- 3+ independent work units (parallelization value)
- Search/log/code-review results the main agent will use once and discard
- Domain reviews (security, performance, UX, spec compliance)
- Objective verification needed to counter familiarity bias
- A single subagent task takes 30+ minutes or edits 5+ files

Cost awareness: each subagent pays roughly 20k tokens of cold-start overhead. Do not delegate when overhead exceeds the cost of doing it directly. Never delegate a one-line change.

Do not: split sequentially-dependent work across subagents where each step needs the previous step's full output; run concurrent edits to the same file from multiple subagents; delegate integration points; quote a subagent's body output verbatim into the main reply.

Integrating subagent results: specify a result-summary limit in the brief (e.g. "report in under 500 chars"); verify with diffs and test results only, not by re-reading the body; confirm "done" claims against actual code/test evidence, not the summary; state the write set explicitly (e.g. "edits only under `backend/src/processors/`").
