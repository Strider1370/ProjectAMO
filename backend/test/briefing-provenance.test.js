import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBriefingProvenance } from '../src/briefing/briefing-provenance.js'
import {
  TRACE_AIP_CONSTRAINTS,
  TRACE_HAZARDS,
  TRACE_ROUTE_MODEL,
  WORKFLOW_SCENARIOS,
} from './fixtures/briefing-trace.js'

test('common trace fixture retains route, AIP, hazard, and run identities', () => {
  const provenance = buildBriefingProvenance({
    routeModel: TRACE_ROUTE_MODEL,
    aipConstraints: TRACE_AIP_CONSTRAINTS,
    hazards: TRACE_HAZARDS,
    enrouteModel: { runs: { kim: { tmfc: '2026062500', hf: 3 }, ktg: null } },
  })

  assert.deepEqual(provenance.route.enRouteSegmentIds, ['A582-003', 'A582-004'])
  assert.deepEqual(provenance.route.enRouteLegs, [{ id: 'A582-003', kind: 'airway' }, { id: 'A582-004', kind: 'airway' }])
  assert.equal(provenance.aip.publicationId, '2026-06-25')
  assert.equal(provenance.hazards[0].id, 'SIGMET-RKRR-1')
  assert.equal(provenance.hazards[0].timeStatus, 'not_provided')
  assert.equal(provenance.enrouteWeather.kimRun.hf, 3)
  assert.equal(provenance.enrouteWeather.ktgRun, null)
})

test('common workflow fixture names every required review situation', () => {
  assert.deepEqual(WORKFLOW_SCENARIOS.map((scenario) => scenario.id), [
    'normal',
    'horizontal_hazard',
    'altitude_mismatch',
    'time_missing',
    'multiple_polygons',
    'aip_conflict',
    'notam_unresolved',
  ])
})
