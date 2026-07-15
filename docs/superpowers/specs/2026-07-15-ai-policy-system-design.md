# AI Policy System Design

## Goal

Make ProjectAMO's durable AI-facing instructions discoverable from one policy tree without turning every session into a full-document read.

## Scope

- Keep `Architecture.md` as the current codebase map.
- Make `docs/policies/index.md` the policy router.
- Move standing project guidance under `docs/policies/`, using only the purpose-based subfolders that materially reduce routing ambiguity.
- Keep `AGENTS.md` and `claude.md` as thin entrypoints that route to the policy index.
- Absorb the active MapView ownership rule and its brief rationale into an engineering policy; do not retain a standalone ADR for it.
- Preserve design guidance as `docs/policies/design/design-language.md`.
- Identify and document only evidence-backed cross-cutting rules from the existing codebase.
- After verifying active-environment support, register a `SessionStart` hook that injects the bounded routing excerpt from the policy index.

## Non-goals

- Do not rewrite `Architecture.md` into a policy document.
- Do not copy tool-specific skill procedures into project policy.
- Do not promote one-off implementation details, historical plans, or reference material into standing rules.
- Do not change application behavior as part of this documentation reorganization, except the later scoped KIM time bugfix.

## Information Architecture

```text
docs/policies/
  index.md
  engineering/
    data-and-time.md
    map-and-layers.md
    workflow-and-tools.md
  design/
    design-language.md
  verification/
    delivery-and-completion.md
  long-context.md
  encoding-safety.md
```

`index.md` contains the mandatory read matrix: every task reads the architecture overview and the sections relevant to its affected boundary, then reads the policy index. The index identifies any additional architecture sections required for the task. A full architecture-map read is required only for broad architecture work or when the index explicitly requires it. Do not create separate `task-patterns/`, `delivery/`, or `ai/` policy areas, or additional verification policy documents beyond `verification/delivery-and-completion.md`: their durable rules are folded into the files above.

## Policy Admission Rule

A rule belongs in policy only when it is cross-cutting or protects a central boundary, changes implementation behavior, and is supported by repeated code evidence or an explicit project decision. Local implementation detail stays with its module, test, or reference document.

## Proportional Policy Routing

- Policy routing is two-stage: select candidate policies from the user request, then reapply the index before editing if code exploration reveals a different affected boundary.
- Each policy declares `Applies when`, `Does not apply when`, and `Re-check trigger` criteria so routine work can distinguish a true boundary change from a local edit.
- For a routine task, the default read set is the policy index, the relevant `Architecture.md` section, and one matching detailed policy. This is the default, not a requirement to load the whole policy tree.
- When the request is ambiguous, prefer reading up to two plausible policies over silently skipping a relevant one. Do not load unrelated policies by default.
- If the boundary remains materially unclear after scoped exploration, state the candidate policies being applied and ask the user only when the choice changes scope, cost, or behavior.
- The session-start hook injects only the bounded routing excerpt from `docs/policies/index.md`; it does not recursively inject every policy or replace the two-stage judgment.
- Hooks may remind an agent to re-check routing for known file boundaries, but they do not replace the two-stage judgment.

## Context Budget

- `AGENTS.md` and `claude.md` target 20–40 lines each and act only as entrypoints.
- The policy index's SessionStart routing excerpt targets approximately 700 tokens.
- A detailed policy targets approximately 1,200 tokens.
- These are review thresholds, not hard runtime limits. Exceed them only when a concise alternative would omit a necessary durable rule; record the reason in the policy's maintenance change.

## Initial Policy Candidates

- `engineering/workflow-and-tools.md`: assumptions, smallest approved change, verification, documentation updates, code exploration, delegation, skills, plugins, hooks, and temporary-file handling.
- `engineering/data-and-time.md`: UTC storage, source-specific compact-time semantics, parser-boundary normalization, global display timezone, KST/UTC tests, snapshot-store ownership, semantic partial-failure preservation, cache policy selection, and guarded scheduled collectors.
- `engineering/map-and-layers.md`: MapView ownership, idempotent source/layer lifecycle, teardown order, style-replacement resynchronization, and the recurring map task patterns now in `EntryPoints.md`.
- `design/design-language.md`: existing design language, tokens, accessibility, responsive evidence, and proposal-first rules.
- `verification/delivery-and-completion.md`: browser/server/Playwright capture procedure, deployment procedure and evidence, rollback expectations, post-deploy verification, and advisory completion recommendations.
- `long-context.md`: specification, implementation-plan, mutable status-file locations, lifecycle, and archive requirement.
- `encoding-safety.md`: UTF-8-safe editing rules.

## Migration Rules

- Move normative content, not blind copies of source files.
- Maintain compatibility forwarding stubs or update every known reference in the same change.
- Keep `claude.md`, but route it to the same policy index rather than duplicating policy text.
- Delete a source only after its unique rules and inbound references have been accounted for.
- Use UTF-8-safe edits throughout because existing instruction material includes Korean text.
- Before moving a normative document into `docs/policies/`, verify that it is valid UTF-8 and readable in the active agent environment. Repair or replace unreadable text before making it a policy source of truth.

## Policy Maintenance

- When a change adds, moves, deprecates, or materially changes a standing rule, task pattern, decision, design rule, or verification procedure, update `docs/policies/index.md` in the same change.
- Update every affected entrypoint and forwarding reference, including `AGENTS.md`, `claude.md`, task-pattern links, and documented hook references.
- Remove duplicate or superseded guidance only after its replacement and inbound references have been verified.
- The completion recommendation must include this maintenance check whenever the current work changes project guidance or an architecture boundary.

