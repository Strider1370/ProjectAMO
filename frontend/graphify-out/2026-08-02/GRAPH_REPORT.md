# Graph Report - frontend  (2026-08-02)

## Corpus Check
- 500 files · ~2,063,087 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2706 nodes · 5996 edges · 182 communities (139 shown, 43 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 131 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9caf2f59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- weatherApi.js
- useTimeZone
- AdminPage.jsx
- addAdsbLayer.js
- MapToolsPanel.jsx
- alert-triggers.js
- TafTimeline.jsx
- routePlanner.js
- amosViewModel.js
- developerApi.js
- sigwxData.js
- MapView.jsx
- notamLayers.js
- routePreview.js
- useAuth
- weather/helpers.js
- monitoringSlideshow.js
- canvasWindRenderer.js
- routeBriefingModel.js
- mapLayerUtils.js
- MetarCard.jsx
- VerticalProfileChart.jsx
- weatherOverlayModel.js
- WebGLWindRenderer
- RouteBriefingPanel.jsx
- weatherOverlayLayers.js
- windOverlaySync.test.js
- RouteAlternativesStep.jsx
- GroundCurrentWeatherCard.jsx
- BriefingView.jsx
- advisoryLayers.js
- temperatureOverlaySync.js
- App.jsx
- airportStationModel.js
- Settings.jsx
- cloudPotentialOverlaySync.js
- typhoonLayers.js
- icingPotentialOverlaySync.js
- weatherPointInspector.js
- fluent.js
- useTour.js
- dependencies
- DesignTestPage.jsx
- AVIATION_WFS_LAYERS
- layerActions.js
- notamGeoJson.js
- LevelSliderPanel.jsx
- windOverlaySync.js
- AirportPanel.jsx
- WeatherIcon.jsx
- FlightAlertDetail.jsx
- deriveNotamTime
- utils/helpers.js
- index.js
- route-fixture.mjs
- AviationLayerPanel.jsx
- MonitoringPage.jsx
- RouteWeatherLegTable.jsx
- webglWindRenderer.js
- useIsMobile
- tafViewModel.js
- radarMotionLayers.js
- MonitoringPage
- notamViewModel.js
- PersonalSettingsPanel.jsx
- routeImport.js
- changelog.js
- addAviationWfsLayers.js
- windField.js
- monitoring-personal-slideshow.spec.mjs
- airportStationImages.js
- convectiveLayers.js
- mobile-audit-capture.mjs
- useRouteBriefing.js
- typhoonListModel.js
- devDependencies
- TafTab.jsx
- mapStyleSync.test.js
- AltitudeWeatherComparison.jsx
- manualRouteInput.js
- scripts
- AirportInfoTab.jsx
- ktgTurbulenceOverlaySync.js
- lightningLayers.js
- echo-top.spec.mjs
- moa-activation.spec.mjs
- mobile-audit.mjs
- layoutTokens.test.js
- aircraftProfiles.js
- useRouteBriefing
- reachBriefingResult
- imageOverlay.js
- setMapLayerVisible
- legHighlight.js
- createRouteEditor
- routeStore.js
- resolveWeatherVisual
- radar-motion.spec.mjs
- AirportTooltip.jsx
- routeDesignColors.test.js
- routeDesigns.js
- flightCategoryLayers.js
- port-guard.mjs
- package.json
- manifest.json
- responsive-screenshots.mjs
- resolveAirportBanner
- echoTopLayers.js
- typhoon.spec.mjs
- fir-tick-zoom-capture.mjs
- lint-colors.mjs
- overseas-airway-clip-capture.mjs
- overseas-hover-capture.mjs
- alert-dispatcher.js
- buildRawWindsTable
- routePlanner.cache.test.js
- verticalProfileRequest.js
- tokens.js
- vprofile-scroll-capture.mjs
- BriefingView.responsive.test.js
- metLayerVisibility.js
- route-import-capture.mjs
- route-import-real-files-capture.mjs
- hazardMapLayers
- procedureData.js
- ConvectiveOverlayCard.jsx
- PressureLevelSlider.test.js
- playwright.config.js
- airport-panel-capture.mjs
- briefing-smoke.mjs
- map-chrome-capture.mjs
- monitoring-capture.mjs
- moon-section-capture.mjs
- responsive-smoke.mjs
- vfr-layout-capture.mjs
- rkthProcedureData.test.js
- EchoTopCard.jsx
- briefing-capture.mjs
- route-save-load-capture.mjs
- vfr-fix-search-capture.mjs
- TafTab.compact.test.js
- TafTab.eta-highlight.test.js
- MonitoringMap.test.js
- notamSchedule.test.js
- AltitudeWeatherComparison.test.js
- RouteBriefing.mobile-alternatives.test.js
- EchoTopCard.test.js
- WeatherPointInspector.jsx
- geomagnetism
- lucide-react
- mapbox-gl
- @mapbox/mapbox-gl-draw
- polylabel
- pretendard-gov
- project-kma
- react
- react-dom
- @turf/helpers
- README.md
- App.test.js
- AirportPanel.test.js
- MapView.briefing-fit.test.js
- MapView.mobile-confirmation.test.js
- MapView.test.js
- BriefingSynopsis.fold.test.js
- RouteBriefing.mobile-summary.test.js
- RouteWeatherLegTable.test.js
- useRouteBriefing.selection.test.js
- AdvisoryBadges.mobile-popover.test.js
- BriefingSynopsis.jsx
- AirportPickerField.jsx
- traffic-panel-capture.mjs
- DestinationWeatherPage.board-layout.test.js
- TrafficPanel.structure.test.js
- simplify-js
- @turf/area
- @turf/bearing
- @turf/distance
- resolveSettings
- DeveloperPage.jsx

## God Nodes (most connected - your core abstractions)
1. `TafTimeline()` - 34 edges
2. `useRouteBriefing()` - 33 edges
3. `useTimeZone()` - 32 edges
4. `MetarCard()` - 31 edges
5. `buildAmosConsoleModel()` - 29 edges
6. `useAuth()` - 27 edges
7. `MonitoringPage()` - 26 edges
8. `WebGLWindRenderer` - 25 edges
9. `buildMetarViewModel()` - 23 edges
10. `BriefingView()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `useRouteBriefing()` --indirect_call--> `airport()`  [INFERRED]
  src/features/route-briefing/useRouteBriefing.js → scripts/mobile-audit-capture.mjs
- `RouteBriefingPanel()` --indirect_call--> `step()`  [INFERRED]
  src/features/route-briefing/RouteBriefingPanel.jsx → scripts/mobile-audit.mjs
- `listenersViaSs()` --indirect_call--> `row()`  [INFERRED]
  verification/port-guard.mjs → src/features/weather-overlays/lib/typhoonLayers.test.js
- `MobileMoreMenu()` --indirect_call--> `Settings()`  [INFERRED]
  src/app/layout/MobileMoreMenu.jsx → src/features/monitoring/legacy/components/alerts/Settings.jsx
- `PersonalSettingsButton()` --calls--> `useAuth()`  [EXTRACTED]
  src/features/personal/PersonalSettingsButton.jsx → src/features/auth/AuthContext.jsx

## Import Cycles
- None detected.

## Communities (182 total, 43 thin omitted)

### Community 0 - "weatherApi.js"
Cohesion: 0.05
Nodes (72): buildHashEntry(), buildOverlayMetaEntry(), buildSnapshotMetaFromData(), DEFERRED_WEATHER_FETCHERS, fetchConvectiveCtpsPoint(), fetchEchoTopPoint(), fetchJson(), fetchJsonWithXhr() (+64 more)

### Community 1 - "useTimeZone"
Cohesion: 0.08
Nodes (49): AXIS, DOW, hhmm(), MLX(), MoonSection(), NightChart(), PAD, AdsbTimestamp() (+41 more)

### Community 2 - "AdminPage.jsx"
Cohesion: 0.07
Nodes (51): approve(), createForecaster(), getDataHealth(), getDemoMode(), getDemoModeLog(), getMetrics(), getPending(), getServerHealth() (+43 more)

### Community 3 - "addAdsbLayer.js"
Cohesion: 0.17
Nodes (18): addAdsbLayers(), ADSB_COVERAGE_CENTERS, CLASS_LABELS_KO, createAdsbCoverageGeoJSON(), createAdsbGeoJSON(), createAdsbTrailGeoJSON(), destPoint(), logoSrc() (+10 more)

### Community 4 - "MapToolsPanel.jsx"
Cohesion: 0.12
Nodes (23): AXIS_LABEL, AXIS_LETTERS, AXIS_MAX, COORD_FORMAT_OPTIONS, COORD_PLACEHOLDER, formatCoordinate(), HEMI, parseCoordinate() (+15 more)

### Community 5 - "alert-triggers.js"
Cohesion: 0.07
Nodes (26): BY_RANK, describe(), FIELD_LABEL, highWind, lightningDetected, lowCeiling, RANK, tafAdverseWeather (+18 more)

### Community 6 - "TafTimeline.jsx"
Cohesion: 0.11
Nodes (36): buildTafDisplaySlots(), buildTafTableSegments(), FC_COLORS, formatCeiling(), formatCompactVisibility(), formatTafRange(), formatVisibility(), formatVisibilityValue() (+28 more)

### Community 7 - "routePlanner.js"
Cohesion: 0.14
Nodes (37): buildBriefingRoute(), buildIfrRouteResult(), buildManualIfrRoute(), buildManualVfrRoute(), buildPreviewGeometry(), buildRouteDisplaySequence(), buildRouteGraph(), buildVfrRoute() (+29 more)

### Community 8 - "amosViewModel.js"
Cohesion: 0.20
Nodes (26): AMOS_REPRESENTATIVE_RUNWAYS, buildAmosConsoleModel(), buildWindRows(), calculateRunwayWindComponent(), classifyCrosswindLevel(), classifyRvrLevel(), enrichAmosRunways(), formatAmosValue() (+18 more)

### Community 9 - "developerApi.js"
Cohesion: 0.35
Nodes (14): clearAlerts(), getRoutes(), getVapidPublicKey(), inject(), j(), post(), reset(), sendTestPush() (+6 more)

### Community 10 - "sigwxData.js"
Cohesion: 0.14
Nodes (35): baseGroupKey(), buildPathGeometry(), centerOfCoords(), chaikinPass(), contourChipText(), contourChipTone(), featureProperties(), fpvPointToLngLat() (+27 more)

### Community 11 - "MapView.jsx"
Cohesion: 0.06
Nodes (27): fetchAdsbData(), createOneShotNotifier(), BriefingView, RANGE_RING_COLORS, RouteBriefingPanel, useStyleSyncedEffect(), useWeatherFieldOverlay(), VerticalProfileWindow (+19 more)

### Community 12 - "notamLayers.js"
Cohesion: 0.07
Nodes (32): addNotamHighlight(), addNotamLayers(), CAT_SVG, CATEGORY_LABEL, catIconSvg(), catLabel(), EMPTY_FC, escapeHtml() (+24 more)

### Community 13 - "routePreview.js"
Cohesion: 0.06
Nodes (43): ADSB_LAYER_IDS, ADSB_SOURCE_IDS, bindLayerEvent(), cleanupAll(), flattenLayerIds(), hasStyleRevision(), bindSectorHover(), buildVfrRouteFromWaypoints() (+35 more)

### Community 14 - "useAuth"
Cohesion: 0.60
Nodes (3): ForecasterInquiry(), FORECASTER_AIRPORTS, FORECASTER_CONTACTS

### Community 15 - "weather/helpers.js"
Cohesion: 0.13
Nodes (26): getWindDirectionRotation(), buildMetarTacSegments(), buildMetarViewModel(), levelHighlightClass(), pickCeilingCloud(), tacRoleClass(), baseMetar, MetarTab() (+18 more)

### Community 16 - "monitoringSlideshow.js"
Cohesion: 0.18
Nodes (21): clampDuration(), clampTransitionDuration(), DEFAULT_MONITORING_SLIDESHOW_CONFIG, DEFAULT_SLIDES, getMonitoringSlideshowStatus(), hasLocalStorage(), isValidDuration(), isValidTimeString() (+13 more)

### Community 17 - "canvasWindRenderer.js"
Cohesion: 0.15
Nodes (13): CanvasWindRenderer, clamp(), containsPoint(), createOverlayCanvas(), DEFAULTS, getBackingStorePixelRatio(), getParticleAgeAlpha(), getParticleBounds() (+5 more)

### Community 18 - "routeBriefingModel.js"
Cohesion: 0.16
Nodes (25): KNOWN_AIRPORTS, recommendProcedures(), base, BOUNDARY_FIX_FLOW_LABELS, buildBoundaryFixOptions(), buildIapCandidates(), buildIfrDistanceBreakdown(), buildInitialVfrWaypoints() (+17 more)

### Community 19 - "mapLayerUtils.js"
Cohesion: 0.21
Nodes (13): buildTicks(), EMPTY, longLegRuns(), segKm(), useFirTickOverlay(), EMPTY_FEATURE_COLLECTION, ensureGeoJsonSourceLoaded(), geoJsonLoads (+5 more)

### Community 20 - "MetarCard.jsx"
Cohesion: 0.15
Nodes (26): catColors(), CLEAR_TITLE_IMAGES, computeSunTimes(), dayOfYear(), formatClockFromMinutes(), formatCrosswindText(), formatCrosswindValue(), formatMinimumVisibilityDetail() (+18 more)

### Community 21 - "VerticalProfileChart.jsx"
Cohesion: 0.06
Nodes (52): CROSS_SECTION_TOGGLES, CrossSectionToggles(), DEFAULT_LAYERS, ForecastHourNav(), useCrossSectionLayers(), isothermSegments(), msToKt(), pressureToFallbackFt() (+44 more)

### Community 22 - "weatherOverlayModel.js"
Cohesion: 0.06
Nodes (61): formatAltitude(), formatIsa(), formatTemp(), formatWind(), formatWindVector(), hazardChips(), icingChip(), legKey() (+53 more)

### Community 23 - "WebGLWindRenderer"
Cohesion: 0.18
Nodes (7): clamp(), containsPoint(), createOverlayCanvas(), getParticleAgeAlpha(), getParticleBounds(), makeParticle(), WebGLWindRenderer

### Community 24 - "RouteBriefingPanel.jsx"
Cohesion: 0.12
Nodes (22): formatBriefingTime(), pad2(), buildIfrSequenceTokens(), ROUTE_SEQUENCE_COLORS, loadOverseasAirports(), bySavedDesc(), deleteSavedRoute(), listSavedRoutes() (+14 more)

### Community 25 - "weatherOverlayLayers.js"
Cohesion: 0.12
Nodes (23): addAdvisoryLayers(), setAdvisoryVisibility(), updateAdvisoryLayerData(), addedMapImages, addOrUpdateSigwxLowLayers(), bindSigwxStyleImageMissing(), buildSigwxDashArrayExpression(), createSigwxChipImage() (+15 more)

### Community 26 - "windOverlaySync.test.js"
Cohesion: 0.08
Nodes (7): __resetWindOverlayRendererFactoriesForTest(), createCanvas(), createWebGLContext(), FakeRenderer, FIELD_A, FIELD_B, installDom()

### Community 27 - "RouteAlternativesStep.jsx"
Cohesion: 0.14
Nodes (21): buildRouteAviationLayerChips(), LayerToggleChips(), computeEtaIso(), buildRouteComparison(), exposureNm(), exposureRows(), getFinalRouteGeometry(), HAZARD_KO (+13 more)

### Community 28 - "GroundCurrentWeatherCard.jsx"
Cohesion: 0.13
Nodes (20): computeSunTimes(), dayOfYear(), environmentMetric(), formatClockFromMinutes(), formatGroundNow(), GroundCurrentWeatherCard(), knotsToMs(), normalizeDegrees() (+12 more)

### Community 29 - "BriefingView.jsx"
Cohesion: 0.12
Nodes (26): metLabel(), BriefingBanner(), DRIVER_LABEL, LEVEL_COLOR, NOTAM_CAT_LABEL, ROLE_LABEL, BriefingSynopsis(), CHARTS (+18 more)

### Community 30 - "advisoryLayers.js"
Cohesion: 0.05
Nodes (27): alternateBoardFlights, alternateRailFlights, App(), BoardColumn(), boardFlightGroups, boardFlights, boardForecastAssets, boardMotionModes (+19 more)

### Community 31 - "temperatureOverlaySync.js"
Cohesion: 0.15
Nodes (20): CELSIUS_TEMPERATURE_COLOR_RAMP, createTemperatureFieldSampler(), decodeTemperatureValue(), formatRgba(), gridStep(), interpolateRgba(), kelvinToCelsius(), lerp() (+12 more)

### Community 32 - "App.jsx"
Cohesion: 0.12
Nodes (19): mergeAdvisoryPayloads(), mergeAirportPayloads(), AdminPage, DesignTestPage, DeveloperPage, formatTimeByTz(), MainAppShell(), MonitoringPage (+11 more)

### Community 33 - "airportStationModel.js"
Cohesion: 0.16
Nodes (19): CLASS_LABELS, countAircraft(), GROUP_LABELS, hasActiveFilters(), isFullAltitudeRange(), matchesFilters(), matchesSearch(), OPERATOR_GROUPS (+11 more)

### Community 34 - "Settings.jsx"
Cohesion: 0.11
Nodes (19): Sidebar(), AIRMET_FILTER_LABELS, ALERT_USER_SECTIONS, Settings(), SIGMET_FILTER_LABELS, SIGWX_FILTER_LABELS, TRAFFIC_ALTITUDE_OPTIONS, TRIGGER_LABELS (+11 more)

### Community 35 - "cloudPotentialOverlaySync.js"
Cohesion: 0.16
Nodes (18): CLOUD_POTENTIAL_COLOR_RAMP, createCloudPotentialSampler(), decodeCloudPotentialValue(), decodeScaledValue(), decodeSpreadValue(), getCloudPotentialMaxSpread(), gridStep(), pickCloudPotentialColor() (+10 more)

### Community 36 - "typhoonLayers.js"
Cohesion: 0.17
Nodes (16): addTyphoonLayers(), buildTyphoonGeoJson(), empty(), isSameRow(), ringsFor(), setTyphoonVisibility(), SOURCE_BY_KEY, syncTyphoonLayers() (+8 more)

### Community 37 - "icingPotentialOverlaySync.js"
Cohesion: 0.16
Nodes (17): createIcingPotentialSampler(), decodeIcingGrade(), decodeIcingScore(), decodeScaledValue(), gridStep(), ICING_COLOR_RAMP, pickIcingColor(), FIELD (+9 more)

### Community 38 - "weatherPointInspector.js"
Cohesion: 0.21
Nodes (20): KTG_COLOR_RAMP, useWeatherPointInspector(), buildCloudRow(), buildIcingRow(), buildTemperatureRow(), buildTurbulenceRow(), buildWeatherPointRows(), buildWindRow() (+12 more)

### Community 39 - "fluent.js"
Cohesion: 0.20
Nodes (12): CHANGELOG, UpdatesModal(), AuthModal(), ERROR_KO, matchSearch(), SearchPalette(), TYPE_TAG, ExitOnDoubleBack() (+4 more)

### Community 40 - "useTour.js"
Cohesion: 0.29
Nodes (7): firstVisibleFrom(), shouldAutoStart(), S, TOUR_STEPS, readDone(), useTour(), writeDone()

### Community 41 - "dependencies"
Cohesion: 0.10
Nodes (21): @fluentui/react-components, @fluentui/react-datepicker-compat, @fluentui/react-timepicker-compat, geomagnetism, @mapbox/mapbox-gl-draw, dependencies, @fluentui/react-components, @fluentui/react-datepicker-compat (+13 more)

### Community 42 - "DesignTestPage.jsx"
Cohesion: 0.11
Nodes (9): App(), Boundary, FLUENT_PALETTE, FONTS, GRID_COLS, GRID_ITEMS, appDarkTheme, appLightTheme (+1 more)

### Community 43 - "AVIATION_WFS_LAYERS"
Cohesion: 0.18
Nodes (15): altitudeOverlaps(), bboxNear(), escapeRegExp(), geometryBbox(), matchMoaActivation(), moaMatchKey(), cata7H, cata7L (+7 more)

### Community 44 - "layerActions.js"
Cohesion: 0.15
Nodes (18): BasemapSwitcher(), ALL_ACTIONS, AVIATION_ACTIONS, AVIATION_META, aviationLabel(), BASEMAP_ACTIONS, BASEMAP_META, buildSearchCatalog() (+10 more)

### Community 45 - "notamGeoJson.js"
Cohesion: 0.18
Nodes (16): AREA_LABEL, buildMapLabel(), CAT_SHORT, displayGeometry(), notamToFeatureCollection(), parsePsnPoint(), base, now (+8 more)

### Community 46 - "LevelSliderPanel.jsx"
Cohesion: 0.32
Nodes (10): buildLogo(), loadSvg(), registerAirlineLogos(), AIRLINE_LOGOS, AIRLINE_NAMES, airlineCode(), airlineLogoFile(), airlineLogoId() (+2 more)

### Community 47 - "windOverlaySync.js"
Cohesion: 0.18
Nodes (20): applyVisibility(), bindMapEvents(), buildWindSpeedImage(), canvasFallbackMaps, createRenderer(), defaultFactories, destroyState(), destroyWindOverlay() (+12 more)

### Community 48 - "AirportPanel.jsx"
Cohesion: 0.11
Nodes (16): AIRPORT_NAME_KO, AIRPORT_HEADER_NAME_KO, AirportPanel(), FULL_FEATURE_AIRPORTS, SECTION_ICON, buildCurrentWarningModel(), pickWarningName(), WARNING_NAME_KO (+8 more)

### Community 49 - "WeatherIcon.jsx"
Cohesion: 0.10
Nodes (36): createCanvasImage(), createStationImage(), createWeatherImage(), createWindBarbImage(), ensureMapImage(), fillStationCover(), getPixelRatio(), loadImageElement() (+28 more)

### Community 50 - "FlightAlertDetail.jsx"
Cohesion: 0.24
Nodes (17): useAuth(), FlightAlertDetail(), LEVEL_VAR, useStyles, LEVEL_VAR, NotificationCenter(), NotificationItem(), useStyles (+9 more)

### Community 51 - "deriveNotamTime"
Cohesion: 0.22
Nodes (15): catLabelOf(), NotamTab(), deriveNotamTime(), formatValidPeriod(), NOTAM_CATEGORIES, sortOperationalFirst(), TIME_STATE, CAT_ICON (+7 more)

### Community 52 - "utils/helpers.js"
Cohesion: 0.18
Nodes (15): EMPTY_LIST, formatValidTime(), WARNING_NAME_KO, WarningList(), classifyCeilingCategory(), classifyRvrCategory(), classifyVisibilityCategory(), FLIGHT_CATEGORY_META (+7 more)

### Community 53 - "index.js"
Cohesion: 0.19
Nodes (17): dispatch(), isQuietHours(), setAlertCallback(), SEVERITY_LABELS, SEVERITY_STYLES, evaluate(), alertHistory, buildAlertKey() (+9 more)

### Community 54 - "route-fixture.mjs"
Cohesion: 0.19
Nodes (15): createBriefing(), completeWorkflow(), openRouteBriefing(), selectAirport(), setFlightRule(), altitudeComparison, briefingFor(), crossSection (+7 more)

### Community 55 - "AviationLayerPanel.jsx"
Cohesion: 0.17
Nodes (11): AviationLayerPanel(), GROUPS, LAYER_LABELS, AVIATION_PANEL_MERGE_GROUPS, AVIATION_WFS_LAYERS, TMA_CITY_KO, TMA_CITY_KO_MATCH, TMA_LABEL_MATCH (+3 more)

### Community 56 - "MonitoringPage.jsx"
Cohesion: 0.16
Nodes (12): AlertPanel(), formatTime(), isAlertValid(), SEVERITY_LABEL, SEVERITY_ORDER, AlertSound(), BEEP_FREQ, Header() (+4 more)

### Community 57 - "RouteWeatherLegTable.jsx"
Cohesion: 0.23
Nodes (9): AIRCRAFT_CLASSES, CATEGORY_CLASS, CLASS_WINGSPAN_M, TYPE_CLASS, WINGSPAN_M, buildIcon(), loadSvgImage(), registerAircraftImages() (+1 more)

### Community 58 - "webglWindRenderer.js"
Cohesion: 0.17
Nodes (21): buildTafLineSegments(), buildTafTacLines(), buildTafViewModel(), formatTafClouds(), formatTafHour(), formatTafPeriodRange(), formatTafVisibility(), formatTafWind() (+13 more)

### Community 59 - "useIsMobile"
Cohesion: 0.13
Nodes (16): entriesLeftToRight(), RAINVIEWER_LEGEND, CI_LEGEND, CTPS_LEGEND, HLegend(), css, here, panelSource (+8 more)

### Community 60 - "tafViewModel.js"
Cohesion: 0.42
Nodes (7): DEFAULT_FILTERS, altitudeRange(), CLASS_IDS, parseStoredFilters(), serializeFilters(), stringList(), useTrafficFilters()

### Community 61 - "radarMotionLayers.js"
Cohesion: 0.23
Nodes (12): addOrUpdateGeoJsonSource(), applyData(), arrowTip(), buildMotionHeadGeoJSON(), buildMotionShaftGeoJSON(), EMPTY, ensureArrowImage(), ensureLayers() (+4 more)

### Community 62 - "MonitoringPage"
Cohesion: 0.32
Nodes (12): buildMonitoringSnapshot(), detectMonitoringSnapshotChanges(), fetchJson(), hashOf(), loadChangedMonitoringData(), loadMonitoringAlertDefaults(), loadMonitoringData(), loadMonitoringInitialData() (+4 more)

### Community 63 - "notamViewModel.js"
Cohesion: 0.27
Nodes (10): CATA_7H, comma(), deriveTimeState(), formatAltitude(), formatAltitudeBand(), lowFlToFt(), notamSummary(), purposeKo() (+2 more)

### Community 64 - "PersonalSettingsPanel.jsx"
Cohesion: 0.16
Nodes (16): routeDistanceNm(), segmentNm(), toRad(), formatZAndKst(), isoToLocalInputValue(), localInputToIso(), PersonalSettingsButton(), AlertsTab() (+8 more)

### Community 65 - "routeImport.js"
Cohesion: 0.23
Nodes (14): collectGeometry(), detectFileKind(), disambiguateDuplicateLabels(), extractGeoJsonPaths(), extractGpxPaths(), extractRoutePaths(), isWithinKoreaFir(), KOREA_FIR_BOUNDS (+6 more)

### Community 66 - "changelog.js"
Cohesion: 0.23
Nodes (3): TARGETS, multiRouteFile, test

### Community 67 - "addAviationWfsLayers.js"
Cohesion: 0.23
Nodes (16): addAviationWfsLayers(), addFirLabelLayer(), addHoverLayer(), addPointLabelLayer(), addPointLayer(), addPolygonLabelLayer(), addRouteLabelLayer(), combineFilter() (+8 more)

### Community 68 - "windField.js"
Cohesion: 0.25
Nodes (13): createDownsampledWindField(), createWindFieldSampler(), downsampleCache, formatKimWindMetaLabel(), formatRgba(), formatWindLevelLabel(), gridStep(), interpolateWindSpeedColor() (+5 more)

### Community 69 - "monitoring-personal-slideshow.spec.mjs"
Cohesion: 0.23
Nodes (10): __dirname, openSlideshowTab(), SAMPLE_IMAGE, AIRPORT_INFO_BULLETINS, buildSnapshotMeta(), buildTafPayload(), fulfill(), installMonitoringFixture() (+2 more)

### Community 70 - "airportStationImages.js"
Cohesion: 0.21
Nodes (15): buildStatusText(), getDayTitle(), getWeekdayTone(), GroundForecastPanel(), isPrecipitationIcon(), mapGroundForecastIcon(), renderPeriod(), dateChip() (+7 more)

### Community 71 - "convectiveLayers.js"
Cohesion: 0.28
Nodes (9): coordinates(), EMPTY, ensureCtps(), installConvectiveLayers(), queryCiAtPoint(), syncConvectiveLayers(), canApplyConvectiveResponse(), makeConvectiveRequestKey() (+1 more)

### Community 72 - "mobile-audit-capture.mjs"
Cohesion: 0.21
Nodes (10): airport(), base(), DESKTOP, dismissUpdates(), manifest, MOBILE, openBriefing(), OUT (+2 more)

### Community 73 - "useRouteBriefing.js"
Cohesion: 0.33
Nodes (10): fetchAltitudeComparison(), fetchCrossSection(), fetchRouteBriefing(), fetchRouteExposure(), fetchRouteExposureBatch(), fetchVerticalProfile(), postJson(), resolveDemoEtd() (+2 more)

### Community 74 - "typhoonListModel.js"
Cohesion: 0.25
Nodes (12): assignTyphoonColors(), TYPHOON_PALETTE, buildTrackRows(), buildTyphoonListItems(), DIR_KO, formatRadius(), formatTrackTime(), INTENSITY_STEPS (+4 more)

### Community 75 - "devDependencies"
Cohesion: 0.15
Nodes (13): @axe-core/playwright, devDependencies, @axe-core/playwright, playwright, @playwright/test, vite, @vitejs/plugin-react, @xmldom/xmldom (+5 more)

### Community 76 - "TafTab.jsx"
Cohesion: 0.31
Nodes (8): bindAdsbHover(), AIRPORT_NAMES_KO, airportLabel(), fetchRoute(), routeCache, routeLabel(), TYPE_NAMES_KO, typeNameKo()

### Community 77 - "mapStyleSync.test.js"
Cohesion: 0.26
Nodes (11): addAirportLayers(), addGeoBoundaryLayers(), AIRPORT_INTERACTIVE_LAYERS, BASE_MAP_LAYER_IDS, BASE_MAP_SOURCE_IDS, GEO_LAYERS, geoLayerInZoomRange(), geoZoomHandlers (+3 more)

### Community 78 - "AltitudeWeatherComparison.jsx"
Cohesion: 0.30
Nodes (10): AltitudeWeatherComparison(), constraintLabel(), formatAltitude(), hasSeverity(), SEVERITY_LABEL, severityBadge(), warningMessages(), HazardIcon() (+2 more)

### Community 79 - "manualRouteInput.js"
Cohesion: 0.38
Nodes (10): formatCoordinateToken(), formatManualRouteString(), formatVfrDraftText(), normalize(), parseCoordinateToken(), parseManualRouteString(), parseVfrDraftText(), frontendRoot (+2 more)

### Community 80 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, dev, dev:contract, dev:contract:fast, lint:colors, preview, screenshots:responsive (+4 more)

### Community 81 - "AirportInfoTab.jsx"
Cohesion: 0.29
Nodes (6): AirportInfoDocument(), BulletText(), fmtBulletinTime(), AirportInfoTab(), fitScale(), MonitoringWxInfoSlide()

### Community 82 - "ktgTurbulenceOverlaySync.js"
Cohesion: 0.26
Nodes (9): pickKtgRgba(), buildKtgImage(), destroyKtgTurbulenceOverlay(), KTG_IMAGE_LAYER_IDS, KTG_IMAGE_SOURCE_IDS, setVisible(), stateByMap, syncKtgTurbulenceOverlay() (+1 more)

### Community 83 - "lightningLayers.js"
Cohesion: 0.33
Nodes (10): addLightningLayers(), buildLightningOpacityExpression(), createLightningCrossImage(), createLightningGeoJSON(), ensureLightningIcons(), getLightningAgeBand(), LIGHTNING_AGE_BANDS, setLightningBlinkState() (+2 more)

### Community 84 - "echo-top.spec.mjs"
Cohesion: 0.23
Nodes (10): BOUNDS, closePanelAndClickMap(), echoTopFrame(), installFixture(), panelToggle(), POINT_WITH_TIME, radarFrame(), revealLegends() (+2 more)

### Community 85 - "moa-activation.spec.mjs"
Cohesion: 0.29
Nodes (8): base(), CAPTURED, HHMM(), moaActivationNotam(), moaActivationNotamDefinite(), moaActivationNotamUnreadable(), openMoaLayer(), openWith()

### Community 86 - "mobile-audit.mjs"
Cohesion: 0.20
Nodes (6): airportTabs, OUT_DIR, results, shot(), step(), VIEWPORT

### Community 87 - "layoutTokens.test.js"
Cohesion: 0.18
Nodes (10): airportCss, appCss, css, mapCss, mapView, monitoringCss, monitoringPage, monitoringSettings (+2 more)

### Community 88 - "aircraftProfiles.js"
Cohesion: 0.36
Nodes (7): DEFAULT_PERFORMANCE_BY_RULE, fallback, getLastUsed(), getPerformanceForRule(), readJson(), setPerformanceForRule(), store()

### Community 89 - "useRouteBriefing"
Cohesion: 0.39
Nodes (7): formatAltitude(), initialBearingDeg(), magneticCourse(), minVfrCruiseAltitude(), nearestVfrCruiseAltitude(), stepAltitude(), vfrCruiseHint()

### Community 90 - "reachBriefingResult"
Cohesion: 0.31
Nodes (7): OUT, result, pickDropdown(), reachBriefingResult(), settle(), __dirname, run()

### Community 91 - "imageOverlay.js"
Cohesion: 0.33
Nodes (7): addOrUpdateImageOverlay(), buildImageCoordinates(), frameSourceId(), hashImageOverlayKey(), imageOverlayKey(), imageOverlayState, rasterLayer()

### Community 92 - "setMapLayerVisible"
Cohesion: 0.46
Nodes (7): setMapLayerVisible(), addRasterLayer(), coverageUrl(), syncRainviewerLayers(), tileUrl(), setSigwxLowVisibility(), syncRasterAndSigwxLayers()

### Community 93 - "legHighlight.js"
Cohesion: 0.31
Nodes (7): addLegHighlightLayer(), emptyGeoJSON, indexOfPoint(), legCoordinates(), sameCoord(), syncLegHighlight(), preview

### Community 94 - "createRouteEditor"
Cohesion: 0.51
Nodes (8): copy(), createRouteEditor(), editorFromBase(), emptyEditorForContext(), emptyEnroute(), replaceEditorEnroute(), replaceEditorProcedures(), updateEditorContext()

### Community 95 - "routeStore.js"
Cohesion: 0.21
Nodes (16): get(), getNotifications(), getProcessorLog(), getRequestLog(), getSnapshotMeta(), getStoreStats(), getVitals(), DeveloperConsole() (+8 more)

### Community 96 - "resolveWeatherVisual"
Cohesion: 0.38
Nodes (9): iconRank(), isDaytime(), mapCloudsToIconId(), mapDisplayCloudsToIconId(), mapWeatherCodeToIconId(), pickRepresentativeWeather(), resolveWeatherIconKey(), resolveWeatherVisual() (+1 more)

### Community 97 - "radar-motion.spec.mjs"
Cohesion: 0.27
Nodes (8): BOUNDS, headState(), installMotionFixture(), layerState(), OBSERVED_AT_MS, radarFrame(), shaftState(), TM

### Community 98 - "AirportTooltip.jsx"
Cohesion: 0.15
Nodes (16): getDensityFactor(), compileShader(), createParticleFragmentShader(), createProgram(), createVectorTextureData(), DEFAULTS, getBackingStorePixelRatio(), getDensityFactor() (+8 more)

### Community 99 - "routeDesignColors.test.js"
Cohesion: 0.24
Nodes (12): areaKm2(), declinationAt(), distanceNm(), magneticBearing(), pathLengthNm(), ringPolygon(), BUSAN, SEOUL (+4 more)

### Community 100 - "routeDesigns.js"
Cohesion: 0.47
Nodes (7): copyEditable(), createRouteDesign(), duplicateRouteDesign(), nextDesignId(), removeRouteDesign(), renameRouteDesign(), snapshotRouteDesign()

### Community 101 - "flightCategoryLayers.js"
Cohesion: 0.57
Nodes (6): SettingsModal(), applyFont(), ensureFontLoaded(), FONT_OPTIONS, getFontPref(), loadStoredFont()

### Community 102 - "port-guard.mjs"
Cohesion: 0.33
Nodes (8): artifactPath, commandOutput(), conflicts, listeners(), listenersViaLsof(), listenersViaSs(), ports, rootDir

### Community 103 - "package.json"
Cohesion: 0.25
Nodes (7): engines, node, name, packageManager, private, type, version

### Community 104 - "manifest.json"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 105 - "responsive-screenshots.mjs"
Cohesion: 0.25
Nodes (7): capturedAt, commit, manifest, OUT_DIR, routes, stamp, viewports

### Community 106 - "resolveAirportBanner"
Cohesion: 0.36
Nodes (5): isAirportDaytime(), observationText(), resolveAirportBanner(), airport, lowVisibility

### Community 107 - "echoTopLayers.js"
Cohesion: 0.39
Nodes (4): imageCoordinates(), syncEchoTopLayer(), frame, useEchoTopOverlay()

### Community 108 - "typhoon.spec.mjs"
Cohesion: 0.32
Nodes (6): dir, empty, openTyphoon(), openWeatherPanel(), snapshot, weatherEntry()

### Community 109 - "fir-tick-zoom-capture.mjs"
Cohesion: 0.33
Nodes (6): CENTER, CLIP, __dirname, run(), shoot(), stamp

### Community 110 - "lint-colors.mjs"
Cohesion: 0.29
Nodes (4): DENY, findings, root, strict

### Community 111 - "overseas-airway-clip-capture.mjs"
Cohesion: 0.33
Nodes (6): __dirname, LAYERS, run(), shoot(), stamp, VIEWS

### Community 112 - "overseas-hover-capture.mjs"
Cohesion: 0.33
Nodes (6): COORDS, __dirname, hoverTooltip(), run(), stamp, TARGETS

### Community 113 - "alert-dispatcher.js"
Cohesion: 0.18
Nodes (10): DeveloperConsole, MobileMoreMenu(), bottomItems, PANEL_MAP, topItems, authApi(), AuthContext, AuthProvider() (+2 more)

### Community 114 - "buildRawWindsTable"
Cohesion: 0.67
Nodes (5): altitudeAtDistance(), buildRawWindsTable(), nearestValue(), pickColumns(), uvToWind()

### Community 115 - "routePlanner.cache.test.js"
Cohesion: 0.33
Nodes (4): AIRPORTS, ENROUTE, jsonResponse(), stubFetch()

### Community 116 - "verticalProfileRequest.js"
Cohesion: 0.62
Nodes (5): buildCrossSectionRequest(), buildProcedureContextPayload(), buildProcedurePayload(), buildRouteProfileMarkersPayload(), buildVerticalProfileRequest()

### Community 117 - "tokens.js"
Cohesion: 0.33
Nodes (5): color, CSS_VARS, space, css, parsed

### Community 118 - "vprofile-scroll-capture.mjs"
Cohesion: 0.40
Nodes (5): __dirname, outDir, pickAirport(), run(), stamp

### Community 119 - "BriefingView.responsive.test.js"
Cohesion: 0.33
Nodes (5): css, jsx, profileChartJsx, profileWindowCss, profileWindowJsx

### Community 120 - "metLayerVisibility.js"
Cohesion: 0.53
Nodes (4): clearVerticalSliderGroup(), getNextMetVisibility(), KIM_LAYER_IDS, VERTICAL_SLIDER_GROUP_IDS

### Community 121 - "route-import-capture.mjs"
Cohesion: 0.50
Nodes (4): __dirname, fixturesDir, openVfrPanel(), run()

### Community 122 - "route-import-real-files-capture.mjs"
Cohesion: 0.50
Nodes (4): __dirname, fixturesDir, openVfrPanel(), run()

### Community 124 - "procedureData.js"
Cohesion: 0.60
Nodes (4): cache, getProcedures(), loadFile(), PROCEDURE_FILES

### Community 125 - "ConvectiveOverlayCard.jsx"
Cohesion: 0.70
Nodes (4): ConvectiveOverlayCard(), ctpsColor(), formatCoordinate(), formatObservedAt()

### Community 126 - "PressureLevelSlider.test.js"
Cohesion: 0.40
Nodes (4): css, here, source, trackSource

### Community 127 - "playwright.config.js"
Cohesion: 0.50
Nodes (3): artifactDir, frontendDir, rootDir

### Community 134 - "vfr-layout-capture.mjs"
Cohesion: 0.67
Nodes (3): addFix(), __dirname, run()

### Community 136 - "EchoTopCard.jsx"
Cohesion: 0.29
Nodes (12): AirportTooltip(), formatClouds(), formatObsTime(), formatQnh(), formatTempDew(), formatVisibility(), formatWeather(), formatWind() (+4 more)

### Community 143 - "notamSchedule.test.js"
Cohesion: 0.24
Nodes (8): COLOR_OPTIONS, DRAW_FEATURE_COLOR_EXPR, DRAW_STYLES, PREVIEW_FEATURE_COLOR_EXPR, usePolygonDraw(), ADR-0001, useMapTools(), useMeasureOverlay()

### Community 148 - "geomagnetism"
Cohesion: 0.60
Nodes (6): clearMonitoringSlideImage(), hasIndexedDb(), loadMonitoringSlideImage(), openImageDb(), runTransaction(), saveMonitoringSlideImage()

### Community 151 - "@mapbox/mapbox-gl-draw"
Cohesion: 0.47
Nodes (3): applyAdsbFilter(), LOGO_BASE_FILTER, adsbIdFilter()

### Community 156 - "react-dom"
Cohesion: 0.33
Nodes (4): mapView, metPanel, mobile, sidebar

### Community 171 - "BriefingSynopsis.jsx"
Cohesion: 0.50
Nodes (6): isRevealed(), rectOf(), resolveTargetRect(), revealRect(), placeTooltip(), TourOverlay()

### Community 172 - "AirportPickerField.jsx"
Cohesion: 0.83
Nodes (3): AirportPickerField(), REGION_ORDER, regionRank()

### Community 180 - "resolveSettings"
Cohesion: 0.39
Nodes (6): clearPersonalSettings(), deepMerge(), loadPersonalSettings(), migratePersonalSettings(), resolveSettings(), savePersonalSettings()

### Community 181 - "DeveloperPage.jsx"
Cohesion: 0.43
Nodes (5): getHealth(), DeveloperConsole, DeveloperConsoleButton(), DeveloperPage(), useStyles

## Knowledge Gaps
- **525 isolated node(s):** `name`, `private`, `version`, `type`, `node` (+520 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **43 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTimeZone()` connect `useTimeZone` to `App.jsx`, `flightCategoryLayers.js`, `EchoTopCard.jsx`, `MapView.jsx`, `AirportPanel.jsx`, `VerticalProfileChart.jsx`, `RouteBriefingPanel.jsx`, `webglWindRenderer.js`, `BriefingView.jsx`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `band()` connect `advisoryLayers.js` to `Settings.jsx`, `lightningLayers.js`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `useRouteBriefing()` connect `routeBriefingModel.js` to `routePlanner.js`, `mobile-audit-capture.mjs`, `useRouteBriefing.js`, `MapView.jsx`, `routePreview.js`, `manualRouteInput.js`, `verticalProfileRequest.js`, `aircraftProfiles.js`, `useRouteBriefing`, `procedureData.js`, `createRouteEditor`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useRouteBriefing()` (e.g. with `airport()` and `buildBriefingRoute()`) actually correct?**
  _`useRouteBriefing()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _525 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `weatherApi.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05428150641699979 - nodes in this community are weakly interconnected._
- **Should `useTimeZone` be split into smaller, more focused modules?**
  _Cohesion score 0.07627118644067797 - nodes in this community are weakly interconnected._