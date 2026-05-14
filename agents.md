# agents.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Architecture Map

**Start at `Architecture.md`. Update it when reality drifts.**

- Before any task: read `Architecture.md`. If Task Patterns lists a match, follow that number in `EntryPoints.md`.
- After any task: update if files moved, a role memo is stale, a new non-obvious rule appeared, or a task flow changed. Otherwise don't touch.
- Before adding a line, check if a line can be removed. Both files must stay scannable in seconds.

## 6. Encoding Safety

**Never let shell writes corrupt UTF-8 source files.**

- Do not rewrite source files with PowerShell `Set-Content`, `Out-File`, or `>` when files may contain Korean or other non-ASCII text.
- Prefer `apply_patch` for manual edits.
- For mechanical rewrites, use Node `fs.readFileSync(path, 'utf8')` and `fs.writeFileSync(path, text, 'utf8')`.
- Do not trust PowerShell console output to verify Korean text; it may display mojibake even when file bytes are correct.
- Verify non-ASCII text with Node by reading as UTF-8 and, when needed, checking code points.

## 7. Code Review Graph

**Use graph context for broad changes, not for trivial edits.**

- Codex hooks are configured in `.codex/hooks.json` to check graph status on session start and refresh the graph after edits or shell activity when `code-review-graph` is installed.
- The same hook auto-allows only safe direct `code-review-graph status`, `update`, `update --skip-flows`, and `detect-changes` shell commands so subagents can use graph context without repeated approval prompts.
- For non-trivial refactors, reviews, dependency changes, or impact analysis, check `code-review-graph` before reading broad parts of the codebase.
- Prefer graph impact queries to discover related files, then inspect only the relevant source files.
- Do not treat graph results as a replacement for build, runtime, or browser verification.
- On a new computer, install and initialize the local graph before relying on hooks:
```
python -m pip install code-review-graph
code-review-graph build
code-review-graph status
```
- If MCP tools are unavailable, use CLI fallback:
```
code-review-graph update
code-review-graph detect-changes
code-review-graph status
```

## 8. Superpowers Subagent Orchestration

When using Superpowers workflows, the main agent must act as the orchestrator and assign suitable subagents from `.codex/agents/` whenever the task has cleanly separable planning, investigation, implementation, review, QA, security, or architecture work.

- Prefer the workflow-support roles: `task-distributor`, `code-mapper`, `implementer`, `spec-reviewer`, `reviewer`, `test-gap-finder`, `debugger`, `security-auditor`, `ui-qa-reviewer`, `architect-reviewer`, and `design-reviewer`.
- Keep review, mapping, QA, security, and architecture agents read-only. Use `implementer` for file edits.
- Use parallel subagents primarily for read-heavy exploration, tests, triage, log analysis, QA, security review, architecture review, and summarization.
- Keep write-heavy implementation sequential unless file ownership is clearly disjoint and integration ownership is explicit.
- Subagents must still follow this file, `Architecture.md`, and `EntryPoints.md` when present.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
