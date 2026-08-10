import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GROUND_FORECAST_DISPLAY_MODE,
  normalizeGroundForecastDisplayMode,
} from './groundForecastDisplayMode.js'

test('ground forecast display mode defaults invalid saved values to signage', () => {
  assert.equal(normalizeGroundForecastDisplayMode(null), GROUND_FORECAST_DISPLAY_MODE.SIGNAGE)
  assert.equal(normalizeGroundForecastDisplayMode('unknown'), GROUND_FORECAST_DISPLAY_MODE.SIGNAGE)
  assert.equal(normalizeGroundForecastDisplayMode(GROUND_FORECAST_DISPLAY_MODE.CLASSIC), GROUND_FORECAST_DISPLAY_MODE.CLASSIC)
})
