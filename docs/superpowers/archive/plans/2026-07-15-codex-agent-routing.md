# Codex Agent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ProjectAMO's Codex main-session planning defaults and role-specific subagent routing explicit and consistent.

**Architecture:** Keep personal main-session defaults in the global Codex configuration. Keep each ProjectAMO subagent's model, reasoning effort, permissions, and behavior in its project-local TOML profile. Keep durable routing and ownership rules in `AGENTS.md`, with reusable delegation prompt details in the existing role skill.

**Tech Stack:** Codex CLI TOML configuration, repository Markdown instructions, Codex custom-agent TOML profiles.

## Global Constraints

- Default main session is `gpt-5.6-terra` with `medium` reasoning.
- Plan mode raises only reasoning effort to `high`; it does not automatically switch the model.
- Main session retains requirements decisions, integration, rapid debugging, browser capture, and final verification.
- Do not delegate trivial edits or concurrently edit the same file through multiple agents.

---

### Task 1: Configure main-session and role model defaults

**Files:**
- Modify: `C:\Users\John\.codex\config.toml`
- Modify: `.codex/agents/researcher.toml`
- Modify: `.codex/agents/implementer.toml`
- Modify: `.codex/agents/reviewer.toml`
- Create: `.codex/agents/ui-design-reviewer.toml`

- [x] Set `plan_mode_reasoning_effort = "high"` beside the existing Terra/medium main default.
- [x] Pin Researcher to Luna/medium, Implementer to Terra/medium, and Reviewer to Sol/high.
- [x] Add a read-only UI Design Reviewer pinned to Sol/high; it evaluates existing Playwright evidence and does not run integration or edit code.
- [x] Parse every agent TOML and the global config with Python `tomllib`.

### Task 2: Make delegation durable and reusable

**Files:**
- Modify: `AGENTS.md`
- Modify: `.agents/skills/projectamo-agent-roles/SKILL.md`

- [x] Add a concise Subagent Delegation section to `AGENTS.md` covering role selection, main-agent ownership, dispatch brief requirements, and no-delegation cases.
- [x] Extend the role skill with model/routing context and the UI Design Reviewer role.
- [x] Validate the modified skill using the Codex skill validator.

### Task 3: Verify configuration artifacts

**Files:**
- Verify: files from Tasks 1 and 2

- [x] Run TOML parsing for all custom agents and global configuration.
- [x] Run the project role skill validator.
- [x] Run `git diff --check` and inspect the scoped diff, preserving unrelated changes.
