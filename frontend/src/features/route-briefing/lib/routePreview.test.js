import test from 'node:test'
import assert from 'node:assert/strict'
import {
  augmentRouteWithProcedures,
  buildProcedureGeoJSON,
  buildVfrGeoJSON,
  bindVfrInteractions,
  calcVfrDistance,
  relabeledWaypoints,
  trimRouteLineForProcedures,
} from './routePreview.js'

test('relabeledWaypoints preserves fixed points and labels editable points in order', () => {
  const result = relabeledWaypoints([
    { id: 'RKSI', fixed: true, lon: 126.45, lat: 37.46 },
    { id: 'custom-a', lon: 127, lat: 37 },
    { id: 'custom-b', lon: 128, lat: 36 },
  ])

  assert.equal(result[0].id, 'RKSI')
  assert.equal(result[1].id, 'WP1')
  assert.equal(result[2].id, 'WP2')
})

test('buildVfrGeoJSON returns a route line and waypoint features', () => {
  const result = buildVfrGeoJSON([
    { id: 'RKSI', fixed: true, lon: 126.45, lat: 37.46 },
    { id: 'WP1', lon: 127, lat: 37 },
  ])

  assert.equal(result.type, 'FeatureCollection')
  assert.equal(result.features.length, 3)
  assert.equal(result.features[0].geometry.type, 'LineString')
  assert.deepEqual(result.features[0].geometry.coordinates, [[126.45, 37.46], [127, 37]])
})

test('calcVfrDistance returns zero for fewer than two waypoints', () => {
  assert.equal(calcVfrDistance([]), 0)
  assert.equal(calcVfrDistance([{ lon: 126.45, lat: 37.46 }]), 0)
})

test('buildProcedureGeoJSON includes line and waypoint features for SID, STAR, and IAP', () => {
  const sid = {
    fixes: [{ id: 'A', lon: 126, lat: 37 }, { id: 'B', lon: 127, lat: 38 }],
    geometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] },
  }
  const star = {
    fixes: [{ id: 'C', lon: 128, lat: 37 }, { id: 'D', lon: 129, lat: 38 }],
    geometry: { type: 'LineString', coordinates: [[128, 37], [129, 38]] },
  }
  const iap = {
    fixes: [
      { id: 'E', coordinates: { lon: 130, lat: 37 } },
      { id: 'F', coordinates: { lon: 131, lat: 38 } },
    ],
    geometry: { type: 'LineString', coordinates: [[130, 37], [131, 38]] },
  }

  const result = buildProcedureGeoJSON(sid, star, iap)
  const roles = result.features.map((feature) => feature.properties.role)

  assert.ok(roles.includes('sid-line'))
  assert.ok(roles.includes('star-line'))
  assert.ok(roles.includes('iap-line'))
  assert.ok(roles.includes('sid-wp'))
  assert.ok(roles.includes('star-wp'))
  assert.ok(roles.includes('iap-wp'))
})

test('comparison drag only forwards the selected waypoint or plus handle', () => {
  const events = new Map()
  const map = {
    on(event, layer, handler) {
      const callback = handler ?? layer
      events.set(`${event}:${handler ? layer : '*'}`, callback)
    },
    dragPan: { disable() {}, enable() {} },
    getCanvas: () => ({ style: {} }),
    getSource: () => null,
    queryRenderedFeatures: () => [],
  }
  const drops = []
  bindVfrInteractions(map, { current: [] }, { current: null }, { current: true }, { current: (drop) => drops.push(drop) })
  events.get('mousedown:briefing-route-preview-point')({
    preventDefault() {},
    lngLat: { lng: 127, lat: 37 },
    features: [{ properties: { designId: 'route-design-1', selected: true, editable: true, waypointIndex: 1 } }],
  })
  events.get('mousemove:*')({ lngLat: { lng: 128, lat: 36 } })
  events.get('mouseup:*')()
  assert.deepEqual(drops, [{ designId: 'route-design-1', kind: 'move', index: 1, coordinates: [128, 36] }])
})

test('comparison line drag inserts and redraws a temporary waypoint before confirmation', () => {
  const events = new Map()
  const source = {
    data: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { role: 'route-design-hit', designId: 'route-design-1', selected: true }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 37], [128, 37], [129, 37]] } },
        { type: 'Feature', properties: { role: 'route-design-line', designId: 'route-design-1', selected: true }, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 37], [128, 37], [129, 37]] } },
        { type: 'Feature', properties: { role: 'route-design-line', designId: 'route-design-2', selected: false }, geometry: { type: 'LineString', coordinates: [[126, 36], [128, 36]] } },
      ],
    },
    serialize() { return { data: this.data } },
    setData(data) { this.data = data },
  }
  const map = {
    on(event, layer, handler) {
      const callback = handler ?? layer
      events.set(`${event}:${handler ? layer : '*'}`, callback)
    },
    dragPan: { disable() {}, enable() {} },
    getCanvas: () => ({ style: {} }),
    getSource: () => source,
    queryRenderedFeatures: () => [],
  }
  const drops = []
  bindVfrInteractions(map, { current: [] }, { current: null }, { current: true }, { current: (drop) => drops.push(drop) })
  events.get('mousedown:briefing-route-design-line-hit')({
    preventDefault() {}, point: {}, lngLat: { lng: 128.5, lat: 37 },
    features: [{ properties: { designId: 'route-design-1', selected: true }, geometry: { type: 'LineString', coordinates: [[126, 37], [128, 37]] } }],
  })
  events.get('mousemove:*')({ lngLat: { lng: 128.5, lat: 38 } })
  assert.deepEqual(source.data.features[0].geometry.coordinates, [[126, 37], [127, 37], [128, 37], [129, 37]])
  assert.deepEqual(source.data.features[1].geometry.coordinates, [[126, 37], [127, 37], [128, 37], [128.5, 38], [129, 37]])
  assert.deepEqual(source.data.features[2].geometry.coordinates, [[126, 36], [128, 36]])
  assert.deepEqual(source.data.features[3].geometry.coordinates, [128.5, 38])
  events.get('mouseup:*')()
  assert.deepEqual(drops, [{ designId: 'route-design-1', kind: 'insert', index: 2, coordinates: [128.5, 38] }])
})

