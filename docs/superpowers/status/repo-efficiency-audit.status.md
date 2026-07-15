# Repository Efficiency Audit Status

Updated: 2026-07-15 17:15 KST

## Resume Point
- Last completed: cleanup plan revalidated against `main@baf1b1b` and restructured into VM-free immediate work plus blocked/deferred work
- Result: the existing architecture HTML covers deepening opportunities; this audit adds repository hygiene, deletion, dependency, and automation findings
- Formal report: `docs/research/2026-07-15-repository-efficiency-audit.md`
- Plan: `docs/superpowers/plans/2026-07-15-repository-efficiency-cleanup.md`
- Last completed: VM-free Tasks 2a, 3a, 4, 5, 7, 8, 9, and 10; Task 11a checkpoint recorded.
- Next blocker: Task 1 — restore VM SSH access and identify the PM2 Node runtime before Tasks 2b/3b.

## Verified
- `graphify query "directories duplicate legacy manual package scripts tests tools workflow config files" --budget 2600` scoped the audit to repository/workflow hotspots.
- Task 0 preflight: `main` is checked out, `baf1b1b` is an ancestor of `HEAD`, and there are no commits after that baseline. Pre-existing dirty paths are limited to `AGENTS.md`, `claude.md`, root `package-lock.json`, and untracked agent/audit planning files; none overlap Task 2a ownership.
- Task 0 frontend baseline: Node v24.15.0; `node --test` from `frontend` passed 369 tests (0 failures, exit 0).
- Task 2a: Node v24.15.0; focused five-server test command passed 16/16 in 5.68s and `npm.cmd --prefix backend test` passed 348/348 in 9.20s, both exiting naturally. Reviewer approved the seven-file scoped commit.
- Task 3a: `npm.cmd --prefix frontend test` passed 369/369 and `npm.cmd run check` passed backend 348/348, frontend 369/369, and Vite build. Reviewer approved the two-file scoped commit.
- Task 4: main focused test command passed 22/22; reviewer approved the 13-file scoped deletion/update. The removed warning-tab surface was unreachable, while `WarningCarousel` remains the live warning UI.
- Task 5: main frontend suite passed 369/369. The after-state Playwright capture created `monitoring-ops-after.png` and `monitoring-ground-after.png`; the capture command returned exit 1 without an emitted Playwright error, so no before/after comparison is available because the required pre-change capture was missed. Reviewer approved after removal of one unrequested import-contract test.
- Task 7: static reviewer approved the four-file task diff. The plan's signal-only Promise immediately exited under Node v24; user approved a seven-line, same-file correction that keeps the event loop alive until SIGINT/SIGTERM. Main verification confirmed `dev:serve` stayed running, then left no 3001/5173 listeners after termination; `node --check` and `git diff --check` passed.
- Task 8: main `npm.cmd run dev:screenshots` passed and generated the 18-image responsive matrix under `artifacts/responsive-screenshots/manual/2026-07-15_082214_after/`; reviewer approved the four-file scoped change.
- Task 9: main `git diff --check` passed. Reviewer approved the three-file deterministic deployment change; clean-clone dependency/build validation ran without deploying to the VM.
- Task 11a: `npm.cmd run check` passed (backend 348/348, frontend 364/364, Vite build). Removed-symbol and old-fixture searches were clear. `552e754` removed 25 remaining machine-specific prefixes from the Task 10-owned route-import plan; remaining prefixes are historical plans/manual deployment docs outside this cleanup task. Graphify refreshed through the post-commit hook.
- `npm ls --depth=0 --json` completed for root, frontend, and backend without missing-package errors.
- Frontend `node --test` passed all 358 tests in about 1.9 seconds despite the manifest lacking a complete `test` script.
- A tracked-file SHA-256 scan found 39 exact-duplicate groups and 2,076,753 redundant bytes, dominated by six duplicated briefing-chart assets.
- The active `.githooks/post-commit` exits before its installed background/filter block, so the intended block is unreachable.
- Both root launcher batch files contain a machine-specific path and are superseded by the managed npm launcher.
- Multiple completed status records remain in the active status directory; root `status.md` also sits outside the documented status location.
- Thirty unreferenced RKPC PNG assets occupy 21,670,261 bytes; deletion is conditional on confirming no external direct-URL consumers.
- Shared/legacy weather duplication can remove about 340 source LOC and 88,912 bytes after repointing the five active monitoring callers.
- Dead or test-only code candidates total about 600 additional source LOC; cross-review preserved live `getLastUsed`, `formatBriefingTime`, ETA, and warning-model paths.
- Root owns six frontend dependencies plus `concurrently` redundantly; seven direct dependencies are removable after reconciling the dirty root lockfile.
- Backend `npm test` on the current unpinned Node v24.15.0 exits 1 despite 348 passing tests; isolated tests pass, while force-exit/session-timer interaction makes the current command an unreliable gate.
- The existing architecture HTML does not cover these hygiene findings, but its green-backend-test assumption needs revalidation before refactoring.

## Unverified / Skipped
- VM SSH is unavailable; Plan Task 1, Task 2b, and Task 3b are deferred until the user restores access and confirms the PM2 Node runtime
- Root `package-lock.json` remains owned by another session; Plan Task 6 is blocked until handoff
- External consumers of direct `/airport_weather/RKPC/*` public URLs
- Frontend production build and browser smoke after any future cleanup
- Runtime dev-server shutdown behavior
- Runtime confirmation of mobile-audit exit status and deployment behavior; these remain high-confidence static findings
- Task 10: user authorized skipping unrelated Playwright capture baselines without changing capture policy. Fixture count 10, both scripts passed syntax checks, route-import unit tests passed 18/18, and stale-reference scans were clear; reviewer approved the scoped move.
- Task 1, Task 2b, and Task 3b remain VM-deferred. Task 6 remains blocked by the root `package-lock.json` owner.
