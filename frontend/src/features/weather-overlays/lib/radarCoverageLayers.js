import { addLazyGeoJsonSource, ensureGeoJsonSourceLoaded, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

// 국내 레이더가 실제로 닿는 범위. 합성자료 자체로는 알 수 없다 — 그 파일은 신호가 돌아온 화소만
// 담아서 "범위 밖"과 "범위 안이지만 비 없음"이 똑같이 빈칸이다. 그래서 지점별 관측반경의 합집합을
// 미리 계산해 정적 파일로 둔다(scripts/build-radar-coverage.mjs, 좌표는 기상청 QCD 볼륨에서 읽음).
export const RADAR_COVERAGE_SOURCE = 'radar-coverage'
export const RADAR_COVERAGE_MASK_LAYER = 'radar-coverage-outside-mask'
export const RADAR_COVERAGE_LINE_LAYER = 'radar-coverage-line'
const DATA_URL = '/data/radar-coverage.geojson'

export function addRadarCoverageLayers(map) {
  addLazyGeoJsonSource(map, RADAR_COVERAGE_SOURCE, DATA_URL, { eager: false })

  if (!map.getLayer(RADAR_COVERAGE_MASK_LAYER)) {
    map.addLayer({
      id: RADAR_COVERAGE_MASK_LAYER,
      type: 'fill',
      source: RADAR_COVERAGE_SOURCE,
      slot: 'top',
      filter: ['==', ['get', 'role'], 'outside-mask'],
      // FIR 바깥 마스크(wfs-fir-outside-mask)와 같은 색·같은 농도 — 두 마스크가 같이 켜져도
      // 한쪽만 도드라지지 않는다.
      paint: {
        'fill-color': '#1f78a8',
        'fill-opacity': 0.22,
        'fill-outline-color': 'rgba(0,0,0,0)',
      },
      layout: { visibility: 'none' },
    })
  }

  if (!map.getLayer(RADAR_COVERAGE_LINE_LAYER)) {
    map.addLayer({
      id: RADAR_COVERAGE_LINE_LAYER,
      type: 'line',
      source: RADAR_COVERAGE_SOURCE,
      slot: 'top',
      filter: ['==', ['get', 'role'], 'coverage'],
      // ADS-B 수신 반경 테두리(adsb-range-layer)와 같은 표기 — 둘 다 "장비가 닿는 범위"라
      // 같은 언어로 읽히게 한다.
      paint: {
        'line-color': '#38bdf8',
        'line-width': 1.5,
        'line-dasharray': [3, 3],
        'line-opacity': 0.8,
      },
      layout: { visibility: 'none' },
    })
  }
}

export function syncRadarCoverageLayers(map, visible) {
  if (visible) ensureGeoJsonSourceLoaded(map, RADAR_COVERAGE_SOURCE, DATA_URL)
  setMapLayerVisible(map, RADAR_COVERAGE_MASK_LAYER, visible)
  setMapLayerVisible(map, RADAR_COVERAGE_LINE_LAYER, visible)
}
