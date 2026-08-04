import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWeatherOverlayModel } from './weatherOverlayModel.js'
import { buildOrderedTimes, nextPlaybackTime } from './useTimelineRail.js'

test('playback advances through QPF separately from KIM and wraps back to observations without stale rasters', () => {
  const observed = Date.UTC(2026, 7, 4, 10, 25)
  const qpf = Date.UTC(2026, 7, 4, 10, 35)
  const ordered = buildOrderedTimes([observed], [{ hf: 6, validTime: '2026-08-04T16:00:00.000Z' }], [qpf])
  const base = {
    echoMeta: { frames: [{ tm: '202608041925', path: '/radar-1025.webp' }] },
    qpfMeta: { frames: [{ tm: '202608041925', analysisTimeMs: observed, validTimeMs: qpf, leadMinutes: 10, path: '/qpf-10.webp' }] },
    visibility: { radar: true },
  }

  const forecast = nextPlaybackTime(ordered, observed)
  const wrapped = nextPlaybackTime(ordered, ordered.at(-1))
  const forecastModel = buildWeatherOverlayModel({ ...base, selectedWeatherTimeMs: forecast })
  const observedModel = buildWeatherOverlayModel({ ...base, selectedWeatherTimeMs: wrapped })

  assert.equal(forecast, qpf)
  assert.equal(forecastModel.radarFrame, null)
  assert.equal(forecastModel.qpfFrame.path, '/qpf-10.webp')
  assert.equal(wrapped, observed)
  assert.equal(observedModel.radarFrame.path, '/radar-1025.webp')
  assert.equal(observedModel.qpfFrame, null)
})
