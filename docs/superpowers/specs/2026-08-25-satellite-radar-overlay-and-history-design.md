# Satellite, Radar Overlay, and History Normalization

## Goal

Make visible satellite, infrared satellite, CI, and CTPS use one observed-data history contract, while keeping radar echoes legible above either satellite product.

## Scope

- The satellite-family history is one frame every 10 minutes, 19 frames, including the newest frame and the frame exactly three hours earlier.
- The satellite collector may check upstream availability every five minutes. It must not download or publish an already processed observation time again.
- On deployment, backfill the missing history immediately: seven visible frames and one oldest frame for each of IR105, FOG, CI, and CTPS.
- Publish visible and infrared valid pixels with alpha 255. Preserve transparent pixels where source data is absent.
- Render the satellite image layers at opacity 1.0 so the basemap cannot tint valid satellite pixels.
- Establish a deterministic Mapbox stacking order: infrared satellite below visible satellite, both below radar echo. Radar remains on top regardless of asynchronous metadata or image arrival order.
- Preserve the current shared Korea display grid and geographic bounds. This is compositing and history normalization, not an attempt to invent detail beyond GK2A's native infrared resolution.
- Keep HSR, HCI, inactive radar echo-bin collection, and inactive Echo Top collection out of this change.

## Data Contract

- The 19-frame retention window represents exactly 180 minutes at 10-minute spacing.
- Each product retains its last usable published set when a new collection or backfill item fails; incomplete collection must not replace valid metadata or assets.
- Immediate backfill is a one-time startup/deployment action. Normal steady-state API traffic remains unchanged because collection deduplication prevents repeated requests for the same source timestamp.
- The expected extra retained output is content-dependent and is approximately 6.5 MiB with the sampled production assets: about 0.65 MiB for seven visible WebPs, 0.21 MiB for one IR WebP, and 5.65 MiB for one CTPS binary plus CI/WebP output.

## Implementation Boundaries

- Backend collection, retention, metadata, and backfill changes remain in the existing satellite and convective-satellite processors/stores.
- Mapbox source/layer ordering and image opacity remain in the existing weather-overlays and shared image-overlay adapter. `MapView` continues to orchestrate sync only.
- No new API endpoints, configuration surface, packages, or UI controls are required.

## Verification

- Focused backend tests verify 19 retained frames, exact three-hour history, startup backfill request selection, and same-timestamp deduplication.
- Focused parser tests verify visible and infrared valid-pixel alpha is 255 and missing pixels remain transparent.
- Focused frontend tests verify the canonical satellite/radar layer order survives first render, frame replacement, and style reload.
- Browser verification captures visible plus radar and infrared plus radar, confirming radar echo stays equally legible and the basemap does not bleed through valid satellite imagery.
- Run the focused test suites and frontend production build before release. After deployment, verify published metadata exposes 19 frames at 10-minute intervals and the immediate backfill completed.
