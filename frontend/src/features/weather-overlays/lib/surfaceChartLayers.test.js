import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SURFACE_CHART_BARB_LAYER,
  SURFACE_CHART_CENTER_LAYER,
  SURFACE_CHART_COLORS,
  SURFACE_CHART_ISOBAR_LAYER,
  SURFACE_CHART_ISOBAR_SOURCE,
  SURFACE_CHART_LAYER_IDS,
  SURFACE_CHART_PRECIP_LAYER,
  syncSurfaceChartLayers,
} from './surfaceChartLayers.js'

function fakeMap() {
  const layers = new Map()
  const sources = new Map()
  return {
    layers,
    sources,
    hasImage: () => true, // 바람깃 그림은 이미 등록된 것으로 둔다(노드에는 캔버스가 없다)
    addImage: () => {},
    getLayer: (id) => layers.get(id),
    addLayer: (layer) => layers.set(layer.id, { ...layer, layout: { ...(layer.layout || {}) }, paint: { ...(layer.paint || {}) } }),
    removeLayer: (id) => layers.delete(id),
    getSource: (id) => sources.get(id),
    addSource: (id, source) => sources.set(id, { ...source, setData(data) { this.data = data } }),
    removeSource: (id) => sources.delete(id),
    setLayoutProperty: (id, key, value) => { layers.get(id).layout[key] = value },
    setPaintProperty: (id, key, value) => { layers.get(id).paint[key] = value },
    getStyle: () => ({ layers: [...layers.values()] }),
  }
}

const FRAME = {
  isobars: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[120, 30], [121, 31]] }, properties: { p: 1012, major: true } }] },
  centers: { type: 'FeatureCollection', features: [] },
  precipUrl: '/data/kim_surface_chart/runs/KIMG_NE57_2026092200/hf003/precip3h.png',
  view: { lonMin: 95, lonMax: 165, latMin: 15, latMax: 55 },
}
const ALL = { isobars: true, precip: true, barbs: true }
const visibility = (map, id) => map.layers.get(id)?.layout.visibility

test('installs every layer and shows the chosen parts of the chart', () => {
  const map = fakeMap()
  syncSurfaceChartLayers(map, { visible: true, show: { ...ALL, barbs: false }, frame: FRAME, basemapId: 'standard' })
  for (const id of SURFACE_CHART_LAYER_IDS) assert.ok(map.layers.has(id), id)
  assert.equal(visibility(map, SURFACE_CHART_ISOBAR_LAYER), 'visible')
  assert.equal(visibility(map, SURFACE_CHART_CENTER_LAYER), 'visible')
  assert.equal(visibility(map, SURFACE_CHART_PRECIP_LAYER), 'visible')
  assert.equal(visibility(map, SURFACE_CHART_BARB_LAYER), 'none')
  assert.equal(map.sources.get(SURFACE_CHART_ISOBAR_SOURCE).data, FRAME.isobars)
})

test('hides everything when turned off or when there is no frame for the time', () => {
  const map = fakeMap()
  syncSurfaceChartLayers(map, { visible: true, show: ALL, frame: FRAME, basemapId: 'standard' })
  syncSurfaceChartLayers(map, { visible: true, show: ALL, frame: null, basemapId: 'standard' })
  assert.ok(SURFACE_CHART_LAYER_IDS.every((id) => visibility(map, id) === 'none'))
  syncSurfaceChartLayers(map, { visible: true, show: ALL, frame: FRAME, basemapId: 'standard' })
  syncSurfaceChartLayers(map, { visible: false, show: ALL, frame: FRAME, basemapId: 'standard' })
  assert.ok(SURFACE_CHART_LAYER_IDS.every((id) => visibility(map, id) === 'none'))
})

test('does not touch the map when the chart was never turned on', () => {
  const map = fakeMap()
  syncSurfaceChartLayers(map, { visible: false, show: ALL, frame: null, basemapId: 'standard' })
  assert.equal(map.layers.size, 0)
})

test('isobars switch to light lines on dark and satellite basemaps', () => {
  const map = fakeMap()
  syncSurfaceChartLayers(map, { visible: true, show: ALL, frame: FRAME, basemapId: 'standard' })
  assert.equal(map.layers.get(SURFACE_CHART_ISOBAR_LAYER).paint['line-color'], SURFACE_CHART_COLORS.light.isobar)
  syncSurfaceChartLayers(map, { visible: true, show: ALL, frame: FRAME, basemapId: 'dark' })
  assert.equal(map.layers.get(SURFACE_CHART_ISOBAR_LAYER).paint['line-color'], SURFACE_CHART_COLORS.dark.isobar)
  syncSurfaceChartLayers(map, { visible: true, show: ALL, frame: FRAME, basemapId: 'satellite' })
  assert.equal(map.layers.get(SURFACE_CHART_ISOBAR_LAYER).paint['line-color'], SURFACE_CHART_COLORS.dark.isobar)
})
