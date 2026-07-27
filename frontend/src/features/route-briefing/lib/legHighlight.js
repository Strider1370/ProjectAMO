// NAVLOG 한 줄(구간)을 지도 위 경로선에서 잘라내 강조하는 레이어.
// 새 자료를 받지 않는다 — 이미 지도에 올라간 경로 preview geojson을 그대로 쓴다.

export const LEG_HL_SOURCE = 'navlog-leg-highlight'
export const LEG_HL_LINE = 'navlog-leg-highlight-line'

const emptyGeoJSON = { type: 'FeatureCollection', features: [] }

function sameCoord(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7
}

function indexOfPoint(coordinates, target) {
  if (!target) return -1
  const exact = coordinates.findIndex((coordinate) => sameCoord(coordinate, target))
  if (exact >= 0) return exact
  // 절차(SID/STAR) 병합으로 좌표가 미세하게 달라진 경우를 대비한 최근접 폴백.
  let best = -1
  let bestDistance = Infinity
  for (const [index, coordinate] of coordinates.entries()) {
    const distance = (coordinate[0] - target[0]) ** 2 + (coordinate[1] - target[1]) ** 2
    if (distance < bestDistance) { bestDistance = distance; best = index }
  }
  return bestDistance <= 1e-4 ? best : -1
}

// previewGeojson + 구간 양끝 FIX 이름 → 그 구간의 좌표 배열. 못 찾으면 [].
export function legCoordinates(previewGeojson, from, to) {
  const features = previewGeojson?.features ?? []
  const line = features.find((feature) => feature.properties?.role === 'route-preview-line')
  const coordinates = line?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !from || !to) return []

  const pointFor = (label) => features.find((feature) =>
    feature.properties?.role === 'route-preview-point' && feature.properties?.label === label)?.geometry?.coordinates

  const start = indexOfPoint(coordinates, pointFor(from))
  const end = indexOfPoint(coordinates, pointFor(to))
  if (start < 0 || end < 0 || start === end) return []
  const [low, high] = start < end ? [start, end] : [end, start]
  return coordinates.slice(low, high + 1)
}

export function addLegHighlightLayer(map) {
  if (!map.getSource(LEG_HL_SOURCE)) {
    map.addSource(LEG_HL_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(LEG_HL_LINE)) {
    map.addLayer({
      id: LEG_HL_LINE,
      type: 'line',
      source: LEG_HL_SOURCE,
      slot: 'top',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#1d4ed8',
        'line-width': 8,
        // 고정(클릭)은 진하게, 미리보기(호버)는 옅게 — 어느 쪽인지 지도만 보고 구분된다.
        'line-opacity': ['case', ['==', ['get', 'pinned'], true], 0.85, 0.45],
      },
    })
  }
}

export function syncLegHighlight(map, coordinates, { pinned = false } = {}) {
  addLegHighlightLayer(map)
  const data = coordinates?.length > 1
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { pinned }, geometry: { type: 'LineString', coordinates } }] }
    : emptyGeoJSON
  map.getSource(LEG_HL_SOURCE)?.setData(data)
}
