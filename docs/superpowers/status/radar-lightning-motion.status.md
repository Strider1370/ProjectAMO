# Radar and lightning observed-motion status

**Status:** Temporarily disabled pending algorithm and performance calibration
**Updated:** 2026-07-22
**Spec:** `docs/superpowers/specs/2026-07-22-radar-lightning-motion.md`
**Plan:** `docs/superpowers/plans/2026-07-22-radar-lightning-motion.md`

## Delivered

- The backend derives observed radar motion from adjacent five-minute, reduced radar inputs. It persists only the reduced input and GeoJSON vectors; no raw grid is published to clients.
- Metadata carries epoch `observedAtMs` and `comparedFromMs`. The frontend selects motion strictly for the rendered `radarFrame.tm`.
- Motion failures and the 30-second calculation deadline leave the normal radar PNG and metadata publication intact.
- The contextual `이동 화살표 표시` toggle is default-off, resets when Radar is off, hides below zoom 5, and limits the viewport to one vector per 6 x 10 screen cell.
- Lightning remains a co-displayed observational layer and is not used to calculate motion.

## Verification

- Backend motion and publication tests: 5 passed.
- Frontend Node tests: all passed.
- Frontend production build: passed.
- Playwright map-base contract with deterministic radar/motion fixture: 6 passed across desktop, iPad, and mobile.
- Desktop control capture: `artifacts/responsive-screenshots/radar-motion/2026-07-22_1700_after/desktop-radar-motion.png`.

## Known environment note

The standalone existing cross-section route test uses a configuration module initialized before it sets its temporary `DATA_PATH`, so it returns its expected data from the configured worktree data directory and fails with 503. This predates the motion work and does not exercise radar-motion code.

## Follow-up calibration

The motion collector, map payload, and legend control are intentionally disabled. The backend does not create reduced motion inputs or GeoJSON vectors, and the frontend does not request or render them.

Before re-enabling, validate real KMA event pairs with normalized patch correlation, unambiguous-match rejection, and an explicit CPU budget at the desired display density. This does not change the observed-motion/no-forecast contract.
