# Navigation Data

- `enroute.json` is the one domestic en-route NAVDATA file. It is generated from the active reviewed AIP snapshot by `scripts/build_enroute_navdata.py` and contains points, routes, direction metadata, and full segment constraints.
- `airports.json` and `procedures/` remain separate because they are not part of the reviewed en-route AIP scope.
- Overseas files remain separate and optional.
- The route graph and domestic airway map are derived from `enroute.json`; do not add a second domestic route index file.
