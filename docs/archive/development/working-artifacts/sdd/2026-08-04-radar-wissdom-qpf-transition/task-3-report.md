# Task 3 report — poll radar graphics metadata

## Status

DONE.

## Assumptions

- Task 2's snapshot endpoint returns each graphics entry as `{ tm, hash,
  updated_at }`, while the browser metadata files provide the latest frame
  timestamp and `updatedAt`.
- WISSDOM and QPF belong to the normal 60-second polling bundle; they are not
  deferred by panel state.

## RED / GREEN record

- RED: `node --test frontend/src/app/snapshotMeta.test.js
  frontend/src/app/pollingData.test.js` failed as expected: WISSDOM was absent
  from the changed-data loader and the snapshot change set.
- Regression RED: the same focused command failed when a rebuilt client
  snapshot lacked the backend canonical hash, proving that hash-only
  comparison would re-fetch unchanged metadata every cycle.
- GREEN: `node --test frontend/src/app/snapshotMeta.test.js
  frontend/src/app/pollingData.test.js` passed 13 tests.
- Integrity: `git diff --check` passed.

## Changed files

- `frontend/src/api/weatherApi.js`: loads WISSDOM/QPF metadata initially,
  exposes them on `weatherData`, builds local snapshot entries, and fetches
  only the changed metadata file with preserve-on-failure semantics.
- `frontend/src/app/snapshotMeta.js`: compares the graphics frame timestamp,
  canonical hash when both sides have one, and publication timestamp.
- `frontend/src/app/snapshotMeta.test.js`: covers independent graphics change
  detection and no-repeat polling after a locally rebuilt snapshot.
- `frontend/src/app/pollingData.test.js`: covers URL selection and preserving
  known-good WISSDOM/QPF metadata when one changed request is undefined.

## Residual risks

- The frontend intentionally does not calculate the backend's canonical hash;
  it falls back to Task 2's `updatedAt`/`updated_at` plus the latest frame
  timestamp after a metadata fetch. This avoids repeated polling while still
  detecting published graphics changes.
- No browser or broad test suite was run, per the task's minimal-verification
  instruction.
