import { calculateScore, DEFAULTS } from './aciExperimentScore.js'
export const ACI_SOURCE = 'aci-experiment-source'
export const ACI_LAYER = 'aci-experiment-fill'
export { ACI_BANDS } from '../../../../../shared/aci.js'
import { ACI_BANDS } from '../../../../../shared/aci.js'
// Samples represent areas half a sample interval around their centers, clipped to the source domain.
export function buildAciGeoJSON(data, settings = DEFAULTS) {
  if (!data?.cells || !Number.isFinite(data.grid?.stepDegrees) || data.grid.stepDegrees <= 0 || !Number.isFinite(Date.parse(data.validAt))) throw new Error('실험 자료 형식 오류')
  const half = data.grid.stepDegrees / 2
  return { type: 'FeatureCollection', features: data.cells.flatMap(cell => {
    const result = calculateScore(cell, settings)
    if (!result || !Number.isFinite(cell.lon) || !Number.isFinite(cell.lat)) return []
    const west = Math.max(119, cell.lon - half), east = Math.min(136, cell.lon + half)
    const south = Math.max(30, cell.lat - half), north = Math.min(44, cell.lat + half)
    if (west >= east || south >= north) return []
    return [{ type: 'Feature', properties: { ...cell, score: result.score,
      capeContribution: result.contributions[0], rainContribution: result.contributions[1], olrContribution: result.contributions[2] },
      geometry: { type: 'Polygon', coordinates: [[[west,south],[east,south],[east,north],[west,north],[west,south]]] } }]
  }) }
}
export function syncAciLayer(map, geojson, enabled) {
  if (!map.getSource(ACI_SOURCE)) map.addSource(ACI_SOURCE, { type: 'geojson', data: geojson })
  else map.getSource(ACI_SOURCE).setData(geojson)
  if (!map.getLayer(ACI_LAYER)) map.addLayer({ id: ACI_LAYER, source: ACI_SOURCE, type: 'fill', slot: 'middle', paint: {
    'fill-color': ['step', ['get','score'], ACI_BANDS[0].color, ...ACI_BANDS.slice(1).flatMap(b => [b.min,b.color])],
    'fill-opacity': ['case', ['<', ['get','score'], 0.25], 0, 0.65],
  } })
  map.setLayoutProperty(ACI_LAYER, 'visibility', enabled ? 'visible' : 'none')
}
export function removeAciLayer(map) {
  if (map?.getLayer(ACI_LAYER)) map.removeLayer(ACI_LAYER)
  if (map?.getSource(ACI_SOURCE)) map.removeSource(ACI_SOURCE)
}
