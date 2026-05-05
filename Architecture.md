# Project Architecture

This project is a Vite + React aviation weather dashboard focused on Mapbox-based Korean aviation map layers, weather data, and route briefing data. It has been restructured into a frontend, backend, and shared codebase.

## Root Structure

```text
ProjectAMO/
  agents.md
  Architecture.md
  backend/
  frontend/
  public/
  reference/
  scripts/
  shared/
  package.json
  package-lock.json
```

## Frontend Application Source

```text
frontend/
  index.html
  vite.config.js
  src/
    main.jsx
    App.jsx
    App.css
    api/
      weatherApi.js
      adsbApi.js
    components/
      Map/
        MapView.jsx
        MapView.css
      Sidebar/
        Sidebar.jsx
        Sidebar.css
    config/
      mapConfig.js
    layers/
      aviation/
        aviationWfsLayers.js
        addAviationWfsLayers.js
        addAdsbLayer.js
    services/
      navdata/
        routePlanner.js
```

- `App.jsx`: owns global shell state such as active side panel and UTC clock.
- `api/weatherApi.js`: API client for fetching weather data from the backend.
- `api/adsbApi.js`: API client for fetching ADS-B flight tracking data.
- `components/Sidebar`: fixed left navigation rail.
- `components/Map`: Mapbox map view, aviation layer toggles, route check panel, and route preview rendering.
- `config/mapConfig.js`: initial map center, zoom limits, and max bounds.
- `layers/aviation`: aviation layer definitions, Mapbox source/layer creation, and ADS-B layer rendering.
- `services/navdata/routePlanner.js`: loads generated navdata and finds route paths between entry/exit fixes.

## Backend Service

```text
backend/
  server.js
  src/
    api-client.js
    config.js
    index.js
    parsers/
    processors/
    stats.js
    store.js
```

- Node.js backend for fetching, parsing, and serving aviation weather data.

## Shared Code

```text
shared/
  airports.js
  alert-defaults.js
  warning-types.js
  weather-icons.js
```

- Constants and configurations shared between the frontend and backend.

## Public Static Assets

```text
public/
  favicon.svg
  data/
    fir.geojson
    sectors.geojson
    waypoints.geojson
    navaids.geojson
    airports.geojson
    navdata/
      airports.json
      waypoints.json
      navaids.json
      navpoints.json
      routes.json
      route-segments.json
      route-graph.json
      airport-route-links.json
      cycle.json
      README.md
  Symbols/
```

- `public/data/*.geojson`: map display data consumed directly by Mapbox.
- `public/data/navdata/*.json`: normalized briefing and route-planning data.
- `public/Symbols`: aviation chart symbols and app-specific colored symbol variants.

## Reference Data

```text
reference/
  AD 1.3.pdf
  ENR 2.1.pdf
  ENR 3.1.pdf
  ENR 3.2.pdf
  ENR 4.1.pdf
  html/
    KR-ENR-3.1-en-GB.html
    KR-ENR-3.3-en-GB.html
    KR-ENR-4.1-en-GB.html
```

- PDF files are retained as source references.
- HTML eAIP files are preferred for route parsing because table structure is more reliable than PDF text extraction.

## Scripts

```text
scripts/
  generate_navdata.py
```

`generate_navdata.py` reads map GeoJSON and AIP/eAIP reference files, then generates normalized route-planning JSON under `public/data/navdata`.

