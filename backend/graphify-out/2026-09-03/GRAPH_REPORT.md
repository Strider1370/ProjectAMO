# Graph Report - backend  (2026-09-03)

## Corpus Check
- 341 files · ~201,112 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2278 nodes · 5449 edges · 138 communities (112 shown, 26 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 416 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2bbeec91`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ktg-processor.js
- flight-category-processor.js
- echo-top-processor.js
- src/index.js
- notam-geometry.js
- taf-window.js
- kim-surface-wind-processor.js
- sigwx-cloud-overlay.js
- kim-nwp-store.js
- altitude-weather-comparison.js
- profile-composer.js
- typhoon-processor.js
- ground-forecast-processor.js
- hazard-exposure.js
- createDb
- briefing-composer.js
- config.js
- getDb
- server.js
- scenario.js
- iwxxm-advisory-parser.js
- lightning-processor.js
- terrain-rgb-tiles.js
- scheduler.js
- api-client.js
- overseas-forecast-processor.js
- store.js
- kim-nwp-model.js
- terminal-flight-processor.js
- enroute-cross-section.js
- geo-time-match.js
- noaa-sigmet-parser.js
- satellite-parser.js
- admin/router.js
- metar-parser.js
- snapshot-store.js
- taf-tac.js
- users.js
- radar-graphics-processor.js
- convective-satellite-processor.js
- noaa-taf-parser.js
- taf-parser.js
- noaa-metar-parser.js
- satellite-processor.js
- data-view.js
- lcc-projection.js
- data-health.js
- sender.js
- kma-radar-graphics.js
- adsb-processor.js
- amos-processor.js
- kim-nwp-model.test.js
- ops-alerts.js
- db/index.js
- parse-utils.js
- stats.js
- ops-rules.js
- route-axis.js
- measure-motion-accuracy.mjs
- data-health-catalog.js
- db-backup.js
- radar-echo-processor.js
- satellite-visible-processor.js
- package.json
- diff.js
- alerts.js
- dependencies
- tac-annotation.js
- sendKimWindField
- trends.js
- planned-altitude.js
- kma-graphics-projection.js
- taf-processor.js
- audit-terminal-airlines.mjs
- aip-airway-constraints.js
- kma-special-warning-parser.js
- asos-ceiling-processor.js
- airspace-zones.js
- fetchWithTimeout
- probe-radar-qcd-sites.mjs
- filterKimNwpIndexForVariables
- metrics.js
- takeoff-forecast-parser.js
- hazard-section.test.js
- buildSnapshotMetaCacheKey
- sendRevalidatedJson
- process-health.js
- airport-info-parser.js
- metar-processor.js
- briefing-provenance.test.js
- radar-graphics-processor.test.js
- measure-route-payload.js
- airmet-processor.js
- sigmet-processor.js
- api-cache-policy.test.js
- ops-alerts.test.js
- audit-terminal-destinations.mjs
- idw.js
- alert-active.test.js
- bcrypt
- better-sqlite3-session-store
- cookie-parser
- dotenv
- express
- express-session
- fast-xml-parser
- h5wasm
- helmet
- netcdfjs
- node-cron
- playwright
- project-kma
- sharp
- @turf/simplify
- @turf/turf
- web-push
- zod
- kim-server-index.test.js
- renderNationwideEcho
- admin-alert-watches.test.js
- radar-qcd-parser.js
- publishEchoTopFrame
- kim-forecast-hour.js
- overseas-weather-processor.js
- navlog-nwp-patch.js
- quiesceCollections
- metar-processor.js
- airport-info-processor.js
- compression
- cors
- cron-parser
- d3-contour
- express-rate-limit

## God Nodes (most connected - your core abstractions)
1. `text()` - 32 edges
2. `composeBriefing()` - 30 edges
3. `createDb()` - 28 edges
4. `loadRouteCrossSection()` - 27 edges
5. `createDevRouter()` - 27 edges
6. `createAdminRouter()` - 26 edges
7. `getDb()` - 24 edges
8. `toArray()` - 23 edges
9. `buildKimNwpGrid()` - 21 edges
10. `process()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `extractHourlySlots()` --indirect_call--> `ts()`  [INFERRED]
  src/processors/ground-forecast-processor.js → test/route-exposure.test.js
- `mergeIcingComponentsIntoGrid()` --indirect_call--> `component()`  [INFERRED]
  src/processors/kim-surface-wind-processor.js → test/kim-nwp-model.test.js
- `createSatelliteWorkQueue()` --indirect_call--> `work()`  [INFERRED]
  src/satellite/work-queue.js → test/satellite-usage-report.test.js
- `readSelectedKimCloudField()` --indirect_call--> `buildKimCloudPotentialFieldFromGrid()`  [INFERRED]
  server.js → src/processors/kim-nwp-model.js
- `readSelectedKimIcingField()` --indirect_call--> `buildKimIcingFieldFromGrid()`  [INFERRED]
  server.js → src/processors/kim-nwp-model.js

## Import Cycles
- None detected.

## Communities (138 total, 26 thin omitted)

### Community 0 - "ktg-processor.js"
Cohesion: 0.12
Nodes (36): buildKtgSnapshotEntry(), selectKimRunCredential(), unavailableAviationCredential(), addForecastHoursKtg(), buildKtgCoords(), buildKtgGrid(), KTG_ALT_LEVELS_FT, KTG_FORECAST_HOURS (+28 more)

### Community 1 - "flight-category-processor.js"
Cohesion: 0.17
Nodes (20): createDailyByteBudget(), kstDayKey(), encodeCtpsBinary(), budget, buildTrend(), buildVisibilityGeoJson(), classifyVisibility(), contourFeature() (+12 more)

### Community 2 - "echo-top-processor.js"
Cohesion: 0.07
Nodes (53): ECHO_TOP_GRID, echoTopCellToLatLon(), echoTopIndexForLatLon(), cropAirportEcho(), dBZToRainRate(), dBZtoRGBA(), gridToLatLon(), latLonToGrid() (+45 more)

### Community 3 - "src/index.js"
Cohesion: 0.06
Nodes (50): createDataViewManager(), dataView, ensureActiveDataView(), LIVE_PASSTHROUGH, createDemoSession(), demoSession, copyTypeInto(), DEMO_REQUIRED_TYPES (+42 more)

### Community 4 - "notam-geometry.js"
Cohesion: 0.06
Nodes (43): counts, output, root, rows, snapshot, source, countPlacemarks(), crawlNotamKml() (+35 more)

### Community 5 - "taf-window.js"
Cohesion: 0.14
Nodes (33): categoryFor(), alternateRequired(), buildAlternate(), buildDestination(), buildPeriods(), categoryTimeline(), cloudText(), ddhh() (+25 more)

### Community 6 - "kim-surface-wind-processor.js"
Cohesion: 0.08
Nodes (57): buildKimGridUrl(), fetchKimGrid(), parseHeaderDimensions(), parseHeaderValue(), parseKimGridText(), parseNumericRow(), buildKimNwpGrid(), buildKimWindGrid() (+49 more)

### Community 7 - "sigwx-cloud-overlay.js"
Cohesion: 0.09
Nodes (45): applyOutwardOffset(), buildBounds(), createScallopSvg(), escapeXml(), isCbCloudBoundary(), latToMercatorY(), lonToMercatorX(), mercatorYToLat() (+37 more)

### Community 8 - "kim-nwp-store.js"
Cohesion: 0.13
Nodes (29): clearRouteCrossSectionCache(), routeCrossSectionCacheMetrics(), buildKimNwpIndex(), buildKimNwpIndexEntry(), KIM_NWP_LEVELS, assertInsideRoot(), buildKimNwpRunId(), cleanupKimNwpRuns() (+21 more)

### Community 9 - "altitude-weather-comparison.js"
Cohesion: 0.16
Nodes (24): buildAltitudeWeatherComparison(), interpolate(), sampleWeights(), weightedTemperature(), weightedWind(), buildLeg(), buildProcedureGroups(), buildRouteWeatherLegs() (+16 more)

### Community 10 - "profile-composer.js"
Cohesion: 0.11
Nodes (42): altitudeRepresentativeFt(), annotateRouteAxis(), applyClimbUpperLimit(), applyDescentLowerLimit(), asNumber(), buildFlightPlanProfile(), buildGradientClimbProfile(), buildGradientDescentProfile() (+34 more)

### Community 11 - "typhoon-processor.js"
Cohesion: 0.11
Nodes (28): angularDelta(), asymmetricPolygon(), BEARING_BY_POINT, errorConePolygon(), galePolygon(), judgementPolygon(), radiusAt(), ringPolygon() (+20 more)

### Community 12 - "ground-forecast-processor.js"
Cohesion: 0.13
Nodes (34): addKstDays(), applyMidForecast(), applyShortForecast(), buildAirportResult(), buildJsonUrl(), buildRequestCaches(), countForecastCoverage(), createEmptyDay() (+26 more)

### Community 13 - "hazard-exposure.js"
Cohesion: 0.16
Nodes (17): evaluateTimeStatus(), advisoryItems(), buildRouteExposure(), isConvection(), lightningComparison(), airportsInside(), matchTyphoonHazards(), stepHoursOf() (+9 more)

### Community 14 - "createDb"
Cohesion: 0.11
Nodes (20): createAuthRouter(), sessionMiddleware(), SqliteStore, createDb(), createMeRouter(), minimaSchema, makeServer(), makeServer() (+12 more)

### Community 15 - "briefing-composer.js"
Cohesion: 0.11
Nodes (19): AIRPORT_BY_ICAO, airportRoles(), buildAirportWarningHazards(), buildBanner(), CAT_RANK, composeBriefing(), mergeAdvisoryPayloads(), mergeAirportPayloads() (+11 more)

### Community 16 - "config.js"
Cohesion: 0.06
Nodes (29): adsb, amos, api, asos_ceiling, DEFAULT_OVERSEAS_AIRPORTS, __dirname, environment, flight_category (+21 more)

### Community 17 - "getDb"
Cohesion: 0.12
Nodes (27): FORECASTER_AIRPORTS, isForecasterAirport(), normalizeForecasterAirports(), SET, absoluteExpired(), requireAuth(), requireRole(), getDb() (+19 more)

### Community 18 - "server.js"
Cohesion: 0.09
Nodes (26): adsbRouteCache, app, buildConvectiveSnapshotEntry(), buildFrameEntry(), buildHashEntry(), buildKimSurfaceWindEntry(), buildSigwxOverlaySnapshotEntry(), buildSnapshotMeta() (+18 more)

### Community 19 - "scenario.js"
Cohesion: 0.15
Nodes (27): aggregateByPath(), cache, getCacheStats(), getRequests(), recordRequest(), requests, cleanBaseline(), createDevRouter() (+19 more)

### Community 20 - "iwxxm-advisory-parser.js"
Cohesion: 0.15
Nodes (28): axisOrder(), buildItemId(), chunkCoordinates(), closeRing(), computeBbox(), getItems(), isStillValid(), mergeGeometries() (+20 more)

### Community 21 - "lightning-processor.js"
Cohesion: 0.15
Nodes (26): classifyStrike(), haversineKm(), kstToKstIso(), kstToUtcIso(), parse(), parseKstTm14(), toRad(), buildAirportPayloads() (+18 more)

### Community 22 - "terrain-rgb-tiles.js"
Cohesion: 0.19
Nodes (11): createTerrainRgbTiler(), __dirname, FIR_GEOJSON, firSpansAtLat(), INCHEON_FIR_BBOX, loadIncheonFirRings(), renderTerrainRgbRaw(), tileLat() (+3 more)

### Community 23 - "scheduler.js"
Cohesion: 0.19
Nodes (16): activeFlights(), alreadyFired(), buildBriefingRequest(), buildSnapshot(), cleanupExpired(), evaluateFlight(), hashOf(), insertAlert() (+8 more)

### Community 24 - "api-client.js"
Cohesion: 0.15
Nodes (20): buildAirportInfoUrl(), buildKmaSpecialWarningUrl(), buildSigwxLowUrl(), buildTakeoffFcstUrl(), buildUrl(), fetchAirportInfo(), fetchApi(), fetchKmaSpecialWarning() (+12 more)

### Community 25 - "overseas-forecast-processor.js"
Cohesion: 0.31
Nodes (9): overseasAirports, extractOverseasSlots(), fetchForecast(), finite(), kstParts(), process(), SYMBOL_ICONS, symbolToIcon() (+1 more)

### Community 26 - "store.js"
Cohesion: 0.14
Nodes (26): isLiveViewActive(), cache, cleanupSigwxLowOverlayFiles(), cleanupSigwxLowTmfcFiles(), ensureDirectories(), FILE_PREFIX, formatFileTimestamp(), formatSigwxLowFileLabel() (+18 more)

### Community 27 - "kim-nwp-model.js"
Cohesion: 0.09
Nodes (43): addForecastHours(), buildKimCloudPotentialFieldFromGrid(), buildKimIcingFieldFromGrid(), buildKimSurfaceWindFieldFromWindGrid(), buildKimTemperatureFieldFromGrid(), calcFreezingBonus(), calcIcingMemberships(), calcKFipLiteScore() (+35 more)

### Community 28 - "terminal-flight-processor.js"
Cohesion: 0.15
Nodes (24): addMinutes(), arrivalClockLookup(), clockMinutes(), DEPARTURE_ICAO_BY_IATA, DESTINATION_ICAO_BY_IATA, fetchFlightRows(), fetchIncheonArrivals(), flightKey() (+16 more)

### Community 29 - "enroute-cross-section.js"
Cohesion: 0.12
Nodes (30): buildCrossSection(), buildKtgCrossSection(), gridIndexFor(), gridStep(), nearestKtgIndex(), nullableC(), nullableFt(), sampleGridAt() (+22 more)

### Community 30 - "geo-time-match.js"
Cohesion: 0.14
Nodes (23): matchNotams(), boundsOverlap(), geometryBounds(), geometryBoundsCache, minDistanceNmToRing(), pointInPolygon(), polygonsOf(), routeCorridorInGeometry() (+15 more)

### Community 31 - "noaa-sigmet-parser.js"
Cohesion: 0.12
Nodes (22): closeRing(), COMPASS_DEGREES, computeBbox(), HAZARD_LABELS, mapIntensityChange(), orderRing(), parse(), parseMotion() (+14 more)

### Community 32 - "satellite-parser.js"
Cohesion: 0.06
Nodes (60): assertArrayLength(), assertHdf5(), clamp(), fillValue(), fogColor(), getH5wasm(), getNumAttr(), irGrayByte() (+52 more)

### Community 33 - "admin/router.js"
Cohesion: 0.18
Nodes (16): cache, dirSize(), readDiskUsage(), createAdminRouter(), activeUserCounts(), hourlyPattern(), recordVisit(), trafficStats() (+8 more)

### Community 34 - "metar-parser.js"
Cohesion: 0.18
Nodes (22): buildDisplay(), collectRunwayVisualRanges(), decodeXmlEntities(), detectReportType(), extractRunwayDesignator(), getOuterItem(), normalizeIwxxmRoot(), parse() (+14 more)

### Community 35 - "snapshot-store.js"
Cohesion: 0.18
Nodes (16): ALLOWED_OVERRIDES, API_HUB_ENDPOINTS, API_OPERATION_REGISTRY, assertApiOperationRegistry(), cadenceLabel(), canonicalPaths, category(), collectorById (+8 more)

### Community 36 - "taf-tac.js"
Cohesion: 0.21
Nodes (18): buildMetarTac(), buildMetarTacPresentation(), ddhhmmZ(), rvrToken(), windShearToken(), tacDisplayLine(), tacPresentation(), tacToken() (+10 more)

### Community 37 - "users.js"
Cohesion: 0.16
Nodes (12): makeLimiter(), loginSchema, registerSchema, createUser(), DUMMY_HASH, listPending(), listUsers(), parseAirports() (+4 more)

### Community 38 - "radar-graphics-processor.js"
Cohesion: 0.19
Nodes (21): apiUrl(), assetUrl(), clean(), collect(), defaultImage(), defaultJson(), frameAsset(), isDeclaredBackground() (+13 more)

### Community 39 - "convective-satellite-processor.js"
Cohesion: 0.20
Nodes (16): enToLatLon(), buildCiFeatureCollection(), CI_PROPERTIES, CTPS_MIN_FL_OPTIONS, ctpsColor(), decodeCtpsRecord(), normalizeCtps(), renderCtpsRgba() (+8 more)

### Community 40 - "noaa-taf-parser.js"
Cohesion: 0.20
Nodes (19): buildClouds(), buildWind(), CLEAR_COVERS, deepClone(), formatDisplay(), hourRange(), mapType(), parse() (+11 more)

### Community 41 - "taf-parser.js"
Cohesion: 0.20
Nodes (20): parseWeatherCode(), resolveDdhh(), decodeXmlEntities(), deepClone(), formatDisplay(), getOuterItem(), hourRange(), mapChangeIndicator() (+12 more)

### Community 42 - "noaa-metar-parser.js"
Cohesion: 0.23
Nodes (17): t(), buildClouds(), buildDisplay(), buildWeather(), buildWind(), cloudTypesFromTac(), convertSmToMeters(), extractRvr() (+9 more)

### Community 43 - "satellite-processor.js"
Cohesion: 0.13
Nodes (17): buildCeilingGeoJson(), CEILING_BANDS, CEILING_SEARCH_LEVELS, ceilingFromLevels(), cellToLonLat(), classifyCeilingFt(), CLD_THRESHOLD, decodeVariable() (+9 more)

### Community 44 - "data-view.js"
Cohesion: 0.33
Nodes (7): activateLiveView(), getActiveDataContext(), getDemoNow(), getEffectiveNow(), isDemoMode(), log, setDemoMode()

### Community 45 - "lcc-projection.js"
Cohesion: 0.33
Nodes (7): CTPS_GRID, ctpsIndexForLatLon(), latLonToEN(), displayPixelToSourceIndex(), displayPointToLonLat(), KO_DISPLAY_GRID, mercatorYToLat()

### Community 46 - "data-health.js"
Cohesion: 0.21
Nodes (16): coverageBounds(), latLonToProjected(), projectedToLatLon(), buildImpgRequest(), isDataPath(), KMA_GRAPHIC_PRODUCTS, KMA_GRAPHIC_QPF_LEAD_MINUTES, KMA_GRAPHIC_WISSDOM_HEIGHTS_M (+8 more)

### Community 47 - "sender.js"
Cohesion: 0.23
Nodes (13): at(), composeMessage(), dispatchFlightAlerts(), flightHeading(), formatAlert(), hhmmZ(), isAdminUser(), markAlerts() (+5 more)

### Community 48 - "kma-radar-graphics.js"
Cohesion: 0.18
Nodes (14): altitudeAtProfileDistance(), altitudeCandidate(), buildAltitudeCandidates(), categoricalAt(), commonSeries(), constraintStatus(), exposureSummary(), ft() (+6 more)

### Community 49 - "adsb-processor.js"
Cohesion: 0.23
Nodes (14): buildRequestHeaders(), buildUrl(), canonicalize(), contentHash(), __dirname, fetchViaHttpsRequest(), fetchWithTimeout(), getAdsbDir() (+6 more)

### Community 50 - "amos-processor.js"
Cohesion: 0.22
Nodes (13): fixedColumnObservation(), numberFromNamed(), parseTmToMs(), pickDailyRainfallAtTime(), pickObservationAtTime(), scaled(), validRawNumber(), buildAmosUrl() (+5 more)

### Community 51 - "kim-nwp-model.test.js"
Cohesion: 0.29
Nodes (8): satellite, decodeTerminalMessage(), hasOnlyKeys(), isPlainObject(), runSatelliteWorker(), validDelay(), workerError(), job

### Community 52 - "ops-alerts.js"
Cohesion: 0.27
Nodes (8): E84, enToLatLon84(), latLonToEN84(), _t84(), parseSfcAscii(), sfcLatLonToPixel(), sfcPixelToLatLon(), fixture

### Community 53 - "db/index.js"
Cohesion: 0.18
Nodes (5): __dirname, ensureColumns(), schema, now, now

### Community 54 - "parse-utils.js"
Cohesion: 0.21
Nodes (10): formatWindRaw(), normalizeWindUnit(), parseWind(), parseYmdhmToIso(), resolveWindBarb(), decodeXmlEntities(), getItems(), parse() (+2 more)

### Community 55 - "stats.js"
Cohesion: 0.20
Nodes (11): addRecentRun(), getStats(), initFromFile(), makeTypeEntry(), METAR_LIMIT_MIN, recordFailure(), recordSkip(), recordSuccess() (+3 more)

### Community 56 - "ops-rules.js"
Cohesion: 0.31
Nodes (7): API_HUB_KEY_CATEGORIES, createApiHubUsage(), fingerprint(), kstDay(), load(), nextKstMidnight(), withUsage()

### Community 57 - "route-axis.js"
Cohesion: 0.24
Nodes (10): DEFAULT_MINIMA, effectiveMinima(), hasDescriptor(), hasPhenomenon(), isVicinity(), judgeMinima(), NOTHING, num() (+2 more)

### Community 58 - "measure-motion-accuracy.mjs"
Cohesion: 0.26
Nodes (11): at(), bestOffset(), CASES, fetchGrid(), pad(), parab(), sad(), scoreCase() (+3 more)

### Community 59 - "data-health-catalog.js"
Cohesion: 0.05
Nodes (49): activeCount(), byCharacter, bySource, CATALOG, CHARACTERS, EARLY_MORNING, h(), NIGHT (+41 more)

### Community 60 - "db-backup.js"
Cohesion: 0.32
Nodes (9): backupDatabase(), backupDir(), hasBackupToday(), lastBackup(), listBackups(), prune(), stamp(), startDailyBackup() (+1 more)

### Community 61 - "radar-echo-processor.js"
Cohesion: 0.28
Nodes (13): buildEchoUrl(), buildFrameTms(), ensureRadarDir(), fetchRadarBinary(), formatKstTm(), getCandidateTms(), loadExistingMeta(), process() (+5 more)

### Community 62 - "satellite-visible-processor.js"
Cohesion: 0.31
Nodes (13): assertConvectiveFilename(), assertInside(), assetFilename(), assetPath(), cleanup(), convectiveDir(), mergeConvectiveFrame(), observedAt() (+5 more)

### Community 63 - "package.json"
Cohesion: 0.17
Nodes (11): engines, node, name, packageManager, private, scripts, dev, start (+3 more)

### Community 64 - "diff.js"
Cohesion: 0.29
Nodes (6): airportChanges(), CONDITIONS, detectChanges(), sigmetChanges(), slotOf(), TYPE_OF

### Community 65 - "alerts.js"
Cohesion: 0.19
Nodes (10): createAlertsRouter(), listNotifications(), markAllNotificationsRead(), markNotificationRead(), patchSchema, pickActiveFlight(), registerSchema, iso() (+2 more)

### Community 67 - "tac-annotation.js"
Cohesion: 0.44
Nodes (7): annotateLine(), annotateMetarTac(), annotateTafTac(), displayTafLines(), roleForToken(), slotTimeForLine(), roles()

### Community 68 - "sendKimWindField"
Cohesion: 0.31
Nodes (10): etagOf(), readSelectedKimCloudField(), readSelectedKimField(), readSelectedKimIcingField(), requestHasMatchingEtag(), selectDefaultKimNwpField(), sendImmutableJson(), sendKimField() (+2 more)

### Community 69 - "trends.js"
Cohesion: 0.49
Nodes (7): bucketByDay(), newVisitorTrend(), readTrends(), signupTrend(), sinceDay(), visitTrend(), WINDOW_DAYS

### Community 70 - "planned-altitude.js"
Cohesion: 0.38
Nodes (6): classifyEncounter(), altitudeAtDistanceFt(), bandToFt(), limitToFt(), plannedAltitudeRangeFt(), ctx

### Community 71 - "kma-graphics-projection.js"
Cohesion: 0.22
Nodes (13): altitudeAtProfileDistance(), buildEnrouteModel(), classifyIcing(), classifyKtg(), LEVEL_RANK, roundInterval(), seriesAtAltitude(), sortedLevels() (+5 more)

### Community 72 - "taf-processor.js"
Cohesion: 0.31
Nodes (8): attachPrevious(), snapshot(), trimHeader(), trimTimeline(), processAll(), normalizeLegacyWeather(), slot(), taf()

### Community 73 - "audit-terminal-airlines.mjs"
Cohesion: 0.33
Nodes (8): buildRoster(), fetchLive(), fetchSchedule(), iataOf(), missing, roster, runsToday(), serviceKey()

### Community 74 - "aip-airway-constraints.js"
Cohesion: 0.39
Nodes (6): attachActiveAipConstraints(), constraintFields(), currentFile(), directionFor(), loadActiveSnapshot(), readJson()

### Community 75 - "kma-special-warning-parser.js"
Cohesion: 0.31
Nodes (5): AIRPORT_REGION_IDS, LEVELS, parse(), parseKstYmdhm(), PHENOMENA

### Community 76 - "asos-ceiling-processor.js"
Cohesion: 0.33
Nodes (5): ASOS_STATIONS, fetchAsosCeiling(), formatAsosHourTm(), parseAsosCeiling(), process()

### Community 77 - "airspace-zones.js"
Cohesion: 0.39
Nodes (6): DATA_DIR, __dirname, hasAltitudeData(), loadAirspaceZoneItems(), ZONE_CONFIGS, zoneItemsFromGeoJson()

### Community 78 - "fetchWithTimeout"
Cohesion: 0.48
Nodes (4): fetchWithTimeout(), buildRainviewerMeta(), process(), PAYLOAD

### Community 79 - "probe-radar-qcd-sites.mjs"
Cohesion: 0.29
Nodes (4): CANDIDATE_SITES, ok, results, tm

### Community 80 - "filterKimNwpIndexForVariables"
Cohesion: 0.48
Nodes (7): buildKimNwpSnapshotEntry(), filterKimCloudIndexForMap(), filterKimIcingIndexForMap(), filterKimNwpIndexForLevels(), filterKimNwpIndexForMap(), filterKimNwpIndexForMapVariables(), filterKimNwpIndexForVariables()

### Community 81 - "metrics.js"
Cohesion: 0.57
Nodes (5): currentResources(), readMetrics(), sampleOnce(), startSampler(), WINDOW

### Community 82 - "takeoff-forecast-parser.js"
Cohesion: 0.52
Nodes (5): getItems(), getResultCode(), parse(), parser, tmFcKstToIso()

### Community 83 - "hazard-section.test.js"
Cohesion: 0.20
Nodes (16): matchHazards(), alignedRange(), evaluateAltitudeExposure(), evaluateHorizontalExposure(), exposureConfidence(), hazardBandFt(), SURFACE_BAND_FT, SURFACE_PHENOMENON_CODES (+8 more)

### Community 84 - "buildSnapshotMetaCacheKey"
Cohesion: 0.24
Nodes (9): error(), close(), getServerBaseUrl(), listen(), writeLatest(), close(), close(), close() (+1 more)

### Community 85 - "sendRevalidatedJson"
Cohesion: 0.47
Nodes (6): sendJsonFile(), sendKimIndex(), sendLatest(), sendRevalidatedJson(), sendStaticConfigJson(), setNoStore()

### Community 86 - "process-health.js"
Cohesion: 0.31
Nodes (5): createUsageMeter(), runProcessWorker(), runWorkerEntry(), failureMessage(), work()

### Community 87 - "airport-info-parser.js"
Cohesion: 0.47
Nodes (4): getItems(), getResultCode(), parse(), parser

### Community 88 - "metar-processor.js"
Cohesion: 0.36
Nodes (6): TYPE_MAP, apiHubUsage, createFetchApiHub(), endpointFor(), fetchApiHub, installApiHubFetchGuard()

### Community 89 - "briefing-provenance.test.js"
Cohesion: 0.60
Nodes (4): TRACE_AIP_CONSTRAINTS, TRACE_HAZARDS, TRACE_ROUTE_MODEL, WORKFLOW_SCENARIOS

### Community 90 - "radar-graphics-processor.test.js"
Cohesion: 0.18
Nodes (11): buildConfidenceWarnings(), fmtHHMMZ(), ROLE_LABEL, ROLE_RANK, SEVERITY_RANK, airport(), arrivalTaf, coveringDest (+3 more)

### Community 91 - "measure-route-payload.js"
Cohesion: 0.40
Nodes (3): db, __dirname, rows

### Community 94 - "api-cache-policy.test.js"
Cohesion: 0.34
Nodes (14): assertSatelliteJob(), assertValidTime(), FOLLOW_UP_MODES, isFrameTime(), isJsonSafe(), isPlainObject(), normalizeFollowUp(), SATELLITE_JOB_KINDS (+6 more)

### Community 95 - "ops-alerts.test.js"
Cohesion: 0.32
Nodes (13): fetchJson(), fetchOpenMeteoEnvironment(), fetchPmForAirport(), fetchText(), fetchUvForAirport(), formatKstObservationHour(), getPm25GradeLabel(), getPmGradeLabel() (+5 more)

### Community 98 - "alert-active.test.js"
Cohesion: 0.24
Nodes (6): getTerrainTileIndex(), readJson(), TerrainTileCache, tileName(), createDefaultTerrainSampler(), createTerrainSampler()

### Community 99 - "bcrypt"
Cohesion: 0.18
Nodes (11): bcrypt, compression, cookie-parser, h5wasm, netcdfjs, dependencies, bcrypt, compression (+3 more)

### Community 100 - "better-sqlite3-session-store"
Cohesion: 0.17
Nodes (18): ceilingFromClouds(), field(), formatRvr(), formatVisibilityKm(), formatWindKt(), metarDdhhmm(), reconstructMetarRaw(), summarizeAirport() (+10 more)

### Community 101 - "cookie-parser"
Cohesion: 0.31
Nodes (7): E, latToMercatorY(), lonToMercatorX(), mercatorYToLat(), PLAUSIBLE_LAT, PLAUSIBLE_LON, reprojectToMercator()

### Community 106 - "h5wasm"
Cohesion: 0.26
Nodes (7): activeCollectorRegistry(), assertCollectorRegistry(), COLLECTOR_REGISTRY, enabled(), graphicsEnabled(), radarEnabled(), scheduleKey

### Community 107 - "helmet"
Cohesion: 0.33
Nodes (6): buildOverseasDaily(), DAY_LABELS_KO, dayLabel(), ICON_SEVERITY, localHourOfDay(), worstIcon()

### Community 108 - "netcdfjs"
Cohesion: 0.36
Nodes (5): createSatelliteWorkQueue(), queueError(), retryKey(), normalJob, visibleJob

### Community 124 - "admin-alert-watches.test.js"
Cohesion: 0.33
Nodes (5): listAlertWatches(), safeJson(), STATUS_ORDER, watchStatus(), NOW

### Community 125 - "radar-qcd-parser.js"
Cohesion: 0.52
Nodes (5): certificateExpiry(), deployedAt(), deploymentInfo(), gitCommit(), REPO_ROOT

### Community 126 - "publishEchoTopFrame"
Cohesion: 0.29
Nodes (6): axis, ctxBase, icingOnAlt, onRoutePoly, sfcVisNoAltitude, turbHighAlt

### Community 127 - "kim-forecast-hour.js"
Cohesion: 0.43
Nodes (5): forecastValidMs(), selectClosestForecastTime(), selectNearestForecastHour(), tmfcToMs(), resolveCollectedForecastHours()

### Community 128 - "overseas-weather-processor.js"
Cohesion: 0.47
Nodes (3): depsFor(), descriptor(), png()

### Community 129 - "navlog-nwp-patch.js"
Cohesion: 0.70
Nodes (3): buildNavlogNwpPatch(), legKey(), nwpLeg()

### Community 131 - "metar-processor.js"
Cohesion: 0.40
Nodes (3): processAll(), latestFctm(), process()

## Knowledge Gaps
- **328 isolated node(s):** `TYPE_MAP`, `name`, `private`, `version`, `type` (+323 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolveNotamGeometry()` connect `notam-geometry.js` to `geo-time-match.js`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `composeBriefing()` connect `briefing-composer.js` to `tac-annotation.js`, `better-sqlite3-session-store`, `taf-window.js`, `kma-graphics-projection.js`, `altitude-weather-comparison.js`, `aip-airway-constraints.js`, `profile-composer.js`, `hazard-exposure.js`, `server.js`, `hazard-section.test.js`, `scenario.js`, `scheduler.js`, `radar-graphics-processor.test.js`, `enroute-cross-section.js`, `geo-time-match.js`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `buildRouteAxis()` connect `profile-composer.js` to `hazard-exposure.js`, `briefing-composer.js`, `server.js`, `enroute-cross-section.js`, `geo-time-match.js`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `composeBriefing()` (e.g. with `briefing-composer.js` and `roles()`) actually correct?**
  _`composeBriefing()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TYPE_MAP`, `name`, `private` to the rest of the system?**
  _328 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ktg-processor.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1207897793263647 - nodes in this community are weakly interconnected._
- **Should `echo-top-processor.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07462686567164178 - nodes in this community are weakly interconnected._