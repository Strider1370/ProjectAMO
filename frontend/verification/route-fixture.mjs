import { composeBriefing } from '../../backend/src/briefing/briefing-composer.js'
import { buildVerticalProfile } from '../../backend/src/briefing/vertical-profile.js'

const FIXTURE_TIME = '2026-07-18T09:00:00Z'

function fulfill(route, json) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) })
}

function requestJson(route) {
  return route.request().postDataJSON() || {}
}

function stableRoutePayload(route) {
  const body = requestJson(route)
  return JSON.stringify({ routeGeometry: body.routeGeometry, routeModel: body.routeModel, etd: body.etd, eta: body.eta })
}

function observation() {
  return {
    observation: {
      wind: { raw: '27008KT', speed: 8 },
      visibility: { value: 9999 },
      clouds: [{ amount: 'FEW', base: 3000 }],
      weather: [],
      temperature: { air: 18, dewpoint: 9 },
      qnh: { value: 1018 },
      display: { wind: '27008KT', clouds: 'FEW030', temperature: '18/09', qnh: 'Q1018', weather: '-' },
    },
  }
}

function briefingFor(request) {
  const airports = Object.fromEntries(
    [request.departureAirport, request.arrivalAirport, request.alternateAirport]
      .filter(Boolean)
      .map((icao) => [icao, { header: { icao }, ...observation() }]),
  )
  const briefing = composeBriefing({
    ...request,
    etd: request.etd || FIXTURE_TIME,
    eta: request.eta || '2026-07-18T10:30:00Z',
    plannedCruiseAltitudeFt: Number(request.plannedCruiseAltitudeFt) || 9000,
  }, { metar: { airports }, taf: { airports: {} }, sigmet: { items: [] }, airmet: { items: [] } })
  return { ...briefing, meta: { ...briefing.meta, generatedAt: FIXTURE_TIME } }
}

function profileFor(request) {
  const payload = {
    ...request,
    plannedCruiseAltitudeFt: Number(request.plannedCruiseAltitudeFt) || 9000,
    candidateCruiseAltitudesFt: request.candidateCruiseAltitudesFt?.length ? request.candidateCruiseAltitudesFt : [7000, 9000, 11000],
  }
  return buildVerticalProfile(payload, {
    sampleAxis(axis) {
      return {
        terrain: { unit: 'm', values: axis.samples.map((sample) => ({ index: sample.index, elevationM: 80 })) },
        warnings: [],
      }
    },
  })
}

const crossSection = { run: { id: 'contract-fixture', model: 'fixture' }, levels: [], coverage: { byVariable: {} }, turbulence: { available: false, levels: [] } }
const altitudeComparison = {
  constraints: { status: 'matched', routeFloorFt: 7000, routeCeilingFt: 11000 },
  rows: [7000, 9000, 11000].map((altFt) => ({
    altFt,
    label: `FL${altFt / 100}`,
    candidateStatus: 'valid',
    weatherStatus: 'available',
    wind: { meanComponentKt: 12 },
    icing: { summary: { status: 'available', highestGrade: 0 } },
    turbulence: { summary: { status: 'available', highestGrade: 0 } },
    hazards: [],
  })),
  crossSection,
}

const exposure = { trigger: 'none', hazards: [], comparisonOnly: { lightning: { status: 'unavailable', observedAt: null, within20NmCount: null } } }

// Contract precondition: the route is built from committed navdata; weather and terrain
// requests below are deterministic so dev:test collection state cannot affect assertions.
export async function installRouteBriefingFixtures(page) {
  const exposureRequests = { single: new Map(), batch: new Map() }
  const crossSectionRequests = { count: 0 }
  await page.route('**/api/briefing/route-exposure', (route) => {
    const key = stableRoutePayload(route)
    exposureRequests.single.set(key, (exposureRequests.single.get(key) || 0) + 1)
    return fulfill(route, exposure)
  })
  await page.route('**/api/briefing/route-exposure/batch', (route) => {
    const routes = requestJson(route).routes || []
    for (const entry of routes) {
      const key = JSON.stringify({ routeGeometry: entry.routeGeometry, routeModel: entry.routeModel, etd: entry.etd, eta: entry.eta })
      exposureRequests.batch.set(key, (exposureRequests.batch.get(key) || 0) + 1)
    }
    return fulfill(route, { results: routes.map(({ id }) => ({ id, ...exposure })), snapshot: { id: 'route-fixture' } })
  })
  await page.route('**/api/briefing/altitudes', (route) => fulfill(route, altitudeComparison))
  await page.route('**/api/vertical-profile', (route) => fulfill(route, profileFor(requestJson(route))))
  await page.route('**/api/briefing/cross-section', (route) => {
    crossSectionRequests.count += 1
    return fulfill(route, crossSection)
  })
  await page.route('**/api/route-briefing', (route) => fulfill(route, briefingFor(requestJson(route))))
  return { ...exposureRequests, crossSection: crossSectionRequests }
}
