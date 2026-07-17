import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildBriefingRoute, buildRouteAlternatives } from './routePlanner.js'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const publicData = path.join(frontendRoot, 'public', 'data', 'navdata')

test('buildBriefingRoute derives the current domestic graph from enroute.json', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json'
      ? path.join(publicData, name)
      : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }

  try {
    const route = await buildBriefingRoute({
      departureAirport: 'RKSI', entryFix: 'SEL', exitFix: 'APELA', arrivalAirport: 'RKPK', routeType: 'ATS',
    })
    assert.equal(route.routeIds[0], 'A582')
    assert.equal(route.segments[0].id, 'A582-001')
    assert.equal(route.segments[0].cycle, '2026-06-25')
  } finally {
    global.fetch = originalFetch
  }
})

function alternativeNavdata(alternateDistanceNm = 60) {
  const segments = [
    { id: 'AB', from: 'A', to: 'B', routeId: 'BASE', routeType: 'ATS', distanceNm: 50 },
    { id: 'BD', from: 'B', to: 'D', routeId: 'BASE', routeType: 'ATS', distanceNm: 50 },
    { id: 'AC', from: 'A', to: 'C', routeId: 'ALT', routeType: 'ATS', distanceNm: alternateDistanceNm },
    { id: 'CD', from: 'C', to: 'D', routeId: 'ALT', routeType: 'ATS', distanceNm: alternateDistanceNm },
  ]
  const routeGraph = {}
  for (const segment of segments) {
    for (const [from, to] of [[segment.from, segment.to], [segment.to, segment.from]]) {
      ;(routeGraph[from] ??= []).push({ to, segmentId: segment.id, distanceNm: segment.distanceNm })
    }
  }
  return {
    airports: { DEP: { coordinates: { lon: 0, lat: 0 } }, ARR: { coordinates: { lon: 4, lat: 0 } } },
    navpoints: Object.fromEntries(['A', 'B', 'C', 'D'].map((id, index) => [id, { coordinates: { lon: index + 1, lat: 0 } }])),
    routeGraph,
    routeSegmentsById: Object.fromEntries(segments.map((segment) => [segment.id, segment])),
    routes: { BASE: { sequence: ['A', 'B', 'D'] }, ALT: { sequence: ['A', 'C', 'D'] } },
    routeDirectionMetadata: { routes: { BASE: { allowedDirection: 'both' }, ALT: { allowedDirection: 'both' } } },
  }
}

test('buildRouteAlternatives blocks one exposed segment and keeps only distinct bounded detours', async () => {
  const navdata = alternativeNavdata()
  const baselineRoute = {
    flightRule: 'IFR', distanceNm: 100, totalDistanceNm: 100,
    segments: [navdata.routeSegmentsById.AB, navdata.routeSegmentsById.BD],
  }
  const candidates = await buildRouteAlternatives({
    departureAirport: 'DEP', entryFix: 'A', exitFix: 'D', arrivalAirport: 'ARR', routeType: 'ATS',
    triggerIntervals: [{ startNm: 45, endNm: 55 }], baselineRoute,
    routeModel: { enRouteSegments: [{ id: 'AB', startNm: 0, endNm: 50 }, { id: 'BD', startNm: 50, endNm: 100 }] }, navdata,
  })

  assert.deepEqual(candidates.map((candidate) => candidate.id), ['base', 'alt-1'])
  assert.deepEqual(candidates[1].routeResult.segments.map((segment) => segment.id), ['AC', 'CD'])
  assert.equal(candidates[1].addedDistanceNm, 20)
  assert.equal(candidates[1].changedDistanceNm, 120)
})

test('buildRouteAlternatives returns only the baseline when no interval reaches an en-route segment', async () => {
  const navdata = alternativeNavdata()
  const baselineRoute = { distanceNm: 100, segments: [navdata.routeSegmentsById.AB, navdata.routeSegmentsById.BD] }
  const candidates = await buildRouteAlternatives({
    departureAirport: 'DEP', entryFix: 'A', exitFix: 'D', arrivalAirport: 'ARR', routeType: 'ATS',
    triggerIntervals: [{ startNm: 200, endNm: 210 }], baselineRoute,
    routeModel: { enRouteSegments: [{ id: 'AB', startNm: 0, endNm: 50 }, { id: 'BD', startNm: 50, endNm: 100 }] }, navdata,
  })
  assert.equal(candidates.length, 1)
})

test('buildRouteAlternatives keeps a test-mode detour up to the 2,000 NM ceiling', async () => {
  const navdata = alternativeNavdata(1050)
  const baselineRoute = { distanceNm: 100, totalDistanceNm: 100, segments: [navdata.routeSegmentsById.AB, navdata.routeSegmentsById.BD] }
  const candidates = await buildRouteAlternatives({
    departureAirport: 'DEP', entryFix: 'A', exitFix: 'D', arrivalAirport: 'ARR', routeType: 'ATS',
    triggerIntervals: [{ startNm: 45, endNm: 55 }], baselineRoute,
    routeModel: { enRouteSegments: [{ id: 'AB', startNm: 0, endNm: 50 }, { id: 'BD', startNm: 50, endNm: 100 }] }, navdata,
  })
  assert.equal(candidates[1].addedDistanceNm, 2000)
})
