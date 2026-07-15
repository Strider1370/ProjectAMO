# AI Policy System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered durable guidance with one lean `docs/policies/` tree, thin agent entrypoints, and an optional bounded SessionStart routing hook.

**Architecture:** `docs/policies/index.md` is the router. Routine work reads the index, the relevant `Architecture.md` section, and one detailed policy; ambiguity permits two. `AGENTS.md` and `claude.md` only point to this system. SessionStart, when supported, injects the marked routing excerpt and never full policy text.

**Tech Stack:** Markdown, Git, Node.js, PowerShell, Codex hooks.

## Global Constraints

- Create only this policy tree: `engineering/{workflow-and-tools,data-and-time,map-and-layers}.md`, `design/design-language.md`, `verification/delivery-and-completion.md`, `long-context.md`, `encoding-safety.md`, and `index.md`.
- Do not create `ai/`, `task-patterns/`, `delivery/`, or extra verification policy documents.
- `AGENTS.md` and `claude.md` target 20–40 lines; the routing excerpt targets about 700 tokens; a detailed policy targets about 1,200 tokens. These are review thresholds, not parser-enforced limits.
- Preserve application behavior. This work changes guidance, documentation, and hook configuration only.
- Use `apply_patch` for edits. Never use PowerShell redirection, `Set-Content`, or `Out-File` for UTF-8 files.
- Do not copy tool-owned skill or plugin procedures into policy. Keep only ProjectAMO routing, constraints, and verification rules.
- Do not stage or revert unrelated dirty-worktree files.

---

## File Structure

```text
docs/policies/
  index.md
  engineering/
    workflow-and-tools.md
    data-and-time.md
    map-and-layers.md
  design/design-language.md
  verification/delivery-and-completion.md
  long-context.md
  encoding-safety.md
```

`Architecture.md` remains the codebase map. Operational command references remain in `docs/dev-server-and-capture.md`, `docs/operations.md`, `docs/aws-ec2-manual-deploy.md`, and `deploy/README.md`; policy links to them instead of copying commands.

### Task 1: Freeze the migration inventory

**Files:**
- Modify: `docs/superpowers/status/ai-policy-system.status.md`
- Read: `AGENTS.md`, `claude.md`, `EntryPoints.md`, `Architecture.md`, `docs/adr/0001-mapview-layer-gravity.md`, `docs/design/design-language.md`, `docs/policies/long-context-handoff.md`, `docs/dev-server-and-capture.md`, `docs/operations.md`, `docs/aws-ec2-manual-deploy.md`, `deploy/README.md`, `docs/briefing-architecture.md`, `docs/superpowers/status/ai-policy-system.status.md`, `.codex/hooks.json`, `.codex/hooks/session-start.ps1`

**Produces:** verified active references and UTF-8-safe migration sources.

- [ ] **Step 1: Record the migration checkpoint.**

  Set the status Resume Point to `Task 1: inventory active inbound references before moving guidance files.`

- [ ] **Step 2: List all active pointers before moving anything.**

  Run:

  ```powershell
  rg -n "EntryPoints\.md|0001-mapview-layer-gravity|design/design-language|long-context-handoff|docs/policies/" AGENTS.md claude.md Architecture.md docs .codex deploy .githooks
  ```

  Expected: every current source and inbound reference is visible.

- [ ] **Step 3: Confirm source files are readable as UTF-8.**

  Run:

  ```powershell
  node -e "const fs=require('fs'); const d=new TextDecoder('utf-8',{fatal:true}); for(const p of ['AGENTS.md','claude.md','EntryPoints.md','Architecture.md','docs/adr/0001-mapview-layer-gravity.md','docs/design/design-language.md','docs/policies/long-context-handoff.md','docs/dev-server-and-capture.md','docs/operations.md','docs/aws-ec2-manual-deploy.md','deploy/README.md','docs/briefing-architecture.md','docs/superpowers/status/ai-policy-system.status.md']) d.decode(fs.readFileSync(p)); console.log('UTF-8 source check passed')"
  ```

  Expected: `UTF-8 source check passed`.

