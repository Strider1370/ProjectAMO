# Long Context Handoff Policy

Back to the [policy index](index.md).

## Applies when

Two or more lifecycle trigger criteria below apply, or work needs a cross-session handoff.

## Does not apply when

Short, single-boundary work that meets zero or one trigger criterion.

## Re-check trigger

Re-check when scope reaches another boundary, context use reaches 40%, or work changes from design to implementation.

Procedure for tasks that span multiple sessions or risk context compaction. Do not apply to short tasks.

This policy covers **when** to invoke the heavy workflow and **how** to carry work across sessions. Use the supported project workflow to approve a design/spec, write an implementation plan, then execute it with the applicable execution skill.

---

## 1. Trigger Criteria

Follow this policy if **two or more** of the following apply:

- Estimated time 1 hour+
- 10+ files to touch or explore
- 3+ independent work units
- Both backend and frontend (or multiple domains)
- New API endpoint, DB schema, or directory structure
- Unlikely to finish in one session
- Security, auth, payments, or migrations
- Context utilization already at 40%+

If none or only one applies, treat the work as **light** and proceed with a short prompt. This policy does not apply.

## 2. Document Layout

| Document | Location | Nature |
|---|---|---|
| Spec | `docs/superpowers/specs/<date>-<topic>.md` | Immutable. What/why/scope/anti-scope. |
| Plan | `docs/superpowers/plans/<date>-<topic>.md` | Immutable. Task 1..N with TDD steps. |
| Status | `docs/superpowers/status/<topic>.status.md` | **Mutable. Under one page. Cross-session handoff only.** |

The approved design/spec and implementation plan define the work; this policy adds the **status file**.

## 3. Status File Standard

`docs/superpowers/status/<topic>.status.md` must stay under one page. If it grows beyond that, the work unit is too large — split the plan into phases.

```markdown
# <Topic> Status

Updated: YYYY-MM-DD HH:MM KST
Spec: docs/superpowers/specs/<file>.md
Plan: docs/superpowers/plans/<file>.md

## Resume Point
- Last completed: <Task N Step M, commit hash>
- Next: <Task N+1 Step 1 or next action>

## Verified
- <test or verification command + result>

## Unverified / Skipped
- <items not yet verified>

## Deviations from Plan
- <what differs from the plan and why>

## Open Decisions Resolved Mid-Implementation
- <decisions deferred in the plan and resolved during implementation>
```

Omit entire sections rather than leaving them empty.

## 4. Session Lifecycle

### 4.1 Session Start
A new session prompt only needs two lines:

```
Read docs/superpowers/status/<topic>.status.md first,
then continue from its Resume Point.
```

The design, tasks, and constraints live in the spec/plan that the status file points to. Do not repeat them in the prompt.

### 4.2 During the Session
- Append one line to status at every meaningful milestone (task completion, important decision, partial verification).
- Do not touch status for routine intra-task progress — keep the flow uninterrupted.
- Status updates are a main-agent self-action, not a user check-in.

### 4.3 Before Ending the Session
- **Always update Resume Point and the Updated timestamp.**
- Never end without updating status.
- On a context-compaction warning, update status immediately and start a new session.

## 5. Main Agent vs Subagent

### 5.1 Do Directly in the Main Agent

- Changes under 5 minutes or 3 tool calls
- Integration points: `backend/server.js` route registration, `MapView.jsx` prop wiring, `Architecture.md`, shared hook/store definitions, cron/scheduler registration
- Rapid debug loops (error → one-line fix → rerun)
- Exploratory or fuzzy work without crisp success criteria
- Files the main agent already has in context
- Decision-making work
- Security- or operations-critical changes

### 5.2 Delegate to a Subagent

Candidate for delegation if **any** of the following apply:

- 10+ files to explore or review
- 3+ independent work units (parallelization value)
- Search/log/code-review results the main will use once and discard
- Domain reviews (security, performance, UX, spec compliance)
- Objective verification needed to counter familiarity bias
- A single subagent task takes 30+ minutes or edits 5+ files

### 5.3 Cost Awareness

- Each subagent pays roughly 20k tokens of cold-start overhead.
- Do not delegate when overhead exceeds the cost of doing it directly.
- Never delegate a one-line change to a subagent.

### 5.4 Delegation Anti-Patterns (do not)

- Sequentially dependent work where each step needs the previous step's full output
- Concurrent edits to the same file from multiple subagents
- Delegating integration points
- Quoting a subagent's body output verbatim into the main (defeats the purpose of summarization)

### 5.5 Integrating Subagent Results

- Specify a result-summary limit in the brief (e.g. "report in under 500 chars" or "bullets only").
- Verify with diffs and test results only; do not re-read the body.
- Confirm "done" claims with actual code/test evidence — trust the artifact, not the summary.
- State the write set explicitly (e.g. "edits only under `backend/src/processors/`").

## 6. Context Utilization Monitoring

| Utilization | Action |
|---|---|
| Start 40%+ | Reconsider invoking heavy workflow; a new session is usually better. |
| 60% | Warning. Reconsider any large delegation. Do not start a new large task. |
| 70% | Finish only the current task. Prepare to update status. |
| 80% | Auto-compaction imminent. Update status now and switch to a new session. |

## 7. Subagent Execution via Superpowers

Once the spec and plan are ready, run `superpowers:subagent-driven-development` or `superpowers:executing-plans`. This policy does not redefine that execution model (fresh subagent per task, two-stage review, TDD RED-GREEN-REFACTOR).

What this policy adds on top:
- Ensure a status file exists before starting execution.
- Append one line to status after each completed task.
- Confirm Resume Point before ending the session.

## 8. Self-Diagnostic Signals (switch to a new session)

If any of these appear, update status and propose a new session.

- The same file read 3+ times
- Context-compaction warning
- Main responses becoming vague or losing detail
- Long command output that floods context
- A clear phase transition (design → implementation, Task N done → Task N+1)
- The user pivots to an unrelated task

## 9. Architecture.md Updates

When new files or non-obvious structural changes ship under this policy, end the work with an `Architecture.md` File Roles update task. Bake "Update Architecture.md" into the final Task of the plan so it is not forgotten.

## 10. Status File Lifetime

- On completion or explicit abandonment: move the status file to `docs/superpowers/status/archive/`; never delete it as routine cleanup.
- More than five active status files is a cleanup signal. Audit them.

---

## Appendix: Relationship with Superpowers

| Area | Superpowers | This policy |
|---|---|---|
| Spec/plan authoring | Core workflow | Defers |
| Subagent execution | Fresh subagent + two-stage review | Defers |
| TDD RED-GREEN-REFACTOR | Enforced during execution | Defers |
| When to invoke the workflow | Not specified | **§1 defines triggers** |
| Cross-session continuity | Single-session assumption | **§3, §4 add status file** |
| Context utilization monitoring | Not specified | **§6 adds thresholds** |
| Delegation cost criteria | Not specified | **§5.3 adds 20k cold-start** |

This policy does not replace Superpowers. It only adds **when to invoke it** and **how to carry work across sessions**.
