# Route Briefing Computation Efficiency Status

Updated: 2026-07-20 21:36 KST
Spec: docs/superpowers/specs/2026-07-20-route-briefing-computation-efficiency.md
Plan: docs/superpowers/plans/2026-07-20-route-briefing-computation-efficiency.md

## Resume Point

- Last completed: Task 0 production measurement and Task 1 raw-grid cache. `enroute-cross-section` keeps one KIM and one KTG revision-aware bundle keyed by root/tmfc/hf/revision; it retains at most 32 grids (21 KIM pressure levels, 10 KTG levels, and KTG coordinates), reuses same-revision reads, and drops each family map before a changed revision is read.
- Next: Commit and deploy only after the user explicitly requests it. No deployment has been performed.

## Verified

- `node -e "const fs=require('fs'); ..."` verified the spec is UTF-8 and contains every required spec section.
- `git diff --check` passed after creating the specification.
- Independent spec review confirmed the revised specification is approvable when latest/index revision invalidates a same-`tmfc`/`hf` cache entry; that requirement is included in FR-002.
- Follow-up code check confirmed `runWithLock` is already exported from `backend/src/index.js` and the sparse-array helpers live in `backend/src/briefing/enroute-cross-section.js`.
- Local data measurement: active KIM run contains 231 normalized grids / 776,405,872 bytes and active KTG run contains 121 grid-or-coordinate files / 34,184,718 bytes. These figures include all forecast hours, so they are not the one-`hf` cache budget.
- Production measurement over read-only SSH on 2026-07-20: backend PID 2338244 RSS was 487,984 KiB (about 477 MiB); the 1.9 GiB server had 735 MiB available. Active KIM `2026072000`/hf009 was 21 files / 67.1 MiB serialized and parsed to +40.8 MiB heap / +40.2 MiB RSS in a separate Node process. Active KTG `2026072000`/hf009 was 11 files / 3.0 MiB serialized and parsed to +6.7 MiB heap / +17.2 MiB RSS. The 32-entry, one-bundle cache is therefore capped at the measured 64 MiB ceiling and is acceptable.
- `node --test backend/test/cross-section-route.test.js backend/test/cross-section-sampler.test.js backend/test/enroute-model.test.js` passed (11 tests), including same-revision hit growth and changed-latest cache miss.
- `npm --prefix backend test -- --test-name-pattern "collectKimNwpTask"` passed (76 tests; npm applies the pattern across the suite).
- `node --test backend/test/geo-time-match.test.js backend/test/route-exposure.test.js backend/test/cross-section-route.test.js` passed (14 tests).
- `npm --prefix frontend run build` passed.
- `node --test backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-cloud-api.test.js backend/test/kim-field-cache.test.js backend/test/kim-icing-api.test.js backend/test/compression.test.js` passed (53 tests).
- `node --test backend/test/cross-section-sampler.test.js backend/test/cross-section-route.test.js backend/test/enroute-model.test.js` passed (10 tests).
- `npm.cmd run dev:contract -- --grep route-workflow` passed: desktop, iPad landscape, and mobile route workflows passed (7 passed; 2 non-mobile tests conditionally skipped).
- `npm.cmd run dev:contract -- --grep "alternative route edits"` passed: the desktop edit flow made a batch exposure request without increasing its single-request count (1 passed; 2 non-desktop projects conditionally skipped).
- `npm --prefix backend test` passed (375 tests).
- `npx depcruise --no-config --output-type err-long backend/src frontend/src` passed (3,209 modules; no dependency violations). The repository has no dependency-cruiser config, so the default whole-repository command was not applicable.
- Final rerun after the raw-grid cache: `npm --prefix backend test` passed (376 tests); `npm --prefix frontend run build` passed; `npx depcruise --no-config --output-type err-long backend/src frontend/src` passed (3,209 modules / 8,690 dependencies); `npm.cmd run dev:contract -- --grep route-workflow` passed (8 passed, 4 viewport-conditional skips).
- `git diff --check` passed.

## Unverified / Skipped

- KIM/KTG cron-overlap observation is explicitly deferred to a separate task.
- `graphify update .` could not complete because the repository's semantic graph requires an external LLM API key; the scoped dependency-cruiser check is the available structural evidence.
- `npx knip` is not usable until this repository has a `knip.json`: without entry points it reported 517 project files and 8 dependencies as unused, including the runtime entry points themselves. No unused-code regression is indicated by that output.
