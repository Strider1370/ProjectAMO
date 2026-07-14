import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

// 해외 레이더(RainViewer). KMA 레이더가 '한반도 그림 한 장'(image overlay + 고정 bounds)인 것과 달리,
// RainViewer는 웹지도 표준 XYZ 래스터 타일이라 Mapbox가 필요한 칸을 알아서 요청한다(정합 작업 없음).
//
// z-order: 다른 오버레이와 같은 slot 'middle'. beforeId를 쓰지 않는다 —
//   (1) KMA 오버레이도 slot 방식이라 slot이 순서를 지배하고 beforeId는 무시되며,
//   (2) 국내 프레임이 없으면 kma-radar-overlay 레이어 자체가 없어 참조 시 throw.
//   애초에 국내/해외는 상호배타라 동시에 켜지지 않는다.
export const RAINVIEWER_SOURCE = 'rainviewer-radar'
export const RAINVIEWER_LAYER = 'rainviewer-radar'
export const RAINVIEWER_COVERAGE_SOURCE = 'rainviewer-coverage'
export const RAINVIEWER_COVERAGE_LAYER = 'rainviewer-coverage'

// 원본 레이더 해상도가 한계라 더 확대해도 선명해지지 않는다. 넘어가면 있는 타일을 늘려 쓴다(오버줌).
const MAX_ZOOM = 7

// RainViewer 색상표 2(Universal Blue)의 공식 dBZ↔색상 표에서 뽑은 대표 구간(높음→낮음).
// 출처: https://www.rainviewer.com/api/color-schemes.html (2026-07-14 확인)
// 실제 타일 픽셀을 샘플링해 대조 검증함(#00a3e0=20dBZ, #88ddee=15dBZ, #d6c88f=12dBZ 일치).
// 단위가 dBZ(반사도)라 국내 KMA 범례(mm/h)와 직접 비교 불가 — 그래서 별도 범례로 둔다.
export const RAINVIEWER_LEGEND = [
  { label: '65+', color: '#ffffff' },
  { label: '55', color: '#ff77ff' },
  { label: '50', color: '#c10000' },
  { label: '45', color: '#ff4400' },
  { label: '40', color: '#ffaa00' },
  { label: '35', color: '#ffee00' },
  { label: '30', color: '#005588' },
  { label: '25', color: '#0077aa' },
  { label: '20', color: '#00a3e0' },
  { label: '15', color: '#88ddee' },
  { label: '10', color: '#cec087' },
  { label: '5', color: '#928871' },
]

function tileUrl(meta, frame) {
  if (!meta?.host || !meta?.tileTemplate || !frame?.path) return null
  return meta.tileTemplate.replace('{host}', meta.host).replace('{path}', frame.path)
}

function coverageUrl(meta) {
  if (!meta?.host || !meta?.coverageTemplate) return null
  return meta.coverageTemplate.replace('{host}', meta.host)
}

function addRasterLayer(map, { sourceId, layerId, url, opacity }) {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'raster', tiles: [url], tileSize: 512, maxzoom: MAX_ZOOM })
  }
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      slot: 'middle',
      paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
    })
  }
}

/**
 * 커버리지(회색 음영 = 레이더 미수신 지역)를 먼저 깔고 그 위에 강수. 같은 slot 안에서는 삽입순이 순서다.
 * 커버리지가 없으면 "비 없음"과 "레이더 없음"이 똑같이 투명해 보인다(몽골·인도네시아 등 실제로 레이더 없음).
 */
export function syncRainviewerLayers(map, { meta, frame, visible }) {
  const covUrl = coverageUrl(meta)
  const radUrl = tileUrl(meta, frame)

  // 프레임이 없으면(커버 시간 밖) 레이어를 만들지 않는다 — 있으면 숨기기만.
  if (!covUrl || !radUrl) {
    setMapLayerVisible(map, RAINVIEWER_COVERAGE_LAYER, false)
    setMapLayerVisible(map, RAINVIEWER_LAYER, false)
    return false
  }

  addRasterLayer(map, {
    sourceId: RAINVIEWER_COVERAGE_SOURCE,
    layerId: RAINVIEWER_COVERAGE_LAYER,
    url: covUrl,
    opacity: 0.2,
  })
  addRasterLayer(map, {
    sourceId: RAINVIEWER_SOURCE,
    layerId: RAINVIEWER_LAYER,
    url: radUrl,
    opacity: 0.7,
  })

  // 프레임 교체는 타일 주소만 갈아끼운다. 레이어를 지웠다 다시 만들면 slot 순서가 흔들리고 깜빡인다.
  const source = map.getSource(RAINVIEWER_SOURCE)
  if (source?.setTiles) source.setTiles([radUrl])

  setMapLayerVisible(map, RAINVIEWER_COVERAGE_LAYER, visible)
  setMapLayerVisible(map, RAINVIEWER_LAYER, visible)
  return true
}
