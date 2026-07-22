# Plan: Monitoring Personal Slideshow

**Spec:** docs/superpowers/specs/2026-07-22-monitoring-personal-slideshow.md
**Goal:** Add a browser-local, time-limited slideshow to monitoring settings that alternates the current monitoring view or live map with one local image, without any server API or AWS change.

## Global Constraints

- Keep all slideshow configuration and image bytes in the current browser profile; do not add backend routes, storage, dependencies, or network requests.
- Whole-screen rotation pairs the currently selected mode with the image only; operations and ground never rotate into each other.
- Keep MapView mounted during map-panel image display, keep alerts above image overlays, and preserve reduced-motion behavior.
- Use the existing monitoring settings modal and inline surfaces, but make the slideshow controls controlled by one MonitoringPage state.
- Follow docs/policies/engineering/workflow-and-tools.md, docs/policies/design/design-language.md, docs/policies/encoding-safety.md, and the documented Playwright dev-server procedure.

---

## Task 1: Browser-local slideshow model and persistence

**Files:**
- Create: frontend/src/features/monitoring/lib/monitoringSlideshow.js
- Create: frontend/src/features/monitoring/lib/monitoringSlideshow.test.js

**Interfaces:**
- Produces: DEFAULT_MONITORING_SLIDESHOW_CONFIG, normalizeMonitoringSlideshowConfig, validateMonitoringSlideshowConfig, getMonitoringSlideshowStatus, nextMonitoringSlide, loadMonitoringSlideshowConfig, saveMonitoringSlideshowConfig, loadMonitoringSlideImage, saveMonitoringSlideImage, clearMonitoringSlideImage.
- Consumes: native localStorage, IndexedDB, URL.createObjectURL, and URL.revokeObjectURL only.

- [ ] Step 1: Add a failing Node test for default configuration, a valid same-day range, a valid overnight range, a waiting state, an active state, an ended state, a 5–3,600 second interval boundary, and equal start/end rejection.
- [ ] Step 2: Implement the pure configuration and schedule functions. Use the browser local date/time, return off, waiting, active, or ended status, and return the next slide as live or image without changing the current dashboard mode.
- [ ] Step 3: Implement browser-only persistence: a versioned localStorage key for configuration and a single IndexedDB record for the PNG/JPEG/WebP File or Blob. Reject SVG and every MIME type outside image/png, image/jpeg, and image/webp before persistence.
- [ ] Step 4: Make all persistence functions return a recoverable result object instead of throwing into rendering, so the caller can retain the current session configuration and show a reload-persistence warning.
- [ ] Step 5: Verify — run node --test frontend/src/features/monitoring/lib/monitoringSlideshow.test.js. Expected: all schedule and validation cases pass.

## Task 2: Slideshow runtime and reusable image overlay

**Files:**
- Create: frontend/src/features/monitoring/useMonitoringSlideshow.js
- Create: frontend/src/features/monitoring/MonitoringSlideOverlay.jsx
- Modify: frontend/src/features/monitoring/MonitoringPage.css:1-65
- Test: frontend/src/features/monitoring/lib/monitoringSlideshow.test.js

**Interfaces:**
- Consumes: the Task 1 configuration, schedule, image, and next-slide functions.
- Produces: useMonitoringSlideshow(config, imageBlob, imageRevision) returning status, visibleSlide, imageUrl, persistenceError, preview, stop, and clearPreview; MonitoringSlideOverlay receiving visible, imageUrl, scope, onStop, and statusLabel.

- [ ] Step 1: Implement useMonitoringSlideshow with one clock effect for the daily schedule and one interval effect that runs only while status is active or preview is on. Reset the visible slide to live whenever the feature stops, the schedule ends, or the user exits.
- [ ] Step 2: Reload the supplied imageBlob whenever imageRevision changes, create one object URL for rendering, and revoke the previous URL before replacement and on unmount. Do not make the hook reread IndexedDB: MonitoringPage supplies the in-session Blob so replacement, removal, and a persistence failure immediately update the current session.
- [ ] Step 3: Implement MonitoringSlideOverlay as a raster image overlay with a clearly labelled immediate-exit button. Use a 350 ms opacity transition and a prefers-reduced-motion media rule that removes the transition.
- [ ] Step 4: Give the overlay distinct whole-screen and map-panel scope classes. Do not unmount children behind the overlay.
- [ ] Step 5: Verify — extend the Task 1 test with a next-slide sequence assertion and run node --test frontend/src/features/monitoring/lib/monitoringSlideshow.test.js. Expected: live → image → live and all existing cases pass.

## Task 3: Preserve monitoring and map state while rendering slides

**Files:**
- Modify: frontend/src/features/monitoring/MonitoringPage.jsx:176-650
- Modify: frontend/src/features/monitoring/MonitoringMap.jsx:6-62
- Modify: frontend/src/features/monitoring/MonitoringPage.css:6-65

**Interfaces:**
- Consumes: useMonitoringSlideshow and MonitoringSlideOverlay from Task 2.
- Produces: MonitoringPage-owned slideshowConfig state and image actions; MonitoringMap props slideshowVisible, slideshowImageUrl, onStopSlideshow, and slideshowStatusLabel.

