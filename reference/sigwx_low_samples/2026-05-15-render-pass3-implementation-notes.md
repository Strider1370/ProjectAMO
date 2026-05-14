# SIGWX_LOW render pass3 implementation notes

Date: 2026-05-15

## Scope

This pass intentionally stayed inside SIGWX element rendering. Map framing, projection, Mapbox basemap, FIR/grid, and the official chart issue box were not changed.

## Improved

- Turbulence and icing marker labels now prefer compact altitude chips such as `XXX/060`, `XXX/010`, and `050/020` instead of descriptive `MOD TURB` / `MOD ICING` map text.
- Turbulence and icing icons are still rendered next to those altitude chips, with smaller icon scale.
- Source line widths are normalized down for SIGWX vector features, and Mapbox dash arrays were tightened for denser official-chart-like dashes.
- CB/cloud scallop samples are generated at a shorter repeat interval with smaller symbol metadata and a smaller offset from the polygon edge.
- Cloud labels supplied by backend special-line features are no longer duplicated by the frontend phenomenon fallback label path.
- Fog/mist, rain, mountain-obscuration, wind diamond, turbulence, and icing symbols were scaled down to reduce visual density.
- Label chip artwork and text padding were reduced. Most text-chip layers now participate in Mapbox placement instead of forcing overlap.

## Visual Checks

Updated `site-render-pass2.png` captures were regenerated for all pass2 samples with the required flow: new page load per sample, one Zoom out click, FIR off, airports off, SIGWX on, debug sample selected.

Representative checks:

- `2026040205`: `MOD_ICE` now appears as a small icing icon plus `XXX/060` altitude chip.
- `2026042817`: `moderate_turbulence` now appears as a small turbulence icon plus `XXX/010` altitude chip; blue wind diamond and green hatching are smaller.
- `2026041511`: CB scallops are smaller and cloud labels are no longer duplicated; fog/mist triple-line symbols are reduced.
- `2026012623`: mixed icing/turbulence markers use compact altitude chips across the complex Japan/Korea region.

## Remaining

- CB scallop geometry is still text-symbol based, so it approximates a scalloped edge but is not yet a true stroked scallop path clipped to the cloud polygon boundary.
- Some complex areas around western/southern Japan still have unavoidable proximity between cloud labels, visibility labels, hatching, and cloud boundaries.
- Visibility/weather labels such as combined `new_snow2 / rain / widespread_fog` are still descriptive when the source label itself is descriptive.
- Edge-aware label placement is still Mapbox-placement based; there is not yet a dedicated chart-space collision solver.

## Next Priority

1. Replace text-symbol cloud scallops with generated scallop polylines or small arc geometries clipped along the source boundary.
2. Add chart-space label candidate positions for visibility/weather and cloud labels before conversion to Mapbox coordinates.
3. Split combined visibility/weather descriptive labels into symbol clusters plus compact condition/height chips where the source data supports it.
4. Tune front symbol geometry separately from general SIGWX line density.
