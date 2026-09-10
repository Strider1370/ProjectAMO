import { composeBriefing } from '../../backend/src/briefing/briefing-composer.js'
import { buildVerticalProfile } from '../../backend/src/briefing/vertical-profile.js'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

export const organizationFlightFixture = {
  id: 71, orgId: 11, name: '광주–여수 기관 검증 비행', version: 1, assignedUserId: 2,
  etd: '2026-09-10T00:00:00.000Z', eta: '2026-09-10T01:00:00.000Z', status: 'scheduled',
  snapshot: { version: 3, kind: 'briefing', base: {
    id: 'base', name: '광주–여수', kind: 'base', routeForm: { flightRule: 'VFR', departureAirport: 'RKJJ', arrivalAirport: 'RKJY' },
    enroute: { terms: [], legIntents: [], userWaypoints: [], nextWaypointNumber: 1 }, routeString: 'RKJJ RKJY', procedureIds: {},
  }, cruiseAltitudeFt: 3500, tasKt: 100, etd: '2026-09-10T00:00:00.000Z', eta: '2026-09-10T01:00:00.000Z',
  routeGeometry: { type: 'LineString', coordinates: [[126.8089, 35.1264], [127.6169, 34.8422]] },
  routeMarkers: [{ id: 'departure', label: 'RKJJ', lon: 126.8089, lat: 35.1264, kind: 'AIRPORT' }, { id: 'arrival', label: 'RKJY', lon: 127.6169, lat: 34.8422, kind: 'AIRPORT' }],
  }, annotations: [], materialRefs: [], blocks: [],
}

export function organizationBundleFixture(flight = organizationFlightFixture, overrides = {}, bundleId = 'fixture-bundle-1') {
  const request = { ...flight.snapshot, ...flight.snapshot.base.routeForm,
    plannedCruiseAltitudeFt: overrides.cruiseAltitudeFt ?? flight.snapshot.cruiseAltitudeFt,
    etd: overrides.etd ?? flight.etd, eta: new Date(Date.parse(overrides.etd ?? flight.etd) + Date.parse(flight.eta) - Date.parse(flight.etd)).toISOString(),
  }
  const status = { status: 'out_of_range', requestedTime: request.etd, selectedValidTime: null,
    coverage: { from: '2026-08-23T06:00:00Z', to: '2026-08-23T13:00:00Z' }, reason: '저장 예보가 요청 시각을 포함하지 않습니다.' }
  return { bundleId, flight, briefing: composeBriefing(request, { metar: { airports: {} }, taf: { airports: {} }, sigmet: { items: [] }, airmet: { items: [] }, enrouteCrossSection: { available: false, crossSection: null, turbulence: null } }),
    verticalProfile: buildVerticalProfile(request, { sampleAxis: (axis) => ({ terrain: { unit: 'm', values: axis.samples.map((sample) => ({ index: sample.index, elevationM: 80 })) }, warnings: [] }) }),
    crossSection: { available: false, levels: [], availableTimes: [] },
    componentStatus: { kim: status, ktg: status, verticalProfile: { status: 'available' } },
    mapDataSelection: { schemaVersion: 1, bundleId, mode: 'pinned', models: { kim: status, ktg: status }, frames: {} },
    linkedItems: [], provenance: { fixture: true },
  }
}

export async function installOrganizationBriefingFixture(page) {
  const requests = { organization: [], personal: [], failNext: false, holdNext: false, release: null, flight: structuredClone(organizationFlightFixture) }
  await page.addInitScript((version) => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
  const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  // Use a browser fetch fixture for these endpoints. WebKit's network interception
  // can replay fulfilled POSTs outside routing during abort/reload; real authenticated
  // HTTP behavior is independently exercised by verify-organization-live.mjs.
  await page.exposeFunction('__organizationFixtureResponse', async ({ url, body }) => {
    if (url === '/api/auth/me') return { status: 200, body: { id: 2, username: 'fixture_pilot', role: 'pilot', display_name: '검증 조종사' } }
    if (url === '/api/organizations/11/flights/71') return { status: 200, body: { flight: requests.flight } }
    requests.organization.push(body)
    if (requests.holdNext) { requests.holdNext = false; await new Promise(resolve => { requests.release = resolve }) }
    if (requests.failNext) { requests.failNext = false; return { status: 503, body: { error: 'fixture_partial_failure' } } }
    return { status: 200, body: organizationBundleFixture(requests.flight, body.overrides, `fixture-${requests.organization.length}`) }
  })
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href)
      if (url.origin === location.origin && ['/api/auth/me', '/api/organizations/11/flights/71', '/api/organizations/11/flights/71/weather-briefing'].includes(url.pathname)) {
        const response = await window.__organizationFixtureResponse({ url: url.pathname, body: options.body ? JSON.parse(options.body) : null })
        return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(input, options)
    }
  })
  await page.context().route(/\/api\/(?:route-briefing|vertical-profile|briefing\/(?:cross-section|nwp-time-refresh|altitudes|route-exposure)(?:\/batch)?)(?:\?|$)/, (route) => {
    requests.personal.push(route.request().url())
    return fulfill(route, { error: 'personal_api_forbidden_in_organization_contract' }, 500)
  })
  return requests
}