- [ ] Step 1: In MonitoringPage, initialize slideshow configuration from loadMonitoringSlideshowConfig and its Blob from loadMonitoringSlideImage. Keep the current imageBlob and an incrementing imageRevision in MonitoringPage, and pass both with the configuration to useMonitoringSlideshow. Save only validated configuration changes through saveMonitoringSlideshowConfig and surface persistenceError next to the settings controls.
- [ ] Step 1a: On image choose, validate before setting the in-session imageBlob, increment imageRevision, then call saveMonitoringSlideImage. On remove, clear the in-session Blob, increment imageRevision, then call clearMonitoringSlideImage. If either persistence call fails, retain the in-session result and show the reload-persistence warning.
- [ ] Step 2: Render the whole-screen MonitoringSlideOverlay as a sibling above dashboard-root only when target is whole-screen and visibleSlide is image. Keep dashboard-root mounted underneath, preserve dashboardMode, and route the overlay exit action to stop.
- [ ] Step 3: Pass map-only slideshow state into MonitoringMap. Render MonitoringSlideOverlay inside monitoring-mapbox-panel above MapView only when target is map-panel and visibleSlide is image; never conditionally remove MapView or the map layer controls.
- [ ] Step 4: Route every Stop and image-overlay exit action through one MonitoringPage callback that sets enabled to false, persists that configuration, resets the live slide, and reports a persistence warning if saving fails. Preview end only restores the live slide; it must not silently re-enable a stopped configuration.
- [ ] Step 5: Assign z-index values so whole-screen and map overlays cover their intended visual regions, AlertPopup and AlertMarquee remain above whole-screen overlays, and the overlay exit control stays reachable.
- [ ] Step 6: Verify — inspect the running fixed-data page with Playwright after Tasks 2–4: image replacement/removal changes the visible overlay without a reload, stopping writes enabled=false, MapView remains mounted through map-panel display, and an alert surface is above the overlay. The repeatable contract is added in Task 5.

## Task 4: Controlled slideshow controls in both monitoring settings surfaces

**Files:**
- Modify: frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx:90-240, 360-560
- Modify: frontend/src/features/monitoring/MonitoringPage.jsx:360-490, 560-645
- Modify: frontend/src/features/monitoring/legacy/App.css: existing alert-settings tab and row styles

**Interfaces:**
- Consumes: MonitoringPage props slideshowConfig, slideshowStatus, slideshowImageInfo, slideshowPersistenceError, onSlideshowConfigChange, onSlideImageChoose, onSlideImageRemove, onSlideshowPreview, and onSlideshowStop.
- Produces: a controlled 화면 전환 settings tab usable in the modal and inline Settings surfaces.

- [ ] Step 1: Add controlled props to Settings and a 화면 전환 tab beside the existing general, alert, traffic, and advisory tabs. Do not create local useState for the slideshow fields.
- [ ] Step 2: Add the enabled switch, mutually exclusive target controls, 5–3,600 second number input, start/end time inputs, immediate preview button, immediate stop button, and status text. Show an inline validation message for equal start/end times and invalid intervals.
- [ ] Step 3: Add a file input accepting only PNG, JPEG, and WebP, a selected-image name, replace/remove actions, the browser-profile-only notice, and the persistence-error notice from Task 3.
- [ ] Step 4: Wire both renderSettingsPanel variants in MonitoringPage to the same controlled props and callback functions so a change applied through one surface is immediately reflected in the other surface.
- [ ] Step 5: Verify — manually open the inline settings surface and the modal surface in the fixed-data app, change each slideshow field in one surface, and confirm the other shows the same value without reopening the page. Stop from either surface, reload, and confirm it remains disabled.

## Task 5: Browser contracts, regression verification, and architecture record

**Files:**
- Create: frontend/verification/contracts/monitoring-personal-slideshow.spec.js
- Modify: Architecture.md: File Roles — Frontend monitoring entries
- Modify: docs/superpowers/status/monitoring-personal-slideshow.status.md

**Interfaces:**
- Consumes: the completed settings controls and DOM labels from Tasks 3–4.
- Produces: repeatable Playwright evidence for the approved slideshow behavior.

- [ ] Step 1: Add a Playwright contract that opens /monitoring, selects a generated in-memory PNG through the slideshow file input, configures a five-second whole-screen preview, and asserts that the dashboard remains mounted behind the image overlay, the exit button returns to live view, and operations/image never displays the ground view. Repeat after selecting ground mode and assert ground/image never displays operations.
- [ ] Step 2: Add a Playwright contract that configures map-panel preview, records the map canvas element identity and an open map-layer-panel marker, cycles image → live, and asserts both remain. Assert that surrounding cards remain visible and invalid equal start/end times block activation.
- [ ] Step 3: Add a Playwright contract that uses a fresh browser context to confirm the image/schedule are absent, sets a short active time range to confirm scheduled stop restores live view, stops the slideshow then reloads to confirm enabled remains false, and verifies that edits in inline and modal settings surfaces stay synchronized.
- [ ] Step 4: Add a Playwright contract that enables reduced motion, asserts the image overlay has no transition duration, forces the existing monitoring alert fixture/state while an image is visible and asserts its computed z-index is above the overlay, and confirms image selection produces no request carrying image bytes outside browser-local storage.
- [ ] Step 5: Add a focused failure-path test by stubbing the browser-local persistence call, then assert image replacement still updates the current session and a reload-persistence warning is visible.
- [ ] Step 6: Update Architecture.md File Roles with the new slideshow model, hook, overlay, and browser-local persistence responsibilities.
- [ ] Step 7: Verify — run node --test frontend/src/features/monitoring/lib/monitoringSlideshow.test.js; npm.cmd run dev:contract -- --grep monitoring-personal-slideshow; npm.cmd run build --prefix frontend; npm.cmd run smoke:responsive --prefix frontend. Expected: all tests and build pass, contracts cover the approved behavior and failure paths, contract screenshots have no overflow, and the existing responsive smoke remains clean.
- [ ] Step 8: Update the status file with the completed task, verification commands and results, next task, and any deviations before ending the implementation session.
