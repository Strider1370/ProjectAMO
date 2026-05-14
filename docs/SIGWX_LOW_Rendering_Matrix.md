# SIGWX_LOW Rendering Matrix

This matrix is generated from paired SIGWX_LOW XML/PNG samples. Update `renderRole` and `semanticRole` manually after comparing each row against target chart images.

| Count | Samples | Item Key | Example Labels | Semantic Role | Render Role |
| ---: | ---: | --- | --- | --- | --- |
| 45 | 13 | `10 | freezing_level |  |  |  | 1 | open` | 0℃:SFC<br>0℃:050<br>0℃: SFC<br>0℃: 050 | unclassified | unclassified |
| 22 | 13 | `4 | freezing_level | freez |  |  | 3 | open` | freez | unclassified | unclassified |
| 16 | 11 | `7 | sfc_vis | rain | rain.png |  | 1 | open` | rain | unclassified | unclassified |
| 13 | 10 | `4 | cld | cloud |  |  | 5 | closed` | ISOL / EMBD / CB / XXX / 010<br>ISOL / EMBD / CB / XXX / SFC<br>OCNL / EMBD / CB / XXX / 010 | cb-cloud-area | cloud-scallop-overlay-and-multiline-label |
| 10 | 7 | `4 | ktg | tabul |  |  | 3 | open` | tabul | unclassified | unclassified |
| 10 | 9 | `4 | sfc_vis | fog |  |  | 1 | open` | LCA 5000M | unclassified | unclassified |
| 10 | 8 | `4 | sfc_vis | rain |  |  | 7 | open` | rain | unclassified | unclassified |
| 10 | 3 | `7 | mountain_obscu | mountain_obscuration | mountain_obscuration.png |  | 1 | open` | 황병산<br>울릉도<br>지리산<br>한라산 | unclassified | unclassified |
| 9 | 8 | `7 | ktg | moderate_turbulence | moderate_turbulence.png |  | 1 | open` | 050 / 020<br>XXX / 020<br>040 / 020<br>XXX / 060 | unclassified | unclassified |
| 8 | 4 | `4 | icing_area | icing |  |  | 4 | open` | icing | unclassified | unclassified |
| 8 | 5 | `7 | icing_area | MOD_ICE | MOD_ICE.png |  | 1 | open` | XXX / 020<br>040 / 020<br>050 / 010<br>050 / 020 | unclassified | unclassified |
| 6 | 4 | `7 | sfc_vis | widespread_fog | widespread_fog.png |  | 1 | open` | widespread_fog | unclassified | unclassified |
| 6 | 4 | `7 | sfc_vis | widespread_mist | widespread_mist.png |  | 1 | open` | widespread_mist | unclassified | unclassified |
| 5 | 5 | `8 | sfc_wind | wind_strong |  | diamond | 1 | open` | 30 | strong-surface-wind-speed | wind-diamond-label |
| 4 | 3 | `4 | freezing_level |  |  |  | 3 | open` | 0℃:100 | freezing-level | dashed-freezing-line |
| 3 | 3 | `12 | sfc_vis | rain/widespread_fog/widespread_mist | rain.png/widespread_fog.png/widespread_mist.png |  | 1 | open` | rain / widespread_fog / widespread_mist | unclassified | unclassified |
| 3 | 3 | `4 | sfc_vis | rain |  |  | 7 | closed` | rain | unclassified | unclassified |
| 3 | 3 | `4 | sfc_wind | l_wind |  |  | 1 | closed` | l_wind | strong-surface-wind-area | blue-wind-area-boundary |
| 3 | 3 | `7 | pressure | Hx | Hx.png |  | 1 | open` | 1029<br>1030 / ALMOST / STNR<br>Hx | unclassified | unclassified |
| 3 | 3 | `7 | pressure | Lx | Lx.png |  | 1 | open` | 1000<br>996<br>Lx | unclassified | unclassified |
| 2 | 2 | `10 | pressure |  |  |  | 1 | open` | ALMOST / STNR<br>15 | unclassified | unclassified |
| 2 | 1 | `12 |  | widespread_fog/widespread_mist | widespread_fog.png/widespread_mist.png |  | 1 | open` | widespread_fog / widespread_mist | unclassified | unclassified |
| 2 | 2 | `4 | font_line | fl_cold |  |  | 302 | open` | fl_cold | unclassified | unclassified |
| 2 | 2 | `4 | font_line | fl_worm |  |  | 301 | open` | fl_worm | unclassified | unclassified |
| 2 | 1 | `4 | sfc_vis | fog |  |  | 1 | closed` | LCA 5000M | unclassified | unclassified |
| 2 | 2 | `4 | sfc_wind | l_wind |  |  | 1 | open` | l_wind | unclassified | unclassified |
| 2 | 2 | `7 | icing_sfip | MOD_ICE | MOD_ICE.png |  | 1 | open` | XXX / 090<br>XXX / 080 | unclassified | unclassified |
| 2 | 2 | `9 | pressure |  |  |  | 1 | open` | pressure<br>20 | unclassified | unclassified |
| 1 | 1 | `12 | sfc_vis | snow/rain | new_snow2.png/rain.png |  | 1 | open` | new_snow2 / rain | unclassified | unclassified |
| 1 | 1 | `12 | sfc_vis | snow/rain/widespread_fog | new_snow2.png/rain.png/widespread_fog.png |  | 1 | open` | new_snow2 / rain / widespread_fog | unclassified | unclassified |
| 1 | 1 | `12 | sfc_vis | widespread_fog/widespread_mist | widespread_fog.png/widespread_mist.png |  | 1 | open` | widespread_fog / widespread_mist | unclassified | unclassified |
| 1 | 1 | `13 | cld |  |  |  | 1 | open` | cld | unclassified | unclassified |
| 1 | 1 | `4 | icing_area | icing |  |  | 4 | closed` | icing | unclassified | unclassified |
| 1 | 1 | `4 | icing_sfip | icing |  |  | 4 | open` | icing | unclassified | unclassified |
| 1 | 1 | `4 | ktg | tabul |  |  | 3 | closed` | tabul | unclassified | unclassified |
| 1 | 1 | `7 | cld | tu | tu.png |  | 1 | open` | tu | unclassified | unclassified |
| 1 | 1 | `7 | sfc_vis | snow | new_snow2.png |  | 1 | open` | new_snow2 | unclassified | unclassified |
| 1 | 1 | `9 | cld |  |  |  | 1 | open` | cld | unclassified | unclassified |

## Front And Cloud Shape Acceptance

Front/cloud rendering must be judged against paired `target.png` samples, not only against parser output. The preferred implementation is an FPV-space chart-line engine that uses original XML `fpv_points`, not lat/lon-only geometry, because the KMA finished chart appears to be generated in the original chart coordinate space.

For each sample containing `font_line` or `cld/cloud`:

- The rendered line follows the target path without obvious lateral drift.
- Front symbols repeat at a similar density to the target image.
- Warm/cold/occluded symbol orientation follows line direction.
- CB cloud scallops sit outside the cloud area, not across the interior.
- Scallop density is close enough that the boundary reads as the same chart convention.
- The underlying source item remains available as a phenomenon for toggles, route intersection, briefing, and vertical-profile work.

Accepted implementation modes:

- `fpv-sampled-vector-symbols`: preferred final mode because it follows the original chart-engine model while preserving per-phenomenon toggles and interaction.
- `per-phenomenon-raster`: acceptable fallback only after FPV vector sampling fails visual review for a documented reason.
- `whole-layer-raster`: temporary reference mode only; do not treat it as the final interactive engine.
