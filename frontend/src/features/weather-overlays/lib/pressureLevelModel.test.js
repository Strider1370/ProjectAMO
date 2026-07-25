import assert from 'node:assert/strict'
import test from 'node:test'
import {
  flightLevelForPressure,
  formatPressureFlightLevel,
  pressureLevelPosition,
  standardAltitudeFtForPressure,
} from './pressureLevelModel.js'

test('pressure levels use ICAO standard-atmosphere display references', () => {
  assert.ok(Math.abs(standardAltitudeFtForPressure(850) - 4781) < 80)
  assert.equal(flightLevelForPressure(700), 100)
  assert.equal(formatPressureFlightLevel(700), 'FL100')
})

test('pressure slider spaces discrete pressure levels evenly from top to bottom', () => {
  const levels = [{ value: 150 }, { value: 250 }, { value: 1000 }]
  assert.equal(pressureLevelPosition(levels[0], levels), 0)
  assert.equal(pressureLevelPosition(levels[1], levels), 50)
  assert.equal(pressureLevelPosition(levels[2], levels), 100)
})