### Task 2: Create the lean policy router and engineering policies

**Files:**
- Create: `docs/policies/index.md`
- Create: `docs/policies/engineering/workflow-and-tools.md`
- Create: `docs/policies/engineering/data-and-time.md`
- Create: `docs/policies/engineering/map-and-layers.md`
- Modify: `docs/policies/encoding-safety.md`

**Produces:** the complete routing surface for workflow, time/data, map/layers, and encoding.

- [ ] **Step 1: Create the marked routing excerpt in `index.md`.**

  Include exactly one block delimited by these markers:

  ```md
  <!-- SESSION-ROUTING:START -->
  # ProjectAMO policy routing

  Read the relevant `Architecture.md` section and this index before editing. For routine work, read one matching detailed policy; if two boundaries plausibly apply, read both and no unrelated policy.

  | Work | Minimum Architecture.md read | Read next |
  | --- | --- | --- |
  | General implementation, tools, delegation, temporary files | `Directory Structure`, `Reference Structure` | `engineering/workflow-and-tools.md` |
  | Timestamps, KMA/KIM data, data contracts, collectors | `File Roles` → `Backend`, `Reference Structure` | `engineering/data-and-time.md` |
  | MapView, Mapbox, overlay, visibility, timeline | `File Roles` → `Frontend` map entries, `Reference Structure` | `engineering/map-and-layers.md` |
  | UI, CSS, responsive layout | `File Roles` → affected frontend feature, `Reference Structure` | `design/design-language.md` |
  | Browser verification, deploy, finish/commit/push/PR | `Directory Structure` → `scripts` and the affected feature's `File Roles` entry | `verification/delivery-and-completion.md` |
  | Long or multi-domain work | every affected boundary's `File Roles` entry | `long-context.md` |

  Read `encoding-safety.md` before encoding-sensitive edits.
  <!-- SESSION-ROUTING:END -->
  ```

  Below the excerpt, add the policy directory map, admission rule, two-stage re-check rule, maintenance rule, and links to all detailed policies. Do not duplicate their policy bodies.

- [ ] **Step 2: Write the workflow policy.**

  `engineering/workflow-and-tools.md` must have `Applies when`, `Does not apply when`, and `Re-check trigger` sections. It owns assumptions, smallest approved change, verifiable goals, graphify-before-broad-reading, scoped delegation, skill/plugin/hook routing, environment approval limits, temporary-file handling, hook documentation, and policy-maintenance checks.

- [ ] **Step 3: Write the data/time policy.**

  Include the following contract verbatim in `engineering/data-and-time.md`:

  ```md
  - Store and compare instants as UTC or epoch values.
  - Interpret compact source times at the parser boundary using the source's documented timezone.
  - Pass the user-selected display timezone to every user-facing formatter.
  - Test UTC and KST output whenever a timestamp display has configurable timezone output.
  ```

  Also fold in snapshot-store ownership, partial-failure preservation, cache selection, and guarded collectors. Do not prescribe a new date library.

  Add `Applies when`, `Does not apply when`, and `Re-check trigger` sections.

- [ ] **Step 4: Write the map/layers policy.**

  State that `MapView.jsx` owns map creation, basemap/style readiness, `styleRevision`, and high-level composition. State that new feature data shaping, persistent sources/layers, interaction handlers, and visibility sync belong in the owning feature adapter/hook. List NOTAM installation/filter/popup, route-preview composition, and ADS-B polling/composition as current transitional exceptions, not templates. Fold the aviation GeoJSON, ADS-B, sidebar-panel, MET overlay, route preview, Mapbox style-sync, and NOTAM map-sync task sequences here; use local GeoJSON terminology, not WFS.

  Add `Applies when`, `Does not apply when`, and `Re-check trigger` sections.

- [ ] **Step 5: Add only policy headers to encoding guidance.**

  Keep the existing UTF-8 safety content and add `Applies when`, `Does not apply when`, `Re-check trigger`, and an index backlink. Do not duplicate workflow rules.

