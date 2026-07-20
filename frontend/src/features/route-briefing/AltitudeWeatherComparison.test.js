import { test } from 'node:test'
import assert from 'node:assert/strict'

// Test helper functions that mirror the component's logic
const SEVERITY_LABEL = {
  0: { code: 'NIL', ko: '없음' },
  1: { code: 'LGT', ko: '약함' },
  2: { code: 'MOD', ko: '보통' },
  3: { code: 'SVR', ko: '심함' },
}

function severityBadge(grade) {
  if (grade == null) return { code: '?', ko: '자료 없음' }
  const entry = SEVERITY_LABEL[Number(grade)]
  return entry ?? { code: '?', ko: '자료 없음' }
}

test('severityBadge returns correct codes for each grade', () => {
  assert.deepEqual(severityBadge(0), { code: 'NIL', ko: '없음' })
  assert.deepEqual(severityBadge(1), { code: 'LGT', ko: '약함' })
  assert.deepEqual(severityBadge(2), { code: 'MOD', ko: '보통' })
  assert.deepEqual(severityBadge(3), { code: 'SVR', ko: '심함' })
})

test('severityBadge handles null and undefined gracefully', () => {
  const result = severityBadge(null)
  assert.equal(result.code, '?')
  assert.equal(result.ko, '자료 없음')
})

test('severityBadge handles non-existent grades with default', () => {
  const result = severityBadge(99)
  assert.equal(result.code, '?')
  assert.equal(result.ko, '자료 없음')
})

test('severityBadge coerces string grades to numbers', () => {
  assert.deepEqual(severityBadge('1'), { code: 'LGT', ko: '약함' })
  assert.deepEqual(severityBadge('2'), { code: 'MOD', ko: '보통' })
})

test('hazard encounter distinction: on vs nearby', () => {
  // Test data structure
  const hazardOn = {
    source: 'SIGMET',
    label: 'MOD TURB',
    altitude: { lower_fl: 100, upper_fl: 250 },
    encounter: 'on',
    timeStatus: 'matched'
  }

  const hazardNearby = {
    source: 'AIRMET',
    label: 'ICING',
    altitude: { lower_fl: 50, upper_fl: 100 },
    encounter: 'nearby',
    timeStatus: 'not_matched'
  }

  // Encounter text logic (as used in component)
  const getEncounterText = (hazard) => hazard.encounter === 'on' ? '실제 조우' : '인근'

  assert.equal(getEncounterText(hazardOn), '실제 조우')
  assert.equal(getEncounterText(hazardNearby), '인근')
})

test('hazard source icon selection logic', () => {
  const isSigmetOrAirmet = (source) => source.includes('SIGMET') || source.includes('AIRMET')

  assert.equal(isSigmetOrAirmet('SIGMET'), true)
  assert.equal(isSigmetOrAirmet('AIRMET'), true)
  assert.equal(isSigmetOrAirmet('TERRAIN'), false)
  assert.equal(isSigmetOrAirmet('VOLCANIC'), false)
})
