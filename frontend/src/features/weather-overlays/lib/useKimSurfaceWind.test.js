import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getKimNwpFieldForSelection,
  normalizeKimNwpIndex,
  selectFallbackKimNwpSelection,
  selectDefaultKimNwp,
  selectKimNwpAvailability,
} from './useKimSurfaceWind.js'

const INDEX = {
  type: 'kim_nwp_index',
  latestRun: '2026051900',
  levels: [
    { id: '10m', label: '10m', kind: 'height', value: 10, unit: 'm' },
    { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa' },
  ],
  times: [
    { hf: 0, validTime: '2026-05-19T00:00:00.000Z' },
    { hf: 3, validTime: '2026-05-19T03:00:00.000Z' },
  ],
  availability: {
    '10m': { 0: { variables: ['u', 'v'] } },
    '925hPa': { 3: { variables: ['u', 'v'] } },
  },
}

test('selectDefaultKimNwp prefers 10m and earliest available time', () => {
  assert.deepEqual(selectDefaultKimNwp(INDEX), { tmfc: '2026051900', level: '10m', hf: 0 })
})

test('selectKimNwpAvailability returns null for missing level time pair', () => {
  assert.equal(selectKimNwpAvailability(INDEX, { level: '925hPa', hf: 0 }), null)
  assert.deepEqual(selectKimNwpAvailability(INDEX, { level: '925hPa', hf: 3 }), { variables: ['u', 'v'] })
})

test('normalizeKimNwpIndex exposes levels and times', () => {
  const normalized = normalizeKimNwpIndex(INDEX)
  assert.equal(normalized.availableLevels.length, 2)
  assert.equal(normalized.availableTimes.length, 2)
  assert.deepEqual(normalized.defaultSelection, { tmfc: '2026051900', level: '10m', hf: 0 })
})

test('selectDefaultKimNwp starts at 700 hPa when it has data, else the first level', () => {
  const index = {
    ...INDEX,
    levels: [...INDEX.levels, { id: '700hPa', label: '700', kind: 'pressure', value: 700, unit: 'hPa' }],
    availability: { ...INDEX.availability, '700hPa': { 3: { variables: ['u', 'v'] } } },
  }
  assert.deepEqual(selectDefaultKimNwp(index), { tmfc: '2026051900', level: '700hPa', hf: 3 })
  assert.deepEqual(selectDefaultKimNwp({ ...index, availability: INDEX.availability }), { tmfc: '2026051900', level: '10m', hf: 0 })
})

test('selectDefaultKimNwp keeps nearest past valid time when now is provided', () => {
  const selection = selectDefaultKimNwp(INDEX, Date.parse('2026-05-19T01:00:00.000Z'))
  assert.deepEqual(selection, { tmfc: '2026051900', level: '10m', hf: 0 })
})

test('normalizeKimNwpIndex keeps nearest available past default when all valid times are past', () => {
  const index = {
    ...INDEX,
    availability: {
      ...INDEX.availability,
      '10m': {
        ...INDEX.availability['10m'],
        3: { variables: ['u', 'v'] },
      },
    },
  }
  const normalized = normalizeKimNwpIndex(index, Date.parse('2026-05-19T04:00:00.000Z'))
  assert.deepEqual(normalized.defaultSelection, { tmfc: '2026051900', level: '10m', hf: 3 })
})

test('selectFallbackKimNwpSelection keeps selection when available in the next active layer', () => {
  assert.deepEqual(
    selectFallbackKimNwpSelection(INDEX, { tmfc: '2026051900', level: '925hPa', hf: 3 }),
    { tmfc: '2026051900', level: '925hPa', hf: 3 },
  )
})

test('selectFallbackKimNwpSelection keeps level and chooses earliest non-past hf', () => {
  const selection = selectFallbackKimNwpSelection(INDEX, { tmfc: '2026051900', level: '925hPa', hf: 0 })
  assert.deepEqual(selection, { tmfc: '2026051900', level: '925hPa', hf: 3 })
})

test('selectFallbackKimNwpSelection keeps nearest past selection when no future times are available', () => {
  const selection = selectFallbackKimNwpSelection(INDEX, { tmfc: '2026051900', level: '925hPa', hf: 3 }, Date.parse('2026-05-19T04:00:00.000Z'))
  assert.deepEqual(selection, { tmfc: '2026051900', level: '925hPa', hf: 3 })
})

test('getKimNwpFieldForSelection hides stale fields from previous selections', () => {
  const field = { type: 'kim_nwp_temperature' }
  assert.equal(
    getKimNwpFieldForSelection(field, '2026051900:0:10m:T', { tmfc: '2026051900', hf: 3, level: '10m' }, 'T'),
    null,
  )
  assert.equal(
    getKimNwpFieldForSelection(field, '2026051900:3:10m:T', { tmfc: '2026051900', hf: 3, level: '10m' }, 'T'),
    field,
  )
})
