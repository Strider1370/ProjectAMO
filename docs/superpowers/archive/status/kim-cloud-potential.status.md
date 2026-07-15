# KIM Cloud Potential Status

Updated: 2026-05-20 12:45 KST
Spec: docs/superpowers/specs/2026-05-20-kim-cloud-potential-layer.md
Plan: docs/superpowers/archive/plans/2026-05-20-kim-cloud-potential-layer.md

## Resume Point
- Last completed: Task 6 final verification, browser smoke, Architecture.md update, final spec/test/UI/code reviews.
- Next: Implementation complete; ready for user review or commit/PR workflow.

## Verified
- Read Architecture.md and long-context policy.
- Read existing KIM NWP outline, temp design, current backend/frontend KIM implementation.
- Added feature-specific spec for the cloud potential layer.
- Live KIM API probe: 2026052000 not yet available; 2026051918 pressure-level `rh`, `cld`, `cldbulk`, `tqc`, `tqi` available at 850hPa.
- Live parsed sample at tmfc 2026051918 hf0: `T/rh/cld` grids are 205x169; `T - Td <= 3 C` produces non-empty cloud-potential masks at 925/850/700/500hPa.
- Spec-reviewer completed pre-implementation review; plan updated for encoded cloudPotential expectations, `rh.txt` raw naming, empty-index unavailable behavior, and cloud hook tests.
- External Claude review accepted as documentation-only refinement: added risks for water-vs-ice saturation limits, broad moist-layer hit-rate interpretation, and future spread-based alpha.
- Plan now includes a Subagent Execution Map for implementer/reviewer/spec-reviewer/test-gap-finder/ui-qa-reviewer usage.
- Task 1: `node --test backend/test/kim-nwp-model.test.js` passed 10/10 after implementation.
- Task 1 spec-reviewer: approved with no findings.
- Task 1 reviewer: approved with no findings.
- Task 2: `node --test backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-nwp-store.test.js` passed 31/31 after implementation.
- Task 2 spec-reviewer: approved with no findings.
- Task 2 reviewer: approved with no findings.
- Task 3: `node --check backend/server.js` passed.
- Task 3: `node --test backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-nwp-store.test.js` passed 31/31.
- Task 3 API smoke on temporary backend: cloud index HTTP 200, invalid field selection HTTP 400, snapshot meta includes `kimNwp.variables.cloud.hash`.
- Task 3 spec-reviewer: approved with no findings.
- Task 3 reviewer: approved with no findings.
- Task 4: `node --test frontend/src/features/weather-overlays/lib/cloudPotentialField.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js` passed 3/3.
- Task 4 spec-reviewer: approved with no findings.
- Task 4 reviewer: approved with no findings.
- Task 5: focused frontend test set passed 26/26 after review fixes.
- Task 5: `npm.cmd run build --prefix frontend` passed with existing Vite large chunk warning.
- Task 5 spec-reviewer: approved with no findings.
- Task 5 reviewer: requested fixes for active-disabled Cloud toggle and stale 10m field fetch; fixes applied and re-review approved.
- Task 6 backend expanded suite: `node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-cloud-api.test.js` passed 34/34.
- Task 6 frontend overlay suite: `node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/features/weather-overlays/lib/windField.test.js frontend/src/features/weather-overlays/lib/windOverlaySync.test.js frontend/src/features/weather-overlays/lib/temperatureField.test.js frontend/src/features/weather-overlays/lib/temperatureOverlaySync.test.js frontend/src/features/weather-overlays/lib/cloudPotentialField.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js frontend/src/features/weather-overlays/lib/metLayerVisibility.test.js` passed 73/73.
- Task 6: `node --check backend/server.js` passed.
- Task 6: `npm.cmd run build --prefix frontend` passed with existing Vite large chunk warning.
- Browser smoke on localhost: Cloud toggle appears, can be checked, shows `Cloud unavailable` with current no-rh local data, remains enabled while checked, can be unchecked; browser console errors empty.
- Final spec-reviewer: approved.
- Final test-gap-finder: initially requested backend integration coverage; added processor RH merge/failure tests and cloud API route/snapshot test; re-review approved.
- Final UI QA reviewer: approved.
- Final backend code-quality reviewer for testability changes: approved.
- Post-implementation product adjustment: cloud-potential layer is now documented and rendered as a `Moisture` / dewpoint-spread layer.
- Moisture levels are limited to `925hPa`, `850hPa`, `700hPa`, and `500hPa`; `10m` and `300hPa` are excluded from `rh` collection for this layer.
- Thresholds are now level-dependent: `T - Td <= 4 C` for `925/850/700hPa`, and `T - Td <= 6 C` for `500hPa`.
- Rendering now uses decoded `spread` values for stepped green moist-area shading; `cloudPotential` remains in the API response as a graded compatibility score.
- KIM NWP scheduler update: cron runs at `00/06/12/18 UTC` plus `+1h/+2h` retry windows at minute 12, with explicit UTC timezone.
- KIM NWP retry skip guard added: skip scheduled retries when the latest run already has `u/v/T` for all configured levels and `rh` for moisture-analysis levels.
- KIM NWP index filtering update: expose nearest past valid time plus future valid times.
- Post-adjustment focused verification: related tests passed 31/31; expanded KIM/weather overlay suite passed 60/60; frontend build passed with existing Vite chunk-size warning.

## Unverified / Skipped
- Valid cloud field HTTP 200 not smoked locally because current `backend/data/kim_nwp/index.json` has no stored `rh` grids.
- Browser screenshot capture timed out, so no screenshot artifact was saved.
- Live upstream collector run with real RH-backed KIM data not performed in this session.

## Open Decisions Resolved Mid-Implementation
- Treat the user threshold as cloud possible when `T - Td <= 3 C`; `>= 3 C` would indicate drier, less cloud-likely air.
- Superseded by later moisture-area decision: use level-dependent `T - Td` thresholds (`4 C` through 700hPa, `6 C` at 500hPa) and present the product as `Moisture` rather than binary Cloud.
