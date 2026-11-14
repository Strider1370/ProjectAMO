import { getProcedureLineCoordinates } from './routePreview.js'

export const AUTOCOMPLETE_PREVIEW_SOURCE = 'route-autocomplete-preview'
const EMPTY = { type: 'FeatureCollection', features: [] }
const valid = (pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]) && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90

/** 미리보기는 확인된 좌표만 사용한다. 자료가 없으면 선을 추측하지 않는다. */
export function buildAutocompletePreview(item, lookups = {}) {
  if (!item) return null
  const { kind, name } = item
  if (kind === 'FIX') {
    const point = lookups.navpoints?.[name] ?? lookups.fixCoords?.[name] ?? lookups.userWaypoints?.find((value) => value.name === name)
    const coords = [point?.coordinates?.lon ?? point?.lon, point?.coordinates?.lat ?? point?.lat]
    return valid(coords) ? { kind, name, coordinates: [coords] } : null
  }
  if (kind === 'SID' || kind === 'STAR') {
    if (!Array.isArray(item.procedure?.geometry?.coordinates) && (item.procedure?.fixes ?? []).some((fix) => !valid([fix.lon, fix.lat]))) return null
    const coords = getProcedureLineCoordinates(item.procedure)
    // 중간 좌표가 빠진 절차를 이어 그리면 존재하지 않는 구간이 생긴다.
    if (coords.length < 2 || !coords.every(valid)) return null
    return { kind, name, coordinates: coords }
  }
  return null
}

export function buildAutocompletePreviewGeoJSON(preview) {
  const coords = preview?.coordinates ?? []
  if (!coords.length || !coords.every(valid)) return EMPTY
  const properties = { kind: preview.kind, name: preview.name, label: preview.kind === 'FIX' ? `미리보기 · ${preview.name}` : `미리보기 · ${preview.kind} ${preview.name}` }
  if (preview.kind === 'FIX') return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ...properties, role: 'point' }, geometry: { type: 'Point', coordinates: coords[0] } }] }
  if ((preview.kind !== 'SID' && preview.kind !== 'STAR') || coords.length < 2) return EMPTY
  return { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { ...properties, role: 'line' }, geometry: { type: 'LineString', coordinates: coords } },
    { type: 'Feature', properties: { ...properties, role: 'label' }, geometry: { type: 'Point', coordinates: coords[Math.floor(coords.length / 2)] } },
  ] }
}

export function syncAutocompletePreview(map, preview) {
  if (!map?.getStyle?.()) return
  if (!map.getSource(AUTOCOMPLETE_PREVIEW_SOURCE)) map.addSource(AUTOCOMPLETE_PREVIEW_SOURCE, { type: 'geojson', data: EMPTY })
  const source = AUTOCOMPLETE_PREVIEW_SOURCE
  const lineFilter = ['==', ['get', 'role'], 'line']
  const pointFilter = ['==', ['get', 'role'], 'point']
  const color = ['case', ['==', ['get', 'kind'], 'SID'], '#2563eb', ['==', ['get', 'kind'], 'STAR'], '#7c3aed', '#4338ca']
  if (!map.getLayer('autocomplete-preview-line-halo')) map.addLayer({ id: 'autocomplete-preview-line-halo', type: 'line', source, slot: 'top', filter: lineFilter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } })
  if (!map.getLayer('autocomplete-preview-line')) map.addLayer({ id: 'autocomplete-preview-line', type: 'line', source, slot: 'top', filter: lineFilter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 4, 'line-dasharray': [2, 1.5] } })
  if (!map.getLayer('autocomplete-preview-point-ring')) map.addLayer({ id: 'autocomplete-preview-point-ring', type: 'circle', source, slot: 'top', filter: pointFilter, paint: { 'circle-radius': 11, 'circle-color': '#ffffff', 'circle-opacity': 0.8, 'circle-stroke-color': '#4338ca', 'circle-stroke-width': 2 } })
  if (!map.getLayer('autocomplete-preview-point')) map.addLayer({ id: 'autocomplete-preview-point', type: 'circle', source, slot: 'top', filter: pointFilter, paint: { 'circle-radius': 4, 'circle-color': '#4338ca' } })
  if (!map.getLayer('autocomplete-preview-label')) map.addLayer({ id: 'autocomplete-preview-label', type: 'symbol', source, slot: 'top', filter: ['!=', ['get', 'role'], 'line'], layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans CJK JP Bold'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': color, 'text-halo-color': '#ffffff', 'text-halo-width': 2 } })
  map.getSource(source)?.setData(buildAutocompletePreviewGeoJSON(preview))
}