test('buildProcedureGeoJSON derives an IAP line from fixes when geometry is omitted', () => {
  const result = buildProcedureGeoJSON(null, null, {
    fixes: [
      { id: 'IAF', coordinates: { lon: 127.739333, lat: 35.035944 } },
      { id: 'RW06L', coordinates: { lon: 128.056806, lat: 35.082194 } },
    ],
  })

  const line = result.features.find((feature) => feature.properties.role === 'iap-line')
  assert.deepEqual(line.geometry, {
    type: 'LineString',
    coordinates: [[127.739333, 35.035944], [128.056806, 35.082194]],
  })
})

test('augmentRouteWithProcedures leaves route unchanged when no procedures exist', () => {
  const preview = buildVfrGeoJSON([
    { id: 'A', lon: 126, lat: 37 },
    { id: 'B', lon: 127, lat: 38 },
  ])

  assert.deepEqual(augmentRouteWithProcedures(preview, null, null, null), preview)
})

test('augmentRouteWithProcedures bridges procedures to independent manual en-route endpoints', () => {
  const preview = buildVfrGeoJSON([
    { id: 'DEP', lon: 126, lat: 37 },
    { id: 'MEKIL', lon: 127, lat: 37 },
    { id: 'DOTOL', lon: 128, lat: 36 },
    { id: 'ARR', lon: 129, lat: 36 },
  ])
  const sid = { fixes: [{ id: 'DEP', lon: 126, lat: 37 }, { id: 'OSPAT', lon: 126.5, lat: 37.2 }] }
  const star = { fixes: [{ id: 'UPGOS', lon: 128.5, lat: 35.8 }, { id: 'ARR', lon: 129, lat: 36 }] }
  const line = augmentRouteWithProcedures(preview, sid, star, null).features[0].geometry.coordinates

  assert.deepEqual(line, [[126, 37], [126.5, 37.2], [127, 37], [128, 36], [128.5, 35.8], [129, 36]])
})

test('trimRouteLineForProcedures leaves the line unchanged when there is no SID or STAR', () => {
  const preview = buildVfrGeoJSON([{ id: 'DEP', lon: 126, lat: 37 }, { id: 'ARR', lon: 129, lat: 36 }])
  assert.deepEqual(trimRouteLineForProcedures(preview, null, null), preview)
})

test('trimRouteLineForProcedures drops the straight departure-to-entry-fix segment when a SID exists', () => {
  const preview = buildVfrGeoJSON([
    { id: 'DEP', lon: 126, lat: 37 },
    { id: 'MEKIL', lon: 127, lat: 37 },
    { id: 'ARR', lon: 129, lat: 36 },
  ])
  const sid = { fixes: [{ id: 'DEP', lon: 126, lat: 37 }, { id: 'OSPAT', lon: 126.5, lat: 37.2 }] }
  const line = trimRouteLineForProcedures(preview, sid, null).features.find((f) => f.properties.role === 'route-preview-line').geometry.coordinates
  assert.deepEqual(line, [[127, 37], [129, 36]])
})

test('trimRouteLineForProcedures drops the straight exit-fix-to-arrival segment when a STAR exists', () => {
  const preview = buildVfrGeoJSON([
    { id: 'DEP', lon: 126, lat: 37 },
    { id: 'MEKIL', lon: 127, lat: 37 },
    { id: 'ARR', lon: 129, lat: 36 },
  ])
  const star = { fixes: [{ id: 'UPGOS', lon: 128.5, lat: 35.8 }, { id: 'ARR', lon: 129, lat: 36 }] }
  const line = trimRouteLineForProcedures(preview, null, star).features.find((f) => f.properties.role === 'route-preview-line').geometry.coordinates
  assert.deepEqual(line, [[126, 37], [127, 37]])
})

test('trimRouteLineForProcedures trims both ends when SID and STAR both exist', () => {
  const preview = buildVfrGeoJSON([
    { id: 'DEP', lon: 126, lat: 37 },
    { id: 'MEKIL', lon: 127, lat: 37 },
    { id: 'DOTOL', lon: 128, lat: 36 },
    { id: 'ARR', lon: 129, lat: 36 },
  ])
  const sid = { fixes: [{ id: 'DEP', lon: 126, lat: 37 }, { id: 'OSPAT', lon: 126.5, lat: 37.2 }] }
  const star = { fixes: [{ id: 'UPGOS', lon: 128.5, lat: 35.8 }, { id: 'ARR', lon: 129, lat: 36 }] }
  const line = trimRouteLineForProcedures(preview, sid, star).features.find((f) => f.properties.role === 'route-preview-line').geometry.coordinates
  assert.deepEqual(line, [[127, 37], [128, 36]])
})
