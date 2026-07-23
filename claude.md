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

When this workflow applies, use the host's explicit Plan/read-only mode before repository investigation and planning when available. Otherwise enforce the same read-only boundary manually. Immediately after entering it, re-read the task packet, policy index, [spec/plan/status format](docs/policies/spec-plan-status-format.md), and relevant `Architecture.md` sections; inspect existing reusable code before choosing files or interfaces; and record the policy-manifest hashes defined by that policy, available spec/plan hashes, repository HEAD, relevant-path fingerprint, relevant dirty paths, and review time in status (`not yet created` for a document that does not exist, then update it when created). Plan mode is a write boundary, not evidence of completeness.

The specification owns product decisions: user-visible behaviour, defaults, limits, states, failures, time/unit meaning, accessibility, scope, and acceptance criteria. The plan owns technical execution: reuse, files, functions/types, schemas, algorithms, concurrency, atomicity, and verification. A plan may not invent a user-affecting decision absent from the approved spec or its explicitly bounded implementation freedoms.

Do not change source, tests, configuration, or generated files until the current spec is approved, the current plan is approved, an independent exhaustive completeness review records **PASS**, and status says **Approved — ready to implement**.

Otherwise, follow it if **two or more** of these apply:
- Estimated time 1 hour+
- 10+ files to touch or explore
- 3+ independent work units
- Both backend and frontend (or multiple domains)
- New API endpoint, DB schema, or directory structure
- Unlikely to finish in one session
- Security, auth, payments, or migrations
- Context utilization already at 40%+

If none or only one applies, treat the work as light: proceed with a short prompt, no spec/plan/status. When it does apply, align the design direction in conversation, write and exhaustively review the Draft spec, obtain explicit spec approval, then draft and exhaustively review the plan, obtain explicit plan approval, and maintain status throughout.

Before executing an implementation plan, run the specification and plan reviews defined in [spec/plan/status format](docs/policies/spec-plan-status-format.md). Reviewers must finish every review dimension and return one consolidated finding set rather than stopping at the first failure. A **PLAN GAP** requires a corrected plan and complete re-review; a **DECISION GAP** returns to the spec and user approval. After two consecutive PLAN GAP results, use a fresh review context and full matrix before a third review. If the third review still returns PLAN GAP, stop the automatic loop and record one recovery path—user-approved reduced/repartitioned scope with a new task packet, or independent architecture review—before starting a new review cycle.

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

Integrating subagent results: for ordinary research or execution, specify a concise result-summary limit; verify with diffs and test results only, not by re-reading the body; confirm "done" claims against actual code/test evidence, not the summary; state the write set explicitly (e.g. "edits only under `backend/src/processors/`"). Do not impose an arbitrary length limit on specification or plan completeness reviews; they must report every presently discoverable gap after completing the full matrix.
