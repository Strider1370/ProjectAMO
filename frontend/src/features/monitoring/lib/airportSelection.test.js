import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  filterMonitoringAirportChoices,
  resolveMonitoringAirportSelection,
} from './airportSelection.js'

describe('monitoring airport selection', () => {
  it('excludes military airfields from the choices for both monitoring modes', () => {
    const choices = filterMonitoringAirportChoices(['RKSI', 'RKTU', 'RKTH', 'RKPC', 'RKPS'])

    assert.deepEqual(choices, ['RKSI', 'RKPC'])
  })

  it('replaces a saved military-airfield selection with the default civil airport', () => {
    const selected = resolveMonitoringAirportSelection('RKTH', ['RKSI', 'RKPC'])

    assert.equal(selected, 'RKSI')
  })
})