- [ ] **Step 6: Verify the router surface.**

  Run:

  ```powershell
  node -e "const fs=require('fs'); const s=fs.readFileSync('docs/policies/index.md','utf8'); const a=s.indexOf('<!-- SESSION-ROUTING:START -->'),b=s.indexOf('<!-- SESSION-ROUTING:END -->'); if(a<0||b<=a) throw new Error('missing routing markers'); for(const p of ['docs/policies/engineering/workflow-and-tools.md','docs/policies/engineering/data-and-time.md','docs/policies/engineering/map-and-layers.md','docs/policies/encoding-safety.md']) if(!fs.existsSync(p)) throw new Error('missing '+p); console.log('policy router check passed')"
  ```

  Expected: `policy router check passed`.

### Task 3: Migrate design, lifecycle, delivery, and remaining entry sequences

**Files:**
- Move: `docs/design/design-language.md` → `docs/policies/design/design-language.md`
- Move and modify: `docs/policies/long-context-handoff.md` → `docs/policies/long-context.md`
- Create: `docs/policies/verification/delivery-and-completion.md`
- Modify: `docs/policies/engineering/workflow-and-tools.md`, `docs/policies/engineering/data-and-time.md`

**Produces:** one policy source for each remaining durable rule without new folders.

- [ ] **Step 1: Relocate the design constitution.**

  Move it to `docs/policies/design/design-language.md`; update active links. Before treating it as source of truth, reconcile token examples with the actual token source. Keep its design rules intact and add `Applies when`, `Does not apply when`, and `Re-check trigger` sections.

- [ ] **Step 2: Rewrite long-context lifecycle guidance.**

  Preserve trigger criteria and the one-page status template. Replace unavailable `superpowers:writing-specs` references with the supported project workflow. Require completed or explicitly abandoned status records to move to `docs/superpowers/status/archive/`, never routine deletion. Add `Applies when`, `Does not apply when`, and `Re-check trigger` sections.

- [ ] **Step 3: Create the combined delivery policy.**

  `verification/delivery-and-completion.md` must point browser work to `docs/dev-server-and-capture.md` and deployment work to `docs/operations.md`, `docs/aws-ec2-manual-deploy.md`, and `deploy/README.md`. It must define finish/commit/push/PR as advisory closeout signals: use current context, recommend only applicable checks, require user acceptance before extra checks, and record explicitly skipped checks. Add `Applies when`, `Does not apply when`, and `Re-check trigger` sections.

- [ ] **Step 4: Place remaining EntryPoints content by owner.**

  Put backend data-type patterns in `engineering/data-and-time.md`; responsive-layout patterns in `design/design-language.md`; standalone-route, route-briefing payload, developer-console, and test-scenario patterns in `engineering/workflow-and-tools.md`.

- [ ] **Step 5: Verify detailed-policy routing headers.**

  Run:

  ```powershell
  node -e "const fs=require('fs'); for(const p of ['docs/policies/engineering/workflow-and-tools.md','docs/policies/engineering/data-and-time.md','docs/policies/engineering/map-and-layers.md','docs/policies/design/design-language.md','docs/policies/verification/delivery-and-completion.md','docs/policies/long-context.md','docs/policies/encoding-safety.md']) { const s=fs.readFileSync(p,'utf8'); for(const h of ['## Applies when','## Does not apply when','## Re-check trigger']) if(!s.includes(h)) throw new Error(p+' lacks '+h) } console.log('policy header check passed')"
  ```

  Expected: `policy header check passed`.

- [ ] **Step 6: Record source files pending deletion.**

  Run:

  ```powershell
  rg -n "EntryPoints\.md|0001-mapview-layer-gravity|docs/design/design-language\.md|long-context-handoff\.md" AGENTS.md claude.md Architecture.md docs .codex deploy .githooks
  ```

  Expected: active pointers are identified. Do not delete sources in this task; Task 4 updates entrypoints and performs the final deletion check.

### Task 4: Replace entrypoints and correct factual documentation drift

