import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWeatherOverlayModel } from './weatherOverlayModel.js'
import { buildOrderedTimes, nextPlaybackTime } from './useTimelineRail.js'

test('playback advances through exact forecast ticks separately from KIM and wraps back to observations', () => {
  const observed = Date.UTC(2026, 7, 4, 10, 25)
  const forecastTick = Date.UTC(2026, 7, 4, 10, 35)
  const ordered = buildOrderedTimes([observed], [{ hf: 6, validTime: '2026-08-04T16:00:00.000Z' }], [forecastTick])
  const base = { echoMeta: { frames: [{ tm: '202608041925', path: '/radar-1025.webp' }] }, visibility: { radar: true } }

  const forecast = nextPlaybackTime(ordered, observed)
  const wrapped = nextPlaybackTime(ordered, ordered.at(-1))
  const observedModel = buildWeatherOverlayModel({ ...base, selectedWeatherTimeMs: wrapped })

  assert.equal(forecast, forecastTick)
  assert.equal(wrapped, observed)
  assert.equal(observedModel.radarFrame.path, '/radar-1025.webp')
})
