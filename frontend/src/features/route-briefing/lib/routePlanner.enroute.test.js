import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildBriefingRoute, buildManualIfrRoute, formatRouteString, parseRouteString, resolveMapInteraction } from './routePlanner.js'
import { formatManualRouteString, parseManualRouteString } from './manualRouteInput.js'

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
    assert.ok(route.previewGeojson.features.some((feature) => feature.properties?.role === 'route-preview-point' && feature.properties?.label === 'SEL'))
  } finally {
    global.fetch = originalFetch
  }
})

test('resolveMapInteraction accepts a nearby published fix and validates the complete IFR route', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const result = await resolveMapInteraction({
      coordinates: [126.9283, 37.4136], departureAirport: 'RKSI', entryFix: 'SEL', exitFix: 'APELA', arrivalAirport: 'RKPK', routeType: 'ATS',
    })
    assert.equal(result.fixId, 'SEL')
    assert.deepEqual(result.viaFixes, ['SEL'])
    assert.equal(result.routeResult.flightRule, 'IFR')
  } finally {
    global.fetch = originalFetch
  }
})

test('compatible route strings round-trip computed airway segments and reject partial input', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const input = { departureAirport: 'RKSI', entryFix: 'SEL', exitFix: 'APELA', arrivalAirport: 'RKPK', routeType: 'ATS' }
    const route = await buildBriefingRoute(input)
    const text = formatRouteString(route)
    const parsed = await parseRouteString(text, input)
    assert.deepEqual(parsed.routeResult.navpointIds, route.navpointIds)
    await assert.rejects(() => parseRouteString('SEL DCT NOFIX DCT APELA', input), /FIX를 찾을 수 없습니다/)
  } finally {
    global.fetch = originalFetch
  }
})

test('manual IFR route keeps DCT legs separate from airway legs', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const route = await buildManualIfrRoute({
      departureAirport: 'RKSI', arrivalAirport: 'RKPK', routeType: 'ALL',
      enroute: parseManualRouteString('SEL A582 APELA DCT N3500.0E12800.0'),
    })
    assert.ok(route.manualLegs.some((leg) => leg.kind === 'airway' && leg.routeId === 'A582'))
    assert.ok(route.manualLegs.some((leg) => leg.kind === 'dct' && leg.id.startsWith('dct:')))
  } finally {
    global.fetch = originalFetch
  }
})

test('manual IFR route resolves a local user waypoint without treating it as navdata', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const userWaypoints = [{ id: 'user-wp-1', name: 'WP1', lon: 128, lat: 35 }]
    const route = await buildManualIfrRoute({
      departureAirport: 'RKSI', arrivalAirport: 'RKPK', routeType: 'ALL', userWaypoints,
      enroute: parseManualRouteString('SEL DCT WP1', { userWaypoints }),
    })
    assert.equal(route.manualRoute.points[1].kind, 'user-waypoint')
    assert.equal(route.manualLegs.at(-1).toFix, 'user-wp-1')
  } finally {
    global.fetch = originalFetch
  }
})

test('one entered FIX produces a direct departure-FIX-arrival preview', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const route = await buildManualIfrRoute({
      departureAirport: 'RKSI', arrivalAirport: 'RKPK', routeType: 'ALL', enroute: parseManualRouteString('SEL'),
    })
    const line = route.previewGeojson.features.find((feature) => feature.properties?.role === 'route-preview-line')
    assert.equal(line.geometry.coordinates.length, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('generated Y711 airway text can be applied as a manual route', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const route = await buildManualIfrRoute({
      departureAirport: 'RKSS', arrivalAirport: 'RKPC', routeType: 'ALL',
      enroute: parseManualRouteString('BULTI Y711 MEKIL Y711 GONAX Y711 BEDES Y711 ELPOS Y711 MANGI Y711 DALSU Y711 NULDI Y711 DOTOL'),
    })
    assert.equal(route.manualLegs.filter((leg) => leg.kind === 'airway').length, 8)
    assert.equal(route.manualRoute.points[0].label, 'BULTI')
    const line = route.previewGeojson.features.find((feature) => feature.properties?.role === 'route-preview-line')
    assert.equal(line.geometry.coordinates.length, 11)
  } finally {
    global.fetch = originalFetch
  }
})

test('whole-route distance places MANGI after BEDES on the RKSS to RKPC route', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const candidates = await Promise.all([
      'MANGI GONAX BEDES',
      'GONAX MANGI BEDES',
      'GONAX BEDES MANGI',
    ].map(async (text) => ({
      text,
      route: await buildManualIfrRoute({
        departureAirport: 'RKSS', arrivalAirport: 'RKPC', routeType: 'ALL', enroute: parseManualRouteString(text),
      }),
    })))
    const shortest = candidates.reduce((best, candidate) => candidate.route.totalDistanceNm < best.route.totalDistanceNm ? candidate : best)
    assert.equal(shortest.text, 'GONAX BEDES MANGI')
  } finally {
    global.fetch = originalFetch
  }
})

test('adjacent FIX entries use their only shared airway when one exists', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const route = await buildManualIfrRoute({
      departureAirport: 'RKSS', arrivalAirport: 'RKPC', routeType: 'ALL', enroute: parseManualRouteString('BULTI MEKIL'),
    })
    assert.equal(route.manualLegs[0].routeId, 'Y711')
  } finally {
    global.fetch = originalFetch
  }
})

test('manual apply expands bare same-airway FIXs into all editable Y711 FIXs', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const route = await buildManualIfrRoute({
      departureAirport: 'RKSS', arrivalAirport: 'RKPC', routeType: 'ALL', enroute: parseManualRouteString('MEKIL DOTOL'),
    })
    assert.equal(route.manualLegs.filter((leg) => leg.routeId === 'Y711').length, 7)
    assert.deepEqual(route.manualRoute.points.map((point) => point.label), ['MEKIL', 'GONAX', 'BEDES', 'ELPOS', 'MANGI', 'DALSU', 'NULDI', 'DOTOL'])
    assert.equal(formatManualRouteString(route.resolvedEnroute), 'MEKIL Y711 GONAX Y711 BEDES Y711 ELPOS Y711 MANGI Y711 DALSU Y711 NULDI Y711 DOTOL')
  } finally {
    global.fetch = originalFetch
  }
})

test('manual apply keeps an explicit DCT as a direct leg', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const name = String(url).split('/').at(-1)
    const file = name === 'airports.json' || name === 'enroute.json' ? path.join(publicData, name) : null
    if (!file) return new Response('', { status: 404 })
    return new Response(fs.readFileSync(file), { status: 200 })
  }
  try {
    const route = await buildManualIfrRoute({
      departureAirport: 'RKSS', arrivalAirport: 'RKPC', routeType: 'ALL', enroute: parseManualRouteString('MEKIL DCT DOTOL'),
    })
    assert.equal(route.manualLegs.length, 1)
    assert.equal(route.manualLegs[0].kind, 'dct')
  } finally {
    global.fetch = originalFetch
  }
})
