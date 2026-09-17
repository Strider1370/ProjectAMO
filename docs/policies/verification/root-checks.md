# Root and offline verification

## Clean Linux install boundary

The default clean application install is Node `22.23.1` from `.nvmrc` with npm `10.9.8`: `bash scripts/bootstrap-linux.sh` loads nvm when available, validates both versions, then runs `npm ci`, `npm --prefix frontend ci`, and `npm --prefix backend ci`. Those are three separate lockfile roots; the prototype is not silently installed.

`npm run install:browsers:chromium` is the bootstrap browser command. It installs Chromium and its Linux dependencies for the normal frontend contract path and backend NOTAM crawler. WebKit is optional and must be requested with `npm run install:browsers:webkit` before Safari or organization-WebKit projects. The independent prototype must be installed explicitly with `npm run install:prototype` before `npm run test:prototype`.

Python/GIS tools are also opt-in. A reviewed writable environment can use `python3 -m venv .artifacts/gis-venv` followed by `.artifacts/gis-venv/bin/pip install shapely numpy rasterio Pillow`; this is not part of bootstrap, `npm test`, or `npm run check`.

`npm test` is the ordinary offline regression gate. It executes these groups in order with `&&`: backend Node discovery, frontend font check plus Node discovery, then `test:offline`. A failed predecessor stops the later groups; the skipped groups are not passes and must be reported as not run.

`test:offline` is also ordered with `&&` and contains only local checks: `test:shared` runs the four root `shared/*.test.js` files (14 cases); fixture-only launcher/install tests check child-identity readiness and the clean-install declaration without opening a port; `deploy/test-nginx-rate-limit.mjs` checks the committed nginx rate-limit contract; `deploy/test-deploy-lock.sh` uses temporary command stubs to verify that a held local deploy lock prevents either deploy script from running its commands; and `deploy/test-build-frontend-retention.sh` uses a fake npm build to verify one previous asset generation is retained, both atomic-exchange intermediate states keep an index and the just-prior lazy chunk available, and a failed staging build leaves them unchanged. The lock test creates one unique `/tmp/projectamo-deploy-lock-test.XXXXXX/deploy.lock` and injects it only with `PROJECTAMO_DEPLOY_LOCK_TEST=1` plus `PROJECTAMO_DEPLOY_LOCK_FILE`; both production entrypoints otherwise retain `/tmp/projectamo-deploy.lock`. The entrypoints accept only that exact test-path shape before opening a lock, and the test also proves an arbitrary injected path is rejected without being created, so the offline gate never creates or holds the operational lock. It does not contact a deployment host, install packages, start servers, collect weather, or publish data.

`npm run check` is `npm test` followed by the frontend production build. It therefore covers the root shared contract in addition to backend/frontend Node discovery, but it is not a browser, live-data, deployment, or GIS validation command.

## Explicit optional groups

Run the following only when their scope is relevant; none is part of `npm test` or `npm run check`.

| Command | Preconditions and inputs | What it does / writes |
| --- | --- | --- |
| `npm run test:python:unittest` | `python3`; the two ENR POC test modules and their local fixture literals | Runs the two `unittest` modules (7 cases). It does not call their network-backed `main()` functions. |
| `npm run test:python:main` | `python3`; local source modules only | Directly runs the two assertion scripts for change candidates and AIRAC amendment helpers. Keep this direct-main path separate from unittest discovery. |
| `npm run test:prototype` | Dependencies installed in `prototypes/destination-weather-comparison` | Builds the independent Vite/Sites prototype, writes its `dist/`, then checks the built Sites package. |

Python data-generation and GIS tools are not a test gate. For example, `python3 scripts/generate_terrain_manifest.py` reads committed overseas airport/airway inputs, sends Copernicus HEAD requests, and overwrites `backend/data/terrain/overseas-tile-manifest.json`; `python3 scripts/prepare_overseas_terrain_tiles.py` additionally requires NumPy and Rasterio, downloads Copernicus GeoTIFFs, and writes terrain tiles/metadata. Likewise, `python3 scripts/generate_overseas_navdata.py` requires Shapely plus `NAVDATA_SRC` input and writes the configured `NAVDATA_OUT`. Run such commands only with their source/data/output conditions reviewed and an intended writable data location; they never belong in the default check.

Browser contracts remain separate: use `npm run dev:contract -- --grep <contract-id>` under the browser verification policy. Their server, browser, fixture, and `DATA_PATH` lifecycle is outside the offline gate.
