import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLiveObservation } from './liveObservation.js'

const payload = (observation, time = '2026-09-23T15:30:00Z') => ({
  airports: { RKSI: { header: { observation_time: time }, observation } },
})

test('summarises the latest METAR in KST with its flight category', () => {
  const live = buildLiveObservation(payload({
    wind: { direction: 310, speed: 5, gust: null },
    visibility: { value: 10000, cavok: false },
    clouds: [{ amount: 'FEW', base: 2000 }],
    temperature: { air: 21.4 },
  }))
  assert.equal(live.category, 'VFR')
  assert.equal(live.observed, '00:30 KST 관측')
  assert.deepEqual(live.details, ['바람 310° 5kt', '시정 10km 이상', '21°C'])
})

test('a low broken ceiling makes the category IFR and gusts are shown', () => {
  const live = buildLiveObservation(payload({
    wind: { direction: 270, speed: 15, gust: 25 },
    visibility: { value: 2000 },
    clouds: [{ amount: 'FEW', base: 1500 }, { amount: 'BKN', base: 800 }],
    temperature: { air: 24 },
  }))
  assert.equal(live.category, 'IFR')
  assert.equal(live.details[0], '바람 270° 15kt 돌풍 25kt')
  assert.equal(live.details[1], '시정 2,000m')
})

test('returns null when the airport has no usable report', () => {
  assert.equal(buildLiveObservation({ airports: {} }), null)
  assert.equal(buildLiveObservation(null), null)
})
