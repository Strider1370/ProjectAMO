import assert from 'node:assert/strict'
import test from 'node:test'

import { loadAirspaceZoneItems } from '../src/briefing/airspace-zones.js'

// 공역 GeoJSON은 국토부 KMZ로 다시 만든다(scripts/airspace-kmz-to-geojson.py). 브리핑이 읽는 라벨 속성과
// 고도 글자 형식이 바뀌면 경로 공역 판정이 조용히 빠지므로, 실제 자료로 형식을 지킨다.
test('every briefing airspace zone parses to a usable altitude band', () => {
  const zones = loadAirspaceZoneItems()
  const byCategory = Object.groupBy(zones, (zone) => zone.category)
  for (const category of ['restricted', 'danger', 'prohibited', 'moa']) {
    assert.ok(byCategory[category]?.length > 0, category)
  }
  for (const zone of zones) {
    assert.ok(Number.isFinite(zone.altitude.lower), `${zone.id} lower`)
    assert.ok(zone.altitude.upper === null || Number.isFinite(zone.altitude.upper), `${zone.id} upper`)
    assert.ok(zone.altitude.upper === null || zone.altitude.upper > zone.altitude.lower, `${zone.id} band`)
    assert.match(zone.geometry.type, /Polygon$/, zone.id)
  }
  assert.equal(new Set(zones.map((zone) => `${zone.category}:${zone.id}`)).size, zones.length, 'zone ids stay unique')
})
