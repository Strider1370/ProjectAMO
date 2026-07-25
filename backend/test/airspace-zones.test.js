import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCeilingFt, parseFloorFt, zoneAltitude, loadAirspaceZoneItems } from '../src/briefing/airspace-zones.js'

test('parseCeilingFt: numeric with AMSL ref', () => {
  assert.deepEqual(parseCeilingFt('6 000 AMSL'), { value: 6000, ref: 'AMSL' })
})

test('parseCeilingFt: numeric with AGL ref', () => {
  assert.deepEqual(parseCeilingFt('3 000 AGL'), { value: 3000, ref: 'AGL' })
})

test('parseCeilingFt: UNL → no ceiling', () => {
  assert.deepEqual(parseCeilingFt('UNL'), { value: null, ref: null })
})

// MOA(군작전구역)는 상한·하한에 FL 표기가 섞여 나온다("FL 400", "FL 170") — 제한/금지/위험구역에는
// 없던 형식이라 숫자만 뽑으면 FL400이 400ft가 되어 100배 낮게 잡힌다(순항고도가 구역 위로 오판 → 미경보).
test('parseCeilingFt: FL notation → feet (FL400 = 40000ft, not 400ft)', () => {
  assert.deepEqual(parseCeilingFt('FL 400'), { value: 40000, ref: null })
  assert.deepEqual(parseCeilingFt('FL400'), { value: 40000, ref: null })
})

test('parseFloorFt: FL notation → feet', () => {
  assert.equal(parseFloorFt('FL 170'), 17000)
})

test('parseFloorFt: GND/SFC → 0', () => {
  assert.equal(parseFloorFt('GND'), 0)
  assert.equal(parseFloorFt('SFC'), 0)
})

test('parseFloorFt: numeric floor', () => {
  assert.equal(parseFloorFt('2 000 AMSL'), 2000)
})

test('zoneAltitude: combines ceiling + floor into notamBandToFt-compatible shape', () => {
  assert.deepEqual(zoneAltitude('6 000 AMSL', 'GND'), { lower: 0, upper: 6000, unit: 'FT', ref: 'AMSL' })
  assert.deepEqual(zoneAltitude('UNL', 'GND'), { lower: 0, upper: null, unit: 'FT', ref: null })
})

// 상한만 FL, 하한은 AMSL인 밴드가 MOA에 실제로 존재(MOA 12E: FL 400 / 11 000 AMSL).
// notamBandToFt()는 unit이 밴드당 하나뿐이라 혼합 단위를 표현할 수 없으므로 둘 다 FT로 정규화한다.
test('zoneAltitude: mixed FL ceiling + AMSL floor normalizes both to feet', () => {
  assert.deepEqual(zoneAltitude('FL 400', '11 000 AMSL'), { lower: 11000, upper: 40000, unit: 'FT', ref: null })
})

test('loadAirspaceZoneItems: reads real data files, returns NOTAM-shaped items with permanent validity', () => {
  const items = loadAirspaceZoneItems()
  assert.ok(items.length > 100, `expected many zones across restricted/prohibited/danger, got ${items.length}`)
  const categories = new Set(items.map((i) => i.category))
  assert.deepEqual([...categories].sort(), ['danger', 'moa', 'prohibited', 'restricted'])
  for (const it of items) {
    assert.ok(it.id)
    assert.ok(it.geometry)
    assert.ok(it.valid_from && it.valid_to)
    assert.equal(it.altitude.unit, 'FT')
  }
})

test('loadAirspaceZoneItems: id is the plain zone code, not an internal composite (readable in briefing UI)', () => {
  const items = loadAirspaceZoneItems()
  const r1 = items.find((i) => i.category === 'restricted' && i.id === 'R1')
  assert.ok(r1, 'R1 should be present with id exactly "R1", not "zone-restricted-R1-<idx>"')
})

// 원본 lt_c_aismoac 레이어에는 MOA 외에 CATA(훈련구역)·HTA(헬기훈련구역) 코드도 함께 들어있다 —
// 셋 다 군 훈련 공역이라 한 카테고리로 묶고, 코드는 차트 표기 그대로 노출한다.
test('loadAirspaceZoneItems: MOA zones are loaded with their chart code', () => {
  const items = loadAirspaceZoneItems()
  const moa = items.filter((i) => i.category === 'moa')
  assert.ok(moa.length > 60, `expected the full MOA set, got ${moa.length}`)
  assert.ok(moa.every((i) => i.summary.startsWith('군작전구역 ')), 'summary should read "군작전구역 <code>"')
  assert.ok(moa.every((i) => /^(MOA|CATA|HTA) /.test(i.summary.replace('군작전구역 ', ''))), 'unexpected code prefix')
})

// 같은 MOA 코드가 고도층별로 두 번 나온다(MOA 5 = 저층 9 000 AMSL/3 000 AGL + 고층 FL 400/12 000 AMSL).
// id는 브리핑 배너의 React key이자 화면에 그대로 찍히는 라벨이라 중복되면 안 된다 — 밴드로 구분한다.
test('loadAirspaceZoneItems: ids stay unique when one code has several altitude tiers', () => {
  const items = loadAirspaceZoneItems()
  const ids = items.map((i) => `${i.category}:${i.id}`)
  assert.equal(new Set(ids).size, ids.length, '구역 id 중복')
  const tiers = items.filter((i) => i.category === 'moa' && i.id.startsWith('MOA 5'))
  assert.equal(tiers.length, 2, 'MOA 5는 저층/고층 두 개')
  assert.notEqual(tiers[0].id, tiers[1].id)
})

test('loadAirspaceZoneItems: zones with no altitude data at all (e.g. restricted R14) are excluded', () => {
  // R14는 원본 차트 추출 데이터 자체에 상한·하한이 둘 다 없음(res_lbl_2/3 = null) — 실제 NOTAM의
  // "미상 밴드"와 달리 우리 쪽 정적 데이터 결손이라, 매번 근거 없는 저촉 경보를 띄우는 대신 제외한다.
  const items = loadAirspaceZoneItems()
  assert.equal(items.find((i) => i.id === 'R14'), undefined)
})
