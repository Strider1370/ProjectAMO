# Automatic-route altitude comparison latency status

Updated: 2026-07-20 23:05 KST

## Resume point

- Deployed commit `438e351` to production. PM2, health, snapshot metadata, nginx configuration, and deployed revision all passed.

## Implemented

- Aligned KIM/KTG samples now use their route-axis index and share one weight array per comparison.
- The altitude response carries the generated cross-section; the following vertical-profile request reuses it.
- The existing direct vertical-profile flow still requests its own cross-section.

## Verified

- `node --test backend/test/altitude-weather-comparison.test.js` — 6 passed.
- `npm --prefix backend test` — passed.
- `npm --prefix frontend run build` — passed.
- `npx depcruise --no-config --output-type err-long backend/src frontend/src` — passed.
- `npm.cmd run dev:contract -- --grep route-workflow` — 8 passed, 4 viewport-conditional skips; the altitude comparison flow made zero cross-section requests.
- `graphify update .` — code graph updated (6,655 nodes).

## Next

- Manual production timing remains needed: the headless browser was blocked twice by the release-notes overlay before it could begin the route workflow, so no post-deploy UI duration is claimed.
