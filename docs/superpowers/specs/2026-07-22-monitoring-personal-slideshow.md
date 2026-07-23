# Spec: Monitoring Personal Slideshow

**Status:** Approved
**Created:** 2026-07-22

## Problem / Goal

A user viewing the monitoring page needs a personal, time-limited display mode for a local kiosk or desktop. It must rotate a monitoring view with a user-selected image without changing AWS server settings, server data, or any other user's screen.

## Requirements

- FR-001: The monitoring settings dialog MUST provide a personal 화면 전환 control area with an enabled/disabled switch, a transition interval of 5 to 3,600 seconds, a daily start time, and a daily end time. Equal start and end times MUST be rejected with an explanation.
- FR-002: The feature MUST offer two independently selectable targets: whole-screen rotation and map-panel-only rotation. The first version MUST prevent both targets from running at the same time.
- FR-003: Whole-screen rotation MUST alternate only between the operations monitoring view and the selected local image; it MUST NOT rotate to the ground monitoring view.
- FR-004: When the user selects the ground monitoring view, whole-screen rotation MUST alternate only between the ground monitoring view and the selected local image; it MUST NOT rotate to the operations monitoring view.
- FR-005: Map-panel-only rotation MUST alternate only between the live map panel and the selected local image while the rest of the monitoring dashboard remains visible and continues to update.
- FR-006: The active time range MUST repeat daily in the browser's local time and support a range that crosses midnight. Outside the range, rotation MUST stop and restore the monitoring or map view last selected by the user.
- FR-007: A user MUST be able to preview the configured transition immediately, disable it immediately, and see whether the feature is off, waiting, or active and when it will stop. The image slide MUST retain an always-visible control that exits the slideshow immediately.
- FR-008: Images MUST be chosen from the current device only, limited to PNG, JPEG, and WebP, and stored only in that browser profile. No image bytes, image URL, schedule, or settings may be sent to the application server.
- FR-009: The settings UI MUST allow the user to replace or remove the local image. It MUST explain that the image and schedule do not appear on another device or browser profile. If browser-local persistence fails, the UI MUST explain that the current session can continue but the configuration will not survive a reload.
- FR-010: The settings UI MUST let the user choose the transition effect between a short fade and a short slide, and adjust the transition animation duration within a 100-2,000 millisecond range. The feature MUST respect the user's reduced-motion preference by switching without animation regardless of the chosen effect or duration.
- FR-011: Existing monitoring data polling, alert evaluation, alert popups, and manual mode controls MUST continue to work while the slideshow is active. Active alert popups and marquees MUST render above the image slide and must not be delayed or hidden by a transition.
- FR-012: Map-panel-only rotation MUST keep the live map mounted behind the image slide so its camera, loaded data, and open layer-panel state survive every transition.
- FR-013: The inline and modal monitoring settings surfaces MUST read and write one shared slideshow configuration in MonitoringPage; opening both surfaces must not create divergent local configurations.
- FR-014: The slideshow feature (settings controls, preview, and rotation) MUST be unavailable on the mobile phone-task layout (viewport ≤719px, the same breakpoint that switches the dashboard to the weather/map/settings tab layout). Any active rotation MUST stop and restore the live view if the viewport crosses into that width while running.

## Non-Goals (out of scope)

- Server-side image uploads, AWS storage, administrator-managed slide libraries, or sharing slides between users.
- Changing server-side monitoring data, monitoring settings for other users, or the AWS deployment configuration.
- Automatic browser full-screen permission requests.
- More than one local image or a custom slide playlist in the first version.
- Rotating operations and ground views with each other.

## Success Criteria

- SC-001: Enabling operations whole-screen rotation during its configured time range visibly alternates operations and the selected image at the configured interval, without displaying the ground view.
- SC-002: Enabling ground whole-screen rotation during its configured time range visibly alternates ground and the selected image at the configured interval, without displaying the operations view.
- SC-003: Enabling map-panel rotation visibly alternates only the map panel and the selected image while surrounding monitoring cards remain visible.
- SC-004: At the configured end time, the active rotation stops and the user returns to their last monitoring or map view without a page reload.
- SC-005: A separate browser profile and a separate device receive neither the configured schedule nor the selected image.
- SC-006: A network inspection during image selection and rotation shows no request carrying the local image to the server.
- SC-007: Users with reduced motion enabled see an immediate swap rather than a fade animation.
- SC-008: An active alert popup or marquee remains visible above an image slide, and the image slide offers an immediately available exit control.
- SC-009: Map-panel rotation preserves the map camera and an already open map layer panel after multiple image/map transitions.
- SC-010: Changes saved from either the inline or modal settings surface appear in the other surface without conflicting values.
- SC-011: Invalid intervals and equal start/end times are rejected before activation, and a browser-local persistence failure explains that reload persistence is unavailable.
- SC-012: At a viewport of 719px or narrower, the slideshow settings controls are unavailable and no rotation runs; resizing an active desktop session below that width stops rotation and restores the live view.

## Alternatives Considered

| Option | Trade-off | Why not chosen |
|---|---|---|
| Server-managed slides and administrator uploads | Shared across devices, but requires upload security, storage, and access-control work | The requested use is personal and must not affect the server or other users. |
| Rotate operations, ground, and image together | Provides more content, but makes the display sequence less predictable | The requested pair is one monitoring view and one selected image. |
| Store only in volatile browser memory | Simplest implementation, but loses the image after refresh | Browser-local persistence is needed for a practical personal display mode. |

## Open Questions

- None for the first version. The selected local image is available to both operations/image and ground/image pairs, as approved.
