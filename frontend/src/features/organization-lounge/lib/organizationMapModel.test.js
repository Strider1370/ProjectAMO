import assert from 'node:assert/strict'
import test from 'node:test'
import {
  boundsForFeatures,
  briefingHazardLinkedItems,
  buildOrganizationMapGeoJson,
  circleGeometry,
  getOrganizationRouteGeometry,
  organizationLinkedItems,
} from './organizationMapModel.js'

test('extracts a stored organization route without consulting latest data', () => {
  const route = { type: 'LineString', coordinates: [[126, 35], [127, 36]] }
  assert.equal(getOrganizationRouteGeometry({ flight: { profileRequest: { routeGeometry: route } } }), route)
})

test('circle display geometry keeps the canonical annotation untouched', () => {
  const circle = { center: [127, 35], radiusMeters: 1000 }
  const geometry = circleGeometry(circle, 16)
  assert.equal(geometry.coordinates[0].length, 17)
  assert.deepEqual(circle, { center: [127, 35], radiusMeters: 1000 })
})

test('map features use stable source-qualified item keys', () => {
  const model = buildOrganizationMapGeoJson({ annotations: [
    { sourceKind: 'annotation', id: 'same', geometry: { type: 'Point', coordinates: [127, 35] } },
    { sourceKind: 'weather', id: 'same', geometry: { type: 'Point', coordinates: [128, 36] } },
  ] })
  assert.deepEqual(model.linked.features.map((feature) => feature.properties.itemKey), ['annotation:same', 'weather:same'])
  assert.deepEqual(boundsForFeatures(model.linked.features), [[127, 35], [128, 36]])
})

test('current server projected circle remains visible and selectable', () => {
  const model = buildOrganizationMapGeoJson({ annotations: [{
    sourceKind: 'organization_annotation',
    itemId: 12,
    geometry: { center: [127, 35], radiusM: 750 },
  }] })
  assert.equal(model.linked.features[0].properties.itemKey, 'organization_annotation:12')
  assert.equal(model.linked.features[0].geometry.type, 'Polygon')
  assert.equal(model.linked.features[0].properties.authored, true)
})

test('composer hazards become profile-linked weather items', () => {
  const bundle = {
    linkedItems: [{ sourceKind: 'sigmet', id: 'A1', geometry: { type: 'Polygon', coordinates: [[[126, 35], [127, 35], [127, 36], [126, 35]]] } }],
    briefing: { sections: { adverse: { hazards: [{
      source: 'SIGMET', sourceId: 'A1', label: '뇌우', bandFt: { lowFt: 5000, highFt: 20000 },
      horizontalExposure: { intervals: [{ startNm: 10, endNm: 20 }] },
    }] } } },
  }
  const [item] = briefingHazardLinkedItems(bundle)
  assert.equal(item.sourceKind, 'weather_hazard')
  assert.equal(item.geometry.type, 'Polygon')
  assert.deepEqual(item.altitude, { minFt: 5000, maxFt: 20000, reference: 'AMSL' })
  assert.deepEqual(item.distanceIntervals, [{ startNm: 10, endNm: 20 }])
  assert.equal(organizationLinkedItems({ bundle }).filter((candidate) => candidate.id === 'A1').length, 1)
})

test('actual situation region and event payload shapes remain map-visible without normalized linkedItems', () => {
  const polygon = { type: 'Polygon', coordinates: [[[126, 35], [128, 35], [128, 37], [126, 35]]] }
  const advisory = { type: 'Polygon', coordinates: [[[127, 35], [129, 35], [129, 36], [127, 35]]] }
  const model = buildOrganizationMapGeoJson({
    situation: {
      regions: [{ interest: { id: 4, name: '서해 권역', geometry: polygon }, advisories: [] }],
      events: [{ eventKey: 'sigmet:4:A', kind: 'sigmet', payload: { title: 'SIGMET A', advisory: { geometry: advisory } } }],
    },
  })
  assert.equal(model.linked.features.length, 2)
  assert.deepEqual(model.linked.features.map((feature) => feature.geometry), [advisory, polygon])
})