**Files:**
- Modify: `AGENTS.md`, `claude.md`, `Architecture.md`, `docs/briefing-architecture.md`
- Modify only when links drift: `docs/dev-server-and-capture.md`, `docs/operations.md`, `docs/aws-ec2-manual-deploy.md`, `deploy/README.md`
- Move: complete or abandoned records from `docs/superpowers/status/` to `docs/superpowers/status/archive/`
- Delete after entrypoint verification: `EntryPoints.md`, `docs/adr/0001-mapview-layer-gravity.md`

**Produces:** compact entrypoints and accurate active documentation.

- [ ] **Step 1: Make both entrypoints thin routers.**

  `AGENTS.md` and `claude.md` point to `docs/policies/index.md`, retain the fallback route, and link rather than repeat workflow/map/design/delivery rules. Keep agent-specific capability notes only when verified. Remove stale Claude graph-refresh and preview claims.

- [ ] **Step 2: Correct Architecture.md facts without turning it into policy.**

  Add the NOTAM feature and adapter, the omitted backend domains (auth, db, admin, alerts, me, forecaster, dev), and factual MapView transitional exceptions. Keep policy rationale in `map-and-layers.md`.

- [ ] **Step 3: Resolve the stale route-briefing draft.**

  Compare `docs/briefing-architecture.md` against `backend/server.js`. Archive it as clearly non-normative history or update it to the live `etd`/`eta` request and composed response; do not leave the obsolete contract marked current.

- [ ] **Step 4: Archive only resolved status records.**

  Inspect each active status record other than this migration status. Before moving any record, run `new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(path))` against it in Node. Move complete or explicitly abandoned records to `docs/superpowers/status/archive/`; leave genuinely active records in place.

- [ ] **Step 5: Verify pointers, then delete superseded sources.**

  Run:

  ```powershell
  node -e "const fs=require('fs'); for(const p of ['AGENTS.md','claude.md']) { const s=fs.readFileSync(p,'utf8'); if(!s.includes('docs/policies/index.md')) throw new Error(p+' lacks policy index'); if(s.split(/\r?\n/).length>40) throw new Error(p+' exceeds 40 lines') } console.log('entrypoint check passed')"
  rg -n "EntryPoints\.md|0001-mapview-layer-gravity|docs/design/design-language\.md|long-context-handoff\.md|testpilot/testpass123" AGENTS.md claude.md Architecture.md docs/policies .codex
  ```

  Expected: `entrypoint check passed`; the search has no active-document matches. Only then delete `EntryPoints.md` and `docs/adr/0001-mapview-layer-gravity.md` with `apply_patch`; retain historical archives unchanged.

### Task 5: Add the bounded SessionStart hook only when supported

**Files:**
- Modify when supported: `.codex/hooks.json`, `.codex/hooks/session-start.ps1`
- Modify: `docs/policies/engineering/workflow-and-tools.md`, `docs/superpowers/status/ai-policy-system.status.md`

**Produces:** verified automatic routing where supported and documented fallback where not.

- [ ] **Step 1: Verify the active Codex hook event and output schema.**

  Record the authoritative current-environment source used to verify the event name, command, and output schema in `engineering/workflow-and-tools.md`. If schema support cannot be verified, treat `SessionStart` as unsupported: do not invent a registration, record the limitation in that policy and the status record, retain `AGENTS.md`/`claude.md` → index fallback, then proceed to Task 6.

- [ ] **Step 2: Implement runtime excerpt extraction when supported.**

  Make `.codex/hooks/session-start.ps1` read `docs/policies/index.md` as UTF-8 and extract only the marked block:

  ```powershell
  $index = [IO.File]::ReadAllText($indexPath, [Text.Encoding]::UTF8)
  $match = [regex]::Match($index, '(?s)<!-- SESSION-ROUTING:START -->(.*?)<!-- SESSION-ROUTING:END -->')
  if (-not $match.Success) { throw 'Missing session routing markers in docs/policies/index.md' }
  $context = $match.Groups[1].Value.Trim()
  ```

  Return `$context` only through the verified `hookSpecificOutput.additionalContext` schema. Do not embed a second routing list, invoke graphify, start servers, or recursively load policies.

