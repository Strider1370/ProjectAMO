// 지금까지 확정된 토큰을 지도에 보여준다. 공항 하나만 쳐도 점이 나오고, 둘 이상이면
// 그 사이가 이어진다 — 목적지를 정하기 전에도 친 것이 화면에 있어야 한다.
//
// **이 선은 계산된 경로가 아니다.** 항공로(A582 등)는 실제로 꺾여 가는데 여기서는 점과 점을
// 직선으로 잇는다. 그래서 실선이 아니라 점선이고, 색도 확정 경로와 다르다 — 곧게 그은 선을
// 실제 항로로 읽으면 위험하다. 확정 경로가 생기면 이 미리보기는 사라진다.
export const TOKEN_PREVIEW_SOURCE = 'route-token-preview'
export const TOKEN_PREVIEW_LINE = 'route-token-preview-line'
export const TOKEN_PREVIEW_POINT = 'route-token-preview-point'
export const TOKEN_PREVIEW_LABEL = 'route-token-preview-label'

const EMPTY = { type: 'FeatureCollection', features: [] }

export function buildTokenPreviewGeojson(geometry) {
  const points = geometry?.points ?? []
  const line = geometry?.line ?? []
  const features = points.map((point) => ({
    type: 'Feature',
    properties: { text: point.text, kind: point.kind },
    geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
  }))
  if (line.length > 1) {
    features.push({
      type: 'Feature',
      properties: { role: 'line' },
      geometry: { type: 'LineString', coordinates: line },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function installTokenPreviewLayers(map) {
  if (!map?.getStyle?.()) return
  if (!map.getSource(TOKEN_PREVIEW_SOURCE)) {
    map.addSource(TOKEN_PREVIEW_SOURCE, { type: 'geojson', data: EMPTY })
  }
  if (!map.getLayer(TOKEN_PREVIEW_LINE)) {
    map.addLayer({
      id: TOKEN_PREVIEW_LINE,
      type: 'line',
      source: TOKEN_PREVIEW_SOURCE,
      slot: 'middle',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': '#3b3a8c',
        'line-width': 2,
        // 점선이 이 선이 계산된 경로가 아니라는 표시다.
        'line-dasharray': [2, 2],
        'line-opacity': 0.9,
      },
    })
  }
  if (!map.getLayer(TOKEN_PREVIEW_POINT)) {
    map.addLayer({
      id: TOKEN_PREVIEW_POINT,
      type: 'circle',
      source: TOKEN_PREVIEW_SOURCE,
      slot: 'middle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#3b3a8c',
      },
    })
  }
  if (!map.getLayer(TOKEN_PREVIEW_LABEL)) {
    map.addLayer({
      id: TOKEN_PREVIEW_LABEL,
      type: 'symbol',
      source: TOKEN_PREVIEW_SOURCE,
      slot: 'middle',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'text'],
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#3b3a8c',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      },
    })
  }
}

/** 확정 경로가 있으면 미리보기를 비운다 — 같은 경로를 두 겹으로 그리면 어느 쪽이 실제인지 흐려진다. */
export function syncTokenPreviewLayers(map, geometry, { hasAppliedRoute = false } = {}) {
  installTokenPreviewLayers(map)
  const source = map?.getSource?.(TOKEN_PREVIEW_SOURCE)
  if (!source) return { fitCoordinates: [] }
  const data = hasAppliedRoute ? EMPTY : buildTokenPreviewGeojson(geometry)
  source.setData(data)
  const points = hasAppliedRoute ? [] : (geometry?.points ?? [])
  return { fitCoordinates: points.map((point) => [point.lon, point.lat]) }
}
