# Spec, plan, and status document format

Back to the [policy index](index.md). This document defines *how to write* and *how to carry across sessions* the spec, plan, status, and review evidence. For *when* to use this workflow and whether to delegate to a subagent, see the entrypoint (`AGENTS.md` / `claude.md`). This format is this project's own — self-contained, no dependency on an external skill for spec/plan authoring.

## Applies when

Writing or updating a file under `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/superpowers/status/`, or `docs/superpowers/reviews/`.

## Does not apply when

Deciding whether the workflow is warranted at all — see "When to write a spec, plan, and status file" in `AGENTS.md` / `claude.md`. Short single-session work skips all three documents.

## Planning mode, baseline, and source freeze

When this workflow applies and the host provides an explicit Plan or read-only mode, enter it before repository investigation and planning. If the host has no such mode, enforce the same boundary manually: exploration is read-only, and source, test, configuration, and generated files are not changed while planning.

Immediately after entering that boundary, re-read the task packet, policy index, this policy, and relevant `Architecture.md` sections. Inspect existing reusable code before choosing files, modules, dependencies, or interfaces. Record in status the review time, policy manifest, available spec/plan hashes, repository HEAD, relevant-path fingerprint, and relevant dirty paths; use `not yet created` for a document that does not exist and update it when created. Plan mode prevents premature writes; it is not evidence that a spec or plan is complete.

The task packet comprises spec, plan, one-page status, and preserved review evidence under `docs/superpowers/reviews/`; these are the only planned writes before implementation. First align the design direction with the user in conversation, then write and review a Draft spec, obtain explicit spec approval, draft and review the plan, and obtain explicit plan approval. Leaving Plan mode only to save task-packet documents does not authorize implementation.

The policy manifest is the four individual SHA-256 hashes of `AGENTS.md`, `claude.md`, `docs/policies/index.md`, and this file. Repository HEAD is context only, so an unrelated commit does not invalidate review.

The relevant-path manifest includes every existing file inspected or relied on and every planned Create/Modify/Test/Verify path, including source, tests, config, `Architecture.md`, scripts, assets, manifests/lockfiles, and verification files. Exclude the mutable active status file; validate its current gate, approvals, baselines, and review links separately. Serialize the manifest as UTF-8 without BOM, one LF-terminated record `<repo-relative-path>\t<SHA256-or-MISSING>`, with `/` separators, Unicode NFC, repository/planned case preserved, and ordinal UTF-8-byte path order. Use `MISSING` for a planned path that does not exist. The relevant-path fingerprint is the SHA-256 of those exact manifest bytes; preserve the manifest in review evidence.

Source changes may begin only when status says **Approved — ready to implement**, approval evidence is present, the policy/spec/plan hashes and supporting spec/plan/integration/domain review hashes match, and the relevant-path fingerprint has no material mismatch. Check this once when transitioning to **Implementing**. During implementation, planned write-set changes do not invalidate the original fingerprint; continue only while those policy/spec/plan/review hashes remain stable and no relevant change appears outside completed or in-progress plan steps. An unexplained or unplanned relevant change stops implementation for plan revalidation.

---

## 1. Spec — `docs/superpowers/specs/<date>-<topic>.md`

Preserved once approved. The spec is the sole source of truth for what the product must do, why, and every material user-affecting decision. Align the design direction with the user before writing it; do not invent a design in a file and ask for approval afterward. Write the aligned result as Draft, run the specification completeness review below, then obtain explicit approval. If an approved outcome must change, leave the approved file intact and create `<date>-<topic>-revN.md` with `Supersedes` and `Change reason` fields, then obtain approval for the revision.

