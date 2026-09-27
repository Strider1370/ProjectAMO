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

const EARTH_RADIUS_NM = 3440.065
function distanceNm(a, b) {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}
const between = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

// previewGeojson + 경로 누적거리(NM) 범위 → 그 범위의 좌표 배열. 여러 구간을 묶은 범위나
// FIX 이름이 없는 범위(예: 강하 중 난류 구간)를 자를 때 쓴다. 못 자르면 [].
export function rangeCoordinates(previewGeojson, startNm, endNm) {
  const line = (previewGeojson?.features ?? []).find((feature) => feature.properties?.role === 'route-preview-line')
  const coordinates = line?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(startNm) || !Number.isFinite(endNm) || endNm <= startNm) return []
  const out = []
  let travelled = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const a = coordinates[index - 1], b = coordinates[index]
    const length = distanceNm(a, b)
    const from = travelled, to = travelled + length
    if (to >= startNm && from <= endNm && length > 0) {
      if (!out.length) out.push(between(a, b, Math.max(0, (startNm - from) / length)))
      if (to <= endNm) out.push(b)
      else { out.push(between(a, b, (endNm - from) / length)); break }
    }
    travelled = to
  }
  return out.length > 1 ? out : []
}

// 강조 대상 → 좌표. FIX 이름으로 자르고(NAVLOG 한 줄, 여러 구간 묶음), 이름이 없거나
// 못 찾으면 거리(NM) 범위로 자른다.
export function legHighlightCoordinates(previewGeojson, highlight) {
  const byFix = highlight?.from && highlight?.to ? legCoordinates(previewGeojson, highlight.from, highlight.to) : []
  return byFix.length > 1 ? byFix : rangeCoordinates(previewGeojson, Number(highlight?.startNm), Number(highlight?.endNm))
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
