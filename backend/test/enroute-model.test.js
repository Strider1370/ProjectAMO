import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeEnrouteModel } from '../src/briefing/enroute-model.js'

// 2개 KIM 기압면(8000/10000ft), 거리 0/50/100NM. cruise 9000, total 100 → alt(50)=9000.
const crossSection = { levels: [
  { altFt: 8000, values: [
    { distanceNm: 0, icing: 0, t: 10 },
    { distanceNm: 50, icing: 2, t: 5 },
    { distanceNm: 100, icing: 0, t: 8 },
  ] },
  { altFt: 10000, values: [
    { distanceNm: 0, icing: 0, t: 8 },
    { distanceNm: 50, icing: 0, t: 3 },
    { distanceNm: 100, icing: 0, t: 6 },
  ] },
] }
const turbulence = { levels: [
  { altFt: 3000, values: [ { distanceNm: 0, ktg: 0.1 }, { distanceNm: 50, ktg: 0.4 }, { distanceNm: 100, ktg: 0.1 } ] },
  { altFt: 9000, values: [ { distanceNm: 0, ktg: 0.1 }, { distanceNm: 50, ktg: 0.8 }, { distanceNm: 100, ktg: 0.1 } ] },
] }
const ctx = { crossSection, turbulence, totalDistanceNm: 100, cruiseAltitudeFt: 9000 }

test('icing interval at moderate+ grade (>=2) only', () => {
  const r = summarizeEnrouteModel(ctx)
  const ice = r.elements.find((e) => e.kind === 'icing')
  assert.ok(ice)
  assert.deepEqual(ice.intervals, [{ startNm: 50, endNm: 50, level: '중' }])
})

test('light icing (grade 1) is NOT shown', () => {
  const lightIce = { levels: [{ altFt: 9000, values: [{ distanceNm: 0, icing: 1 }, { distanceNm: 50, icing: 1 }] }] }
  const r = summarizeEnrouteModel({ crossSection: lightIce, turbulence: null, totalDistanceNm: 50, cruiseAltitudeFt: 9000 })
  assert.equal(r.elements.find((e) => e.kind === 'icing'), undefined)
})

test('turbulence interval flags severe at cruise', () => {
  const r = summarizeEnrouteModel(ctx)
  const turb = r.elements.find((e) => e.kind === 'turbulence')
  assert.ok(turb)
  assert.equal(turb.intervals[0].level, '심')   // 0.5 EDR → severe
  assert.equal(turb.intervals[0].startNm, 50)
})

test('no wind/temp elements (removed — cross-section carries them)', () => {
  const r = summarizeEnrouteModel(ctx)
  assert.equal(r.elements.find((e) => e.kind === 'wind'), undefined)
  assert.equal(r.elements.find((e) => e.kind === 'temp'), undefined)
})

test('output carries totalDistanceNm for ribbon scaling', () => {
  const r = summarizeEnrouteModel(ctx)
  assert.equal(r.totalDistanceNm, 100)
})

test('no model data -> empty elements', () => {
  const r = summarizeEnrouteModel({ crossSection: null, turbulence: null, totalDistanceNm: 100, cruiseAltitudeFt: 9000 })
  assert.deepEqual(r.elements, [])
})

test('KTG outside its altitude coverage is ignored (high cruise)', () => {
  const r = summarizeEnrouteModel({ ...ctx, cruiseAltitudeFt: 35000, totalDistanceNm: 300 })
  const turb = r.elements.find((e) => e.kind === 'turbulence')
  assert.equal(turb, undefined)
})

test('icing follows the full climb and descent profile instead of treating every point as cruise', () => {
  const lowLevelIcing = {
    levels: [
      { altFt: 0, values: [
        { distanceNm: 0, icing: 2 },
        { distanceNm: 50, icing: 0 },
        { distanceNm: 100, icing: 2 },
      ] },
      { altFt: 4000, values: [
        { distanceNm: 0, icing: 0 },
        { distanceNm: 50, icing: 0 },
        { distanceNm: 100, icing: 0 },
      ] },
      { altFt: 9000, values: [
        { distanceNm: 0, icing: 0 },
        { distanceNm: 50, icing: 0 },
        { distanceNm: 100, icing: 0 },
      ] },
    ],
  }
  const r = summarizeEnrouteModel({
    crossSection: lowLevelIcing,
    turbulence: null,
    totalDistanceNm: 100,
    cruiseAltitudeFt: 9000,
    flightPlanProfile: {
      points: [
        { distanceNm: 0, altitudeFt: 0 },
        { distanceNm: 50, altitudeFt: 9000 },
        { distanceNm: 100, altitudeFt: 0 },
      ],
    },
  })

  assert.deepEqual(r.elements.find((element) => element.kind === 'icing')?.intervals, [
    { startNm: 0, endNm: 0, level: '중' },
    { startNm: 100, endNm: 100, level: '중' },
  ])
})