```markdown
# Spec: <Topic>

**Status:** Draft | Approved
**Created:** YYYY-MM-DD

## Problem / Goal
[What's broken, missing, or needed. Why this is worth doing now.]

## Requirements
- FR-001: System/feature MUST [specific, testable capability]
- FR-002: ...

Mark anything unresolved inline: `FR-00N: ... [NEEDS CLARIFICATION: <what's missing>]` — never guess silently on a requirement that changes scope.

## User-visible State and Failure Matrix
| Situation | Required user-visible behaviour |
|---|---|
| Initial/default state | |
| Loading | |
| Data available | |
| No matching data | |
| Partial data | |
| Request failure | |
| Stale or late response | |
| User changes time/filter/selection | |
| Feature disabled and re-enabled | |
| Recovery after failure | |

Complete every applicable row. Use `N/A — <reason>` only when it does not apply.

## Non-Goals (out of scope)
- [What this explicitly will not do, to prevent scope creep later]

## Success Criteria
- SC-001: [Measurable, technology-agnostic outcome]

## Implementation Freedoms
- [A bounded choice the implementation plan may make without another spec approval]
- [Internal names, private representation, or behaviour-equivalent algorithm choices as applicable]

## Alternatives Considered
| Option | Trade-off | Why not chosen |
|---|---|---|

Omit this section for small, single-approach changes — it earns its place only when a real alternative was on the table.

## Open Questions
- [Anything still unresolved at write time]
```

Before approval, the spec must settle target user and outcome; visible capabilities and interactions; defaults, limits, and accepted/rejected input; states and transitions; loading, empty, unavailable, partial-failure, and recovery behaviour; user-facing time and units; persistence, sharing, privacy, and security; accessibility and responsive behaviour; compatibility or migration expectations; acceptance criteria; non-goals; and prohibited uses.

An omitted user-affecting decision is not automatically an implementation freedom. The spec must decide it or explicitly delegate a bounded choice. The spec must not prescribe files, functions, private schemas, algorithms, or task order unless the technology itself is an approved product constraint.

**Self-review before review:** no placeholders (`TBD`, `TODO`), no material open question, no contradictions between requirements/non-goals/success criteria, every requirement traceable to a success criterion, and every delegated implementation freedom bounded.

### Specification completeness review — before approval

Use a fresh reviewer that is read-only with respect to repository content; the spec author must not approve its own spec. The reviewer returns the report, and the coordinating agent saves that report as review evidence without changing its verdict or findings. Finding one gap does not end the review. Complete every dimension and return one consolidated finding set:

1. Problem, target user, and intended outcome.
2. Functional requirements and prohibited uses.
3. Defaults, limits, and accepted/rejected input.
4. User-visible states and transitions.
5. Loading, empty, failure, partial-failure, and recovery behaviour.
6. Timezone, units, and time-selection semantics.
7. Persistence, privacy, sharing, and security.
8. Accessibility and responsive behaviour.
9. Compatibility and migration.
10. Success criteria and requirement traceability.
11. Non-goals and internal contradictions.
12. Implementation freedoms explicitly delegated to the plan.

Save the full review under `docs/superpowers/reviews/<date>-<topic>-spec-review-N.md`; status records only baseline, verdict, and link.

The result is exactly one of:

- **PASS:** every material user-affecting decision is settled; the spec may be presented for explicit approval.
- **DECISION GAP:** list every presently discoverable missing user-affecting decision and its impact; resolve them with the user, revise, and re-run the entire review.
- **SCOPE CONFLICT:** list every contradiction between requirements, non-goals, success criteria, or prohibited uses; resolve and re-run the entire review.

Do not approve a spec with a material open question. Do not impose an arbitrary output-length limit on this review.

## 2. Plan — `docs/superpowers/plans/<date>-<topic>.md`

Decision-complete and preserved once approved. Breaks the spec into ordered, file-level tasks. Assume the implementer (human or agent) has zero context beyond this document and the linked spec.

The plan must settle every material implementation choice: exact file/module ownership, reuse versus new code, function/type contracts, data and state flow, success/error/edge behaviour, task order, and verification. Implementation may retain only code-local choices that cannot change behaviour, contracts, architecture, security, accessibility, or scope, such as local variable names, equivalent expressions, and formatting.

### Specification-plan ownership boundary

The spec owns product decisions; the plan owns technical execution. Every user-affecting behaviour in the plan must reference an approved spec requirement or a bounded Implementation Freedom. Every spec requirement must map to at least one implementation task and one distinguishing verification assertion. The plan may repeat a requirement only as a short traceability reference; the spec remains normative.

If the plan introduces an unauthorized user-affecting choice, return **DECISION GAP** to the spec instead of inventing a default. If the plan contradicts the spec, the spec wins. Use **PLAN GAP** when the correction is purely technical and **DECISION GAP** when user input or a product decision is required.

```markdown
# Plan: <Topic>

**Status:** Draft | Approved
**Spec:** docs/superpowers/specs/<file>.md
**Goal:** [one sentence — what this builds]

## Planning Baseline
- Policy manifest: <AGENTS.md hash; claude.md hash; index.md hash; this-policy hash>
- Spec hash: <hash>
- Repository HEAD: <hash>
- Relevant-path fingerprint: <manifest hash and path list>
- Relevant dirty paths: <paths or none>
- Investigated at: YYYY-MM-DD HH:MM TZ

## Global Constraints
[Project-wide requirements from the spec that every task must honor — version floors, naming rules, platform limits. One line each.]

## Decision and Contract Ledger
| Boundary | Exact decision and evidence |
|---|---|
| Existing capability reuse | Existing modules/dependencies inspected; reuse, extraction, or replacement decision |
| Function/type contract | Exported names, parameters, return shape, ownership |
| Persisted/public data | Full schema, filenames, versioning, compatibility, cache policy |
| Custom binary format | Magic/version, offsets, widths, endianness, sentinels, exact length |
| Time/unit/coordinates | Timezone, units, projection, resampling, conversion formulas |
| Failure/concurrency | Errors, retries, cancellation, stale responses, locking, partial failure |
| Storage/publication | Atomic-write unit, last-good preservation, retention, cleanup order |
| UI state | Defaults, transitions, missing data, layer order, accessibility |
| Verification | Exact command, test file, scenario, expected assertion |

Complete every applicable row. Use `N/A — <reason>` only when it does not apply.

---

## Task 1: <Component name>

**Files:**
- Create: `exact/path/to/file.ext`
- Modify: `exact/path/to/existing.ext:120-145`
- Test: `exact/path/to/test.ext` (if applicable)

**Interfaces:**
- Consumes: [exact function/type names this task uses from an earlier task]
- Produces: [exact function/type names later tasks will call — this is how neighboring tasks agree on a contract without reading each other]

- [ ] Step 1: [smallest concrete action — actual code/command, not a description]
- [ ] Step 2: ...
- [ ] Step 3: Verify — run `<command>`, expect `<result>`
- [ ] Step 4: Commit

## Task 2: <Component name>
...

## Specification-Plan Traceability
| Spec requirement | User behaviour fixed by spec | Plan task | Verification assertion |
|---|---|---|---|
| FR-001 | | | |
```

**No placeholders.** Every step must be executable without making a new material decision. Name exact files, exported functions/types, request/response schemas, data formats, units, timezones, coordinate transformations, state transitions, error/retry/cancellation behaviour, atomicity boundaries, verification commands, and expected assertions. `Consumes: metadata` or another nouns-only interface is insufficient; give an exact signature, schema, or contract-ledger reference. Use pseudocode or a focused code fragment only for complex or easily misunderstood logic; do not duplicate complete production function bodies in the plan. Never write "add appropriate error handling," "similar to Task N," or "write tests for the above" without stating exact cases and assertions.

**Self-review before showing the user:** every spec requirement maps to a task (list gaps if not), no placeholder scan hits, and types/names used in later tasks match what earlier tasks actually produced.

### Exhaustive decision completeness review — before approval and implementation

Run this review after drafting the plan and before asking for final plan approval. Use a fresh reviewer that is read-only with respect to repository content; the plan author must not approve its own plan. The reviewer returns the report, and the coordinating agent saves it as review evidence without changing its verdict or findings. The reviewer reconstructs the checklist from the current policies, approved spec, actual repository, and relevant `Architecture.md`; the plan's own checklist may support but never narrow the review.

Finding one gap does not end the review. Complete every dimension and return one consolidated set of all presently discoverable gaps:

1. Specification traceability and absence of unauthorized product decisions.
2. Repository facts and existing-capability reuse.
3. Function, type, schema, binary, and API contracts.
4. Time, unit, coordinate, resampling, and conversion contracts.
5. Error, retry, concurrency, cancellation, stale-response, and recovery behaviour.
6. Storage, atomic publication, last-good preservation, retention, and cache behaviour.
7. UI state, accessibility, layer order, and responsive behaviour.
8. Test executability and requirement-to-assertion coverage.
9. Cross-task naming, ownership, order, and producer/consumer consistency.
10. Status, approval, baseline, and revision-state consistency.

A decision is user-affecting when changing it changes visible or interactive behaviour; defaults, limits, accepted/rejected input, or error behaviour; storage, sharing, transmission, privacy, or security; time, state transitions, recovery, accessibility, or completion criteria.

The result is exactly one of:

- **PASS:** executable without new material decisions and only translates approved spec decisions into technical work.
- **PLAN GAP:** list every presently discoverable missing technical detail and impact; revise without changing product behaviour, then run the complete review again.
- **DECISION GAP:** list every presently discoverable missing or unauthorized user-affecting decision and impact; do not invent a default or begin implementation.

On **DECISION GAP**, revise and re-approve the spec, regenerate the affected plan, and run the complete plan review again. Do not impose an arbitrary output-length limit on a completeness review.

For plans spanning three or more technical domains, run independent domain reviews before the final integration review—for example backend/storage/API; frontend state/async; UI/accessibility/browser; and architecture/integration. Consolidate all domain findings before editing; do not repair domains serially between reviews.

### Re-review and repeated failure

After correcting **PLAN GAP**, verify every previous finding, inspect contracts introduced by the correction, and re-run the entire matrix from the beginning. Do not review only changed paragraphs or prior findings.

A second consecutive **PLAN GAP** is a process warning. Before a third review, stop patching findings one by one, discard the previous reviewer context, use a fresh reviewer, and run the complete matrix from scratch. If the third review still returns **PLAN GAP**, stop automatic correction and keep the gate at **Plan PLAN GAP**. Record why later gaps were missed and choose exactly one recovery path before a new review cycle: obtain user approval for reduced/repartitioned scope and create a new task packet, or run an independent architecture review and incorporate its consolidated findings into the current plan. Do not split a single approved work unit into multiple independently gated plans, and do not continue an open-ended fix-one-gap/review-again loop.

### Review record and PASS invalidation

Save each full plan review under `docs/superpowers/reviews/<date>-<topic>-plan-review-N.md`. It records reviewer, review role/domain, review time, policy manifest, routed policies and hashes, completed matrix dimensions with evidence, spec/plan hashes, repository HEAD, relevant-path manifest/fingerprint and dirty paths, inspected source files, input domain-review paths/hashes, result, and consolidated findings. A final integration review recomputes its canonical relevant-path manifest from the current union of every input domain manifest; it does not merely copy their digests. Status stores only the verdict, matching baseline, and review-file paths/hashes so it remains one page.

Exclude status-only edits from relevant dirty-path invalidation. Before implementation, a previous **PASS** is invalid when plan/spec content, any policy-manifest hash, either supporting spec or plan/integration review hash, or any input domain-review hash changes; any required review file is missing; the final union relevant-path fingerprint has a material mismatch; a referenced interface/dependency/file/verification path changes; or status cannot unambiguously identify the current plan and gate. Changing only `**Status:** Draft` to `**Status:** Approved` after explicit user approval does not invalidate the content review; record the approved file's new hash in status. Any other content change invalidates PASS. During implementation, use the continuation rule above so expected planned writes do not invalidate execution. A repository-only mismatch requires plan revision and re-review; a user-affecting change requires spec revision and approval first.

### Approved-plan changes

Never silently rewrite an approved plan.

- A syntax-level or equivalent code-local difference that does not change behaviour, contracts, architecture, security, accessibility, or scope may be handled during implementation without revising the plan.
- If a repository fact invalidates a planned file, interface, dependency, or task order, stop implementation and correct the plan. Preserve the approved file and create `<date>-<topic>-revN.md` with `Supersedes` and `Change reason` fields, obtain approval, update the status file's Plan link, and run the completeness review again.
- If the required correction changes user-visible behaviour, scope, defaults, error behaviour, storage, privacy, security, accessibility, or completion criteria, revise and re-approve the specification first, then revise the plan.

**Bake in an Architecture.md update.** If the plan creates new files or makes a non-obvious structural change, make updating `Architecture.md`'s File Roles the final task — don't leave it implicit.

**Execution:** once authorized, use `superpowers:subagent-driven-development` or `superpowers:executing-plans` when that capability is available and user-approved. If unavailable, execute inline task-by-task with the same status updates, verification commands, review checkpoints, and stop conditions; the workflow must not depend on an external skill.

## Review evidence — `docs/superpowers/reviews/<date>-<topic>-<kind>-review-N.md`

Preserved evidence for exhaustive spec or plan reviews. It may exceed one page and must contain the complete consolidated findings rather than a summary. Use `kind` = `spec` or `plan`.

```markdown
# <Topic> <Spec|Plan> Review N

- Reviewer: <identity/session>
- Review role/domain: <spec | backend/storage/API | frontend/async | UI/accessibility/browser | architecture/integration | other>
- Reviewed at: YYYY-MM-DD HH:MM TZ
- Policy manifest: <four path/hash pairs>
- Routed policies: <path/hash pairs>
- Input domain reviews: <path/hash pairs, or N/A>
- Spec hash: <hash or not yet created>
- Plan hash: <hash or not yet created>
- Repository HEAD: <hash>
- Relevant-path manifest: <canonical records inline; integration review uses the recomputed current union of all domain manifests>
- Relevant-path fingerprint: <manifest SHA-256>
- Relevant dirty paths: <paths or none>
- Inspected files: <paths>
- Completed matrix dimensions: <each required dimension plus evidence>
- Result for kind=spec: PASS | DECISION GAP | SCOPE CONFLICT
- Result for kind=plan: PASS | PLAN GAP | DECISION GAP

## Consolidated Findings
- <all findings after the complete matrix, or none>
```

Include exactly one kind-appropriate Result line and remove the other. Do not truncate this file to satisfy status's one-page limit. A later review gets a new `review-N` file; never rewrite a review that supported an approval or implementation gate.

## 3. Status — `docs/superpowers/status/<topic>.status.md`

Mutable. Cross-session handoff only — never routine intra-task progress. It must stay at or below 80 nonblank lines and 10 KiB UTF-8; exceeding either limit means review detail belongs in `docs/superpowers/reviews/` or the work unit needs user-approved repartitioning.

```markdown
# <Topic> Status

Updated: YYYY-MM-DD HH:MM KST
Spec: docs/superpowers/specs/<file>.md
Plan: docs/superpowers/plans/<file>.md
Current gate: Spec Draft | Spec DECISION GAP | Spec SCOPE CONFLICT | Spec PASS — awaiting approval | Spec Approved | Plan Draft | Plan PLAN GAP | Plan DECISION GAP — return to spec | Plan PASS — awaiting approval | Approved — ready to implement | Implementing | Complete

## Current Baseline
- Baseline reviewed at: YYYY-MM-DD HH:MM TZ
- Policy manifest: <AGENTS.md hash; claude.md hash; index.md hash; this-policy hash>
- Spec hash: <hash>
- Plan hash: <hash>
- Repository HEAD: <hash>
- Relevant-path fingerprint: <manifest hash; full manifest is in the linked review evidence>
- Relevant dirty paths: <paths or none>
- Supporting spec review: <path and SHA-256>
- Supporting plan/integration review: <path and SHA-256>

## Approvals
- Spec approved by: <user identity or pending>
- Spec approved at: <timestamp or pending>
- Approved spec hash: <hash or pending>
- Plan approved by: <user identity or pending>
- Plan approved at: <timestamp or pending>
- Approved plan hash: <hash or pending>

## Resume Point
- Last completed: <Task N Step M, commit hash>
- Next: <Task N+1 Step 1, or the next concrete action>

## Verified
- <command run + result>
- <review verdict, matching baseline, and docs/superpowers/reviews/... link>

## Unverified / Skipped
- <what hasn't been checked yet, and why it's safe to defer>

## Deviations from Plan
- <what differs from the plan, and why>

## Failed Attempts
- <what was tried and abandoned, so it isn't retried next session>

## Plan Revisions / Decisions Escalated
- <replacement plan and reason, or a decision escalated before implementation continued>
```

Omit sections with nothing to report rather than leaving them empty. `Failed Attempts` is the one section worth erring toward over-including — it's what prevents a fresh session from repeating a dead end.

`Current gate` is the status authority, but **Approved — ready to implement** is valid only when approval evidence is present and the current policy manifest, approved spec/plan hashes, supporting spec review path/hash, supporting plan/integration review path/hash, all input domain-review hashes, and final union relevant-path fingerprint satisfy the pre-implementation baseline rule above. Transition to **Implementing** records that check; a valid **Implementing** gate authorizes only remaining approved plan steps while those hashes stay fixed and every relevant change is attributable to a completed or in-progress plan step. Historical results remain evidence only and cannot override a stale or invalid gate.

**Session start:** first read status:
```
Read docs/superpowers/status/<topic>.status.md first, then continue from its Resume Point.
```
Before continuing an **Implementing** gate, recompute the policy manifest, spec/plan hashes, supporting spec/plan/integration/domain review hashes, and current relevant-path state. Confirm each relevant change is attributable to a completed or in-progress approved step; otherwise stop for plan revalidation. For earlier gates, revalidate the baseline before advancing it. The spec and plan carry every constraint; don't repeat them in the prompt.

**Session end:** always update `Updated` and `Resume Point` before ending. On a context-compaction warning, do this immediately and start a new session rather than pushing further.

**Lifetime:** on completion or abandonment, move to `docs/superpowers/status/archive/` — never delete. More than five active status files is a cleanup signal.

---

## Maintenance

When this format changes, update every file that references spec/plan/status authoring in the same change: `AGENTS.md`, `claude.md`, and [the policy index](index.md).
