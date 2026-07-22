# Spec, plan, and status document format

Back to the [policy index](index.md). This document defines *how to write* and *how to carry across sessions* the three documents. For *when* to use this workflow and whether to delegate to a subagent, see the entrypoint (`AGENTS.md` / `claude.md`). This format is this project's own — self-contained, no dependency on an external skill for spec/plan authoring.

## Applies when

Writing or updating a file under `docs/superpowers/specs/`, `docs/superpowers/plans/`, or `docs/superpowers/status/`.

## Does not apply when

Deciding whether the workflow is warranted at all — see "When to write a spec, plan, and status file" in `AGENTS.md` / `claude.md`. Short single-session work skips all three documents.

---

## 1. Spec — `docs/superpowers/specs/<date>-<topic>.md`

Immutable once approved. States what to build and why, not how. Written after the user has approved the design in conversation — never write the file first and ask for approval after.

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

## Non-Goals (out of scope)
- [What this explicitly will not do, to prevent scope creep later]

## Success Criteria
- SC-001: [Measurable, technology-agnostic outcome]

## Alternatives Considered
| Option | Trade-off | Why not chosen |
|---|---|---|

Omit this section for small, single-approach changes — it earns its place only when a real alternative was on the table.

## Open Questions
- [Anything still unresolved at write time]
```

**Self-review before showing the user:** no placeholders (`TBD`, `TODO`), no contradictions between Requirements and Non-Goals, every requirement traceable to a Success Criteria or explicitly out of scope.

## 2. Plan — `docs/superpowers/plans/<date>-<topic>.md`

Immutable once approved. Breaks the spec into ordered, file-level tasks. Assume the implementer (human or agent) has zero context beyond this document and the linked spec.

```markdown
# Plan: <Topic>

**Spec:** docs/superpowers/specs/<file>.md
**Goal:** [one sentence — what this builds]

## Global Constraints
[Project-wide requirements from the spec that every task must honor — version floors, naming rules, platform limits. One line each.]

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
```

**No placeholders.** Every step needs runnable content: real code, real commands, real expected output. Never write "add appropriate error handling," "similar to Task N" (repeat the actual code instead), or "write tests for the above" without the test code.

**Self-review before showing the user:** every spec requirement maps to a task (list gaps if not), no placeholder scan hits, and types/names used in later tasks match what earlier tasks actually produced.

### Decision completeness review — before implementation

Run this review after the implementation plan is written and before code changes begin. Use a fresh, read-only review pass; the plan author must not approve its own plan.

The reviewer determines whether the plan introduces a user-affecting decision that is absent from the approved specification. A decision is user-affecting when changing it changes visible or interactive behaviour; defaults, limits, allowed/rejected input, or error behaviour; storage, sharing, transmission, privacy, or security; time, state transitions, recovery, accessibility, or completion criteria.

For every planned user-affecting behaviour, confirm that the approved specification defines the outcome and that a verification step can distinguish it. The review result is exactly one of:

- **PASS:** the plan only translates approved decisions into implementation work.
- **DECISION GAP:** list each missing decision and its impact. Do not choose a default, repair the plan with an invented decision, or begin implementation.

On **DECISION GAP**, return to the user for a specification change and approval. Regenerate the affected plan, then run this review again. Record a PASS in the feature status file under **Verified** before implementation starts.

**Bake in an Architecture.md update.** If the plan creates new files or makes a non-obvious structural change, make updating `Architecture.md`'s File Roles the final task — don't leave it implicit.

**Execution:** once the plan is approved, implement it task-by-task via `superpowers:subagent-driven-development` (fresh subagent per task, two-stage review — recommended) or `superpowers:executing-plans` (inline, batch execution with checkpoints).

## 3. Status — `docs/superpowers/status/<topic>.status.md`

Mutable. Cross-session handoff only — never routine intra-task progress. Must stay under one page; if it grows past that, the work unit is too large and the plan should be split into phases instead.

```markdown
# <Topic> Status

Updated: YYYY-MM-DD HH:MM KST
Spec: docs/superpowers/specs/<file>.md
Plan: docs/superpowers/plans/<file>.md

## Resume Point
- Last completed: <Task N Step M, commit hash>
- Next: <Task N+1 Step 1, or the next concrete action>

## Verified
- <command run + result>

## Unverified / Skipped
- <what hasn't been checked yet, and why it's safe to defer>

## Deviations from Plan
- <what differs from the plan, and why>

## Failed Attempts
- <what was tried and abandoned, so it isn't retried next session>

## Open Decisions Resolved Mid-Implementation
- <decisions the plan deferred, and how they were resolved>
```

Omit sections with nothing to report rather than leaving them empty. `Failed Attempts` is the one section worth erring toward over-including — it's what prevents a fresh session from repeating a dead end.

**Session start:** a new session needs only:
```
Read docs/superpowers/status/<topic>.status.md first, then continue from its Resume Point.
```
The spec and plan carry every constraint; don't repeat them in the prompt.

**Session end:** always update `Updated` and `Resume Point` before ending. On a context-compaction warning, do this immediately and start a new session rather than pushing further.

**Lifetime:** on completion or abandonment, move to `docs/superpowers/status/archive/` — never delete. More than five active status files is a cleanup signal.

---

## Maintenance

When this format changes, update every file that references spec/plan/status authoring in the same change: `AGENTS.md`, `claude.md`, and [the policy index](index.md).
