import { editorPreview } from './mapEditorGeometry.js'

export const EDIT_SOURCE = 'my-map-edit-preview'
export const EDIT_LAYERS = ['my-map-edit-fill', 'my-map-edit-line', 'my-map-edit-point', 'my-map-edit-midpoint', 'my-map-edit-vertex']
export function syncEditorOverlay(map, editor) {
  const data = editorPreview(editor)
  if (!map.getSource(EDIT_SOURCE)) map.addSource(EDIT_SOURCE, { type: 'geojson', data })
  else map.getSource(EDIT_SOURCE).setData(data)
  const layers = [
    { id: EDIT_LAYERS[0], type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#475569', 'fill-opacity': 0.18 } },
    { id: EDIT_LAYERS[1], type: 'line', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]], paint: { 'line-color': '#334155', 'line-width': 3, 'line-dasharray': [2, 1] } },
    { id: EDIT_LAYERS[2], type: 'circle', filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'role'], 'shape']], paint: { 'circle-color': '#475569', 'circle-radius': 7 } },
    { id: EDIT_LAYERS[3], type: 'circle', filter: ['==', ['get', 'role'], 'midpoint'], paint: { 'circle-color': '#ffffff', 'circle-radius': 4, 'circle-stroke-color': '#334155', 'circle-stroke-width': 2 } },
    { id: EDIT_LAYERS[4], type: 'circle', filter: ['in', ['get', 'role'], ['literal', ['vertex', 'center', 'radius']]], paint: { 'circle-color': '#ffffff', 'circle-radius': 6, 'circle-stroke-color': '#334155', 'circle-stroke-width': 3 } },
  ]
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer({ source: EDIT_SOURCE, slot: 'middle', ...layer })
}
export function removeEditorOverlay(map) {
  for (const id of [...EDIT_LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(EDIT_SOURCE)) map.removeSource(EDIT_SOURCE)
}