## Audited Corrections Before Migration

- Map ownership policy must describe the current `MapView` exceptions (NOTAM, route preview, ADS-B composition) honestly while prohibiting new feature-owned map logic from accumulating there.
- Replace the inaccurate aviation “WFS” terminology with local GeoJSON terminology and add the NOTAM adapter to the map-sync task pattern.
- Update the architecture map to include the NOTAM frontend feature and live backend domains: auth, db, admin, alerts, me, forecaster, and dev.
- Do not preserve the obsolete route-briefing API draft as implementation guidance; archive it or update it to the live `etd`/`eta` request and composed briefing response contract.
- Treat the unregistered Codex session-start script as inactive until registration support is verified; then register it as `SessionStart` and limit its output to the policy-index routing excerpt. Do not claim it supplies every policy or reaches every subagent independently.
- Preserve `claude.md` as an entrypoint, but remove stale graph-refresh and preview-tool claims that conflict with active Claude configuration.
- Replace the unavailable `superpowers:writing-specs` reference in long-context guidance with the supported project workflow.
- Reconcile the conflicting test credentials and keep only the verified test-instance instruction.
- Archive completed or abandoned status files under `docs/superpowers/status/archive/`; review the currently active files before migration.
- Align design-language token examples with the current token source before treating the constitution as a relocated policy source of truth.

## Work Artifact Lifecycle

- Approved specifications are stored in `docs/superpowers/specs/`.
- Approved implementation plans are stored in `docs/superpowers/plans/`.
- Work that meets the long-context trigger creates a one-page mutable status file in `docs/superpowers/status/` before implementation begins.
- The status file records the current resume point, completed and verified work, the next verification step, and any open decision.
- On completion or explicit abandonment, the implementation plan and status file record that state; the status file is then moved to `docs/superpowers/status/archive/` and is never deleted as routine cleanup.
- The policy index must route long-context, deployment, and completion work to this lifecycle policy.

## Skills, Plugins, and Hooks

- `docs/policies/engineering/workflow-and-tools.md` maps task types to required project documents and applicable skills or plugin capabilities.
- The policy records when a skill, plugin, or custom agent must be used; its detailed procedure remains in the owning `SKILL.md` or plugin definition and is not copied into policy.
- Tool routing never overrides the active agent environment's availability, approval, or safety requirements.
- Policy may require that an agent consult a named document or apply a decision criterion, but execution of a skill, plugin, hook, or external tool follows the active environment's approval and capability rules.
- When a required capability is unavailable or not approved, the agent reports the limitation and uses the policy-compatible fallback.
- `docs/policies/engineering/workflow-and-tools.md` documents each repository hook's trigger, policy it reinforces, and verification procedure.
- Hooks are enforcement aids, not the sole source of a rule: `AGENTS.md`, `claude.md`, and the policy index must still direct the same behavior when a hook is unavailable.
- The migration verifies the currently registered hooks, removes stale routing claims, and registers `SessionStart` automation after confirming support in the active agent environment.
- The `SessionStart` hook reads the policy index's explicitly bounded routing excerpt at runtime and returns it as session context. It must not maintain a copied routing list or recursively load detailed policies.
- If the active environment does not support `SessionStart`, do not register an invented hook event and do not block the document migration. Keep the `AGENTS.md`/`claude.md` fallback route to the policy index, record the unsupported capability in the status file and hooks policy, then continue the remaining migration and verification work.

## Completion Recommendation

- A user request to finish, commit, push, or create a pull request is a completion signal, not automatic authorization to run every closeout task.
- Before the requested Git action, the agent uses the current task context to recommend only the applicable closeout checks; it does not begin a new broad exploration merely to make the recommendation.
- The recommendation identifies applicable verification, documentation synchronization, temporary-file handling, status completion/archive, and deployment checks.
- When the current work changes standing guidance, the recommendation includes policy-index, entrypoint-pointer, and inbound-reference synchronization.
- The agent runs the recommended closeout only after the user accepts it. If the user explicitly asks to skip it, proceed with the requested Git action and record skipped checks in the final report or active status record.
- Mechanical checks may be supported by hooks, but policy/documentation currency remains an agent judgment.

## Success Criteria

- In environments where `SessionStart` support is verified, a new session receives the bounded policy-routing excerpt through that hook; otherwise, `AGENTS.md` and `claude.md` provide the fallback route to `docs/policies/index.md`.
- The policy index identifies the minimum architecture sections required for each task type, so routine work does not require loading the full map.
- Ambiguous requests are routed safely through a request-stage candidate selection and an edit-stage boundary re-check.
- UI, map, time/data, backend collector, encoding, long-context, and browser-verification work each have a clear conditional read path.
- Deployment work has a documented procedure and completion evidence path.
- Long-running work has an explicit spec, plan, status, and completion-record lifecycle.
- Skill, plugin, and hook selection has one project policy route without duplicating tool-owned instructions.
- Completion is consistently recommended from the existing task context before requested finish, commit, push, or pull-request actions.
- No active durable policy body is duplicated between entrypoints, policy, hooks, and legacy documents. Entrypoint pointers and the bounded SessionStart routing excerpt are allowed.
- `Architecture.md` remains a codebase map.
- The KIM time correction can cite the new time-and-data policy and is covered for UTC and KST.
