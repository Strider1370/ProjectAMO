import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIcingGeometry, buildTemperatureContours, compatibleKimFields, fieldMatchesSelection, pressureKimIndex } from './cloudIcingModel.js'
import { buildProfileCloudIcing } from '../../route-briefing/lib/cloudIcingProfile.js'

const grid = { nx: 3, ny: 2, lonMin: 126, lonMax: 128, latMin: 35, latMax: 36 }
const field = { grid, level: { id: '700hPa' }, time: { tmfc: '2026091006', hf: 6 }, icingGrade: [1, 2, 3, 1, 2, 3] }
test('map keeps separate grade fills and only one combined exterior', () => {
  const result = buildIcingGeometry(field)
  assert.equal(result.fills.features.length, 3)
  assert.equal(result.outlines.features.length, 1)
  assert.deepEqual(result.outlines.features[0].geometry.coordinates, [[126, 35], [128, 35], [128, 36], [126, 36], [126, 35]])
  assert.equal(buildIcingGeometry(field), result)
  assert.deepEqual(field.icingGrade, [1, 2, 3, 1, 2, 3])
})
test('selection and grid mismatches cannot be overlaid', () => {
  const selection = { tmfc: '2026091006', hf: 6, level: '700hPa' }
  assert.equal(fieldMatchesSelection(field, selection), true)
  assert.equal(fieldMatchesSelection(field, { ...selection, hf: 9 }), false)
  assert.equal(compatibleKimFields([field, { ...field, time: { ...field.time, hf: 9 } }]), false)
  assert.equal(compatibleKimFields([field, { ...field, grid: { ...grid, nx: 4 } }]), false)
})
test('combined index excludes surface levels and surface-only hours without changing the source', () => {
  const index = { levels: [{ id: '10m', kind: 'height' }, { id: '700hPa', kind: 'pressure' }], times: [{ hf: 6 }, { hf: 9 }], availability: { '10m': { 6: true, 9: true }, '700hPa': { 6: true } } }
  const pressure = pressureKimIndex(index)
  assert.deepEqual(pressure.levels.map(l => l.id), ['700hPa'])
  assert.deepEqual(pressure.times, [{ hf: 6 }])
  assert.equal(pressure.availability['10m'], undefined)
  assert.equal(index.availability['10m'][9], true)
})
test('Kelvin fields produce Celsius contours and optional minus ten', () => {
  const temperatures = { ...field, T: [273.15, 253.15, 233.15, 273.15, 253.15, 233.15] }
  assert.deepEqual(buildTemperatureContours(temperatures).features.map(f => f.properties.temperature), [0, -20])
  assert.deepEqual(buildTemperatureContours(temperatures, true).features.map(f => f.properties.temperature), [0, -10, -20])
})
test('profile simultaneously shades cloud, patterns grades and outlines the union once', () => {
  const levels = [0, 1, 2].map(y => ({ pressure: 850 - y * 50, altFt: y * 1000, values: [0, 1, 2].map(x => ({ distanceNm: x, spread: 1, icing: x ? 3 : 1 })) }))
  const model = buildProfileCloudIcing(levels, x => x, y => y, l => l.altFt)
  assert.equal(model.cloud.length, 4)
  assert.equal(model.icing.length, 4)
  assert.equal(model.outlines.length, 1)
})
