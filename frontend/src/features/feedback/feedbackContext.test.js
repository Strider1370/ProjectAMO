import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildFeedbackContext } from './feedbackContext.js'

const location = { pathname: '/', search: '?airport=RKSI' }
const viewport = { innerWidth: 1440.4, innerHeight: 900 }

test('buildFeedbackContext keeps only the small screen summary', () => {
  const map = {
    getCopilotUiState: () => ({ layers: { radar: true, sigmet: true, wind: false } }),
    getAppliedCopilotContext: () => ({ request: { departureAirport: 'RKSS', arrivalAirport: 'RKPC', flightRule: 'IFR',
      plannedCruiseAltitudeFt: 25000, routeGeometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } } }),
  }
  const context = buildFeedbackContext({ map, airport: 'RKSI', panel: 'route-check', briefing: true, location, viewport })
  assert.deepEqual(context.route, { departure: 'RKSS', arrival: 'RKPC', flightRule: 'IFR', cruiseAltitudeFt: 25000 })
  assert.deepEqual(context.layers, ['radar', 'sigmet'])
  assert.deepEqual(context.viewport, { width: 1440, height: 900 })
  assert.equal(context.path, '/?airport=RKSI')
  assert.equal('routeGeometry' in context.route, false)
})

test('buildFeedbackContext survives a map that is not ready', () => {
  const map = { getCopilotUiState: () => { throw new Error('MAP_NOT_READY') } }
  const context = buildFeedbackContext({ map, airport: 'bad airport', panel: null, briefing: false, location, viewport })
  assert.equal(context.airport, null)
  assert.equal(context.route, null)
  assert.deepEqual(context.layers, [])
})
