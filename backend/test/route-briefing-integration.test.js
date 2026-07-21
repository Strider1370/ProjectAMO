import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeBriefing } from '../src/briefing/briefing-composer.js'
import http from 'node:http'

const poly = { type:'Polygon', coordinates: [[[125,32],[128,32],[128,35],[125,35],[125,32]]] }
const request = {
  flightRule:'IFR', departureAirport:'RKSI', arrivalAirport:'RKPC', alternateAirport:'RKPK',
  routeGeometry:{ type:'LineString', coordinates:[[126.45,37.46],[126.5,33.5]] },
  etd:'2026-06-26T09:00:00Z', eta:'2026-06-26T10:30:00Z', plannedCruiseAltitudeFt:9000,
}
const obs = { observation:{ wind:{raw:'27008KT',speed:8}, visibility:{value:9999}, clouds:[{amount:'FEW',base:3000}], weather:[], temperature:{air:18,dewpoint:9}, qnh:{value:1018}, display:{wind:'27008KT',clouds:'FEW030',temperature:'18/09',qnh:'Q1018',weather:'-'} } }
const data = {
  metar:{ airports:{ RKSI:{header:{icao:'RKSI'},...obs}, RKPC:{header:{icao:'RKPC'},...obs}, RKPK:{header:{icao:'RKPK'},...obs} } },
  taf:{ airports:{} },
  sigmet:{ items:[
    { id:'on', phenomenon_code:'SEV_ICE', phenomenon_label:'Severe Icing', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:poly, altitude:{lower_fl:60,upper_fl:120,lower_uom:'FL',upper_uom:'FL'} },
    { id:'near', phenomenon_code:'SEV_TURB', phenomenon_label:'Severe Turbulence', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:poly, altitude:{lower_fl:300,upper_fl:400,lower_uom:'FL',upper_uom:'FL'} },
  ] },
  airmet:{ items:[] },
}

test('integration: 3D briefing payload is internally consistent', () => {
  const b = composeBriefing(request, data)
  assert.equal(b.sections.adverse.hazards.length, 2)
  const enc = b.sections.adverse.hazards.find((h) => h.code === 'SEV_ICE')
  const near = b.sections.adverse.hazards.find((h) => h.code === 'SEV_TURB')
  assert.equal(enc.encounter, 'on')
  assert.equal(near.encounter, 'nearby')
  assert.equal(b.sections.adverse.level, 'red')
  assert.equal(b.sections.enroute.encounters.length, 1)
  assert.equal(b.sections.enroute.encounters[0].code, 'SEV_ICE')
  assert.equal(b.sections.enroute.plannedCruiseAltitudeFt, 9000)
  assert.equal(b.sections.current.airports.length, 3)
})

test('integration: briefing includes route weather legs from one injected cross-section', () => {
  const weatherAxis = {
    totalDistanceNm: 20,
    samples: [{ distanceNm: 0, bearingDeg: 90 }, { distanceNm: 10, bearingDeg: 90 }, { distanceNm: 20, bearingDeg: 90 }],
  }
  const crossSection = {
    levels: [
      { altFt: 9000, values: [{ altFt: 9000, u: 10, v: 0, T: 273.15, icing: 0 }, { altFt: 9000, u: 20, v: 0, T: 274.15, icing: 1 }, { altFt: 9000, u: 30, v: 0, T: 275.15, icing: 1 }] },
    ],
  }
  const briefing = composeBriefing({
    ...request,
    routeModel: {
      enRouteRange: { startNm: 0, endNm: 20, status: 'aligned' },
      enRouteSegments: [{ id: 'FIXA-FIXB', fromFix: 'FIXA', toFix: 'FIXB', startNm: 0, endNm: 20, alignmentStatus: 'aligned' }],
    },
  }, {
    ...data,
    enrouteCrossSection: { available: true, axis: weatherAxis, crossSection, turbulence: { levels: [] }, totalDistanceNm: 20 },
  })
  assert.equal(briefing.sections.enroute.legs.length, 1)
  assert.deepEqual(Object.keys(briefing.sections.enroute.legs[0].wind), ['meanComponentKt', 'minComponentKt', 'maxComponentKt'])
  assert.equal(briefing.sections.enroute.legs[0].from, 'FIXA')
  assert.equal(briefing.sections.enroute.legs[0].to, 'FIXB')
})

test('route exposure endpoint validates geometry and returns its model', async () => {
  process.env.NODE_ENV = 'test'
  const { app } = await import(`../server.js?route-exposure-test=${Date.now()}`)
  const server = await new Promise((resolve) => {
    const instance = http.createServer(app)
    instance.listen(0, '127.0.0.1', () => resolve(instance))
  })
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const missing = await fetch(`${baseUrl}/api/briefing/route-exposure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(missing.status, 400)
    const valid = await fetch(`${baseUrl}/api/briefing/route-exposure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] } }),
    })
    assert.equal(valid.status, 200)
    assert.equal(typeof (await valid.json()).trigger, 'string')
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('route exposure batch fixes one cache snapshot for every route', async () => {
  process.env.NODE_ENV = 'test'
  const { app } = await import(`../server.js?route-exposure-batch-test=${Date.now()}`)
  const server = await new Promise((resolve) => {
    const instance = http.createServer(app)
    instance.listen(0, '127.0.0.1', () => resolve(instance))
  })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/briefing/route-exposure/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes: [
        { id: 'base', routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] } },
        { id: 'alternative', routeGeometry: { type: 'LineString', coordinates: [[126, 37], [128, 38]] } },
      ] }),
    })
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(payload.results.length, 2)
    assert.equal(payload.results[0].snapshot.version, payload.snapshot.version)
    assert.equal(payload.results[1].snapshot.version, payload.snapshot.version)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