- [ ] **Step 3: Register and directly test the supported hook.**

  Keep `PreToolUse` unchanged and register only the verified SessionStart event in `.codex/hooks.json`. Then run:

  ```powershell
  $payload = '{"hook_event_name":"SessionStart"}'
  $hook = ($payload | powershell.exe -NoProfile -ExecutionPolicy Bypass -File .codex\hooks\session-start.ps1) | ConvertFrom-Json
  if ($hook.hookSpecificOutput.hookEventName -ne 'SessionStart') { throw 'wrong hook event' }
  if ($hook.hookSpecificOutput.additionalContext -notmatch 'ProjectAMO policy routing') { throw 'routing excerpt missing' }
  Get-Content -Raw .codex/hooks.json | ConvertFrom-Json | Out-Null
  'session-start hook check passed'
  ```

  Expected: `session-start hook check passed`.

  Then start one fresh Codex session in this repository and confirm its startup context contains `# ProjectAMO policy routing` without a detailed policy body. If this fresh-session injection cannot be verified, remove the SessionStart registration, record the limitation in the policy and status file, and proceed with the entrypoint/index fallback.

### Task 6: Verify, archive the status record, and prepare completion

**Files:**
- Modify: `docs/superpowers/status/ai-policy-system.status.md`
- Move: `docs/superpowers/status/ai-policy-system.status.md` → `docs/superpowers/status/archive/ai-policy-system.status.md`

**Produces:** a verified policy migration and archived handoff record.

- [ ] **Step 1: Validate active Markdown links.**

  Run:

  ```powershell
  node -e "const fs=require('fs'),path=require('path'); const files=['AGENTS.md','claude.md','Architecture.md','docs/dev-server-and-capture.md','docs/operations.md','docs/aws-ec2-manual-deploy.md','deploy/README.md',...fs.readdirSync('docs/policies',{recursive:true}).filter(p=>p.endsWith('.md')).map(p=>path.join('docs/policies',p))]; const bad=[]; for(const f of files){const s=fs.readFileSync(f,'utf8'); for(const m of s.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)){const t=m[1]; if(/^[a-z]+:|^\//i.test(t)) continue; if(!fs.existsSync(path.resolve(path.dirname(f),t))) bad.push(f+' -> '+t)}} if(bad.length) throw new Error(bad.join('\n')); console.log('active links passed')"
  git diff --check
  ```

  Expected: `active links passed`; `git diff --check` has no output.

- [ ] **Step 2: Update the graph after hook/config changes.**

  Run `graphify update .` only if Task 5 changed hook/config files. Expected: the graph update completes without damaging `graphify-out/graph.json`.

- [ ] **Step 3: Perform the advisory closeout recommendation.**

  Before a requested finish, commit, push, or PR, recommend only applicable verification, policy-index/entrypoint synchronization, temporary-file handling, status archive, and deployment checks. Do not run optional checks without the user's acceptance.

- [ ] **Step 4: Complete and archive the status record.**

  Record completed tasks, commands and results, unresolved items, and the next action. Mark the work complete or explicitly abandoned, then move the status file to `docs/superpowers/status/archive/ai-policy-system.status.md`; never delete it.

## Plan Self-Review

- Spec coverage: Task 2 creates the entire lean policy tree; Task 3 folds former task-pattern/delivery material into the approved owners; Task 4 creates thin entrypoints and corrects audited document drift; Task 5 implements the conditional SessionStart design; Task 6 covers verification and archive lifecycle.
- Scope control: no application source, dependency, runtime behavior, or new policy folder is planned. The KIM timestamp bug remains a later, separately scoped task.
- Placeholder scan: every task has exact files, actions, and verification. SessionStart is the sole conditional branch; unsupported capability uses the documented fallback instead of blocking migration.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-ai-policy-system-implementation.md`.

1. **Subagent-Driven** — fresh reviewer gates between independently reviewable tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
