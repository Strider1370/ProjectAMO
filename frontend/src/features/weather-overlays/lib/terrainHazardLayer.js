// 지형 근접 색칠 (ForeFlight Hazard Advisor 방식).
// 선택 고도 기준으로 지형 표고를 적/황으로 칠한다 — 적: 100ft 이내(또는 고도보다 높음),
// 황: 100~1,000ft 아래, 그보다 낮으면 투명.
//
// 표고는 백엔드가 우리 DEM으로 만들어 주는 terrain-RGB 타일(/api/terrain/rgb)을 GPU에서
// 그대로 디코딩해 쓴다(raster-color). 그 타일은 인천 FIR 밖을 '자료 없음'으로 비워 두므로
// 일본·중국 지형은 애초에 색이 칠해지지 않는다.

export const TERRAIN_HAZARD_SOURCE = 'terrain-hazard-dem'
export const TERRAIN_HAZARD_LAYER = 'terrain-hazard-shade'

// 인천 FIR 외접 사각형(backend/src/terrain/terrain-rgb-tiles.js와 같은 값) — 이 밖은 타일을 받지 않는다.
export const TERRAIN_HAZARD_BOUNDS = [123.5, 30.5, 133.0, 39.5]

// 공용 고도 레일에 올릴 눈금. 아래는 촘촘하게, 위로 갈수록 성기게.
// 위쪽 끝이 8,000ft인 이유: 국내 최고봉 한라산이 1,947m(6,388ft)라 황색 기준(1,000ft 이내)까지
// 쳐도 7,400ft 위로는 어떤 지형도 걸리지 않는다. 그 위 눈금은 백지 지도만 보여줄 뿐이다.
export const KOREA_HIGHEST_TERRAIN_FT = 6388  // 한라산 1,947m
export const TERRAIN_HAZARD_ALT_FT = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000]
const MAJOR_ALT_FT = new Set([500, 1000, 2000, 3000, 4000, 6000, 8000])

export function terrainHazardAltitudeItems() {
  // 트랙 위쪽(index 0)이 위 화살표 방향 — 높은 고도가 맨 위.
  return [...TERRAIN_HAZARD_ALT_FT].sort((a, b) => b - a).map((ft) => ({
    id: ft,
    primary: `${ft.toLocaleString()} ft`,
    major: MAJOR_ALT_FT.has(ft),
  }))
}

export const TERRAIN_HAZARD_RED = 'rgba(220, 38, 38, 0.55)'
export const TERRAIN_HAZARD_YELLOW = 'rgba(234, 179, 8, 0.45)'
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

const FT_TO_M = 0.3048
const RED_MARGIN_FT = 100
const YELLOW_MARGIN_FT = 1000

// terrain-RGB: 표고(m) = -10000 + (R*256^2 + G*256 + B) * 0.1.
// raster-color-mix의 채널값은 0~1로 정규화돼 들어오므로 각 계수에 255를 곱한다.
export const TERRAIN_RGB_MIX = [255 * 256 * 256 * 0.1, 255 * 256 * 0.1, 255 * 0.1, -10000]

export function terrainHazardPaint(altitudeFt) {
  const altM = altitudeFt * FT_TO_M
  const redFromM = altM - RED_MARGIN_FT * FT_TO_M
  const yellowFromM = altM - YELLOW_MARGIN_FT * FT_TO_M
  return {
    'raster-color-mix': TERRAIN_RGB_MIX,
    // 국내 최고봉 한라산 1,950m + 여유. 이 창 밖의 값은 양끝으로 붙는다(바다 -10000 → 투명).
    'raster-color-range': [-500, 2500],
    'raster-color': [
      'step', ['raster-value'],
      TRANSPARENT,
      yellowFromM, TERRAIN_HAZARD_YELLOW,
      redFromM, TERRAIN_HAZARD_RED,
    ],
    'raster-opacity': 1,
    'raster-fade-duration': 0,
  }
}

export const TERRAIN_HAZARD_TILE_URL = '/api/terrain/rgb/{z}/{x}/{y}.png'

export function syncTerrainHazardLayer(map, { visible, altitudeFt }) {
  // 꺼져 있으면 소스도 만들지 않는다 — 타일 한 장마다 서버가 DEM을 훑으므로 기본 상태에서 0건이어야 한다.
  if (!visible) {
    if (map.getLayer(TERRAIN_HAZARD_LAYER)) map.removeLayer(TERRAIN_HAZARD_LAYER)
    if (map.getSource(TERRAIN_HAZARD_SOURCE)) map.removeSource(TERRAIN_HAZARD_SOURCE)
    return
  }

  if (!map.getSource(TERRAIN_HAZARD_SOURCE)) {
    map.addSource(TERRAIN_HAZARD_SOURCE, {
      type: 'raster',
      tiles: [TERRAIN_HAZARD_TILE_URL],
      tileSize: 256,
      // DEM이 3초(약 90m)라 z11이 원본 해상도. 그 위는 mapbox가 늘려서 그린다.
      maxzoom: 11,
      bounds: TERRAIN_HAZARD_BOUNDS,
    })
  }

  const paint = terrainHazardPaint(altitudeFt)
  if (!map.getLayer(TERRAIN_HAZARD_LAYER)) {
    map.addLayer({
      id: TERRAIN_HAZARD_LAYER,
      type: 'raster',
      source: TERRAIN_HAZARD_SOURCE,
      slot: 'middle',
      paint,
    })
    return
  }
  Object.entries(paint).forEach(([key, value]) => map.setPaintProperty(TERRAIN_HAZARD_LAYER, key, value))
}
