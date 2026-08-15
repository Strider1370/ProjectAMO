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
  // 배너 계약용 고정 NOTAM 2건 — 경로 지오메트리 교차를 픽스처에서 만들기 어려워 결과를 직접 주입한다.
  const conflictNotam = {
    id: 'Z0533/26', category: 'firing', summary: '불꽃놀이 실시 — 해당 공역 진입 금지',
    rawText: 'FIREWORKS DISPLAY WILL TAKE PLACE', altitude: { lower: 0, upper: 200, unit: 'FT', ref: 'AGL' },
    validFrom: '2026-07-18T00:00:00Z', validTo: '2026-07-18T23:59:00Z', scheduleText: null,
    onRoute: true, airportRole: null, airportIcao: null,
    routeIntervalNm: { startNm: 12, endNm: 18 }, bandFt: { lowFt: 0, highFt: 200 },
    verticalKnown: true, activeAtEtd: true, timeStatus: 'matched', comparisonStatus: 'warn',
    positionStatus: 'resolved', scheduleState: 'active', approximated: false, conflict: true,
  }
  const unresolvedNotam = {
    id: 'D2054/26', category: 'restricted', summary: 'RESTRICTED AREA RK R97E ACT',
    rawText: 'RESTRICTED AREA RK R97E ACT', altitude: null,
    validFrom: '2026-07-18T00:00:00Z', validTo: '2026-07-18T23:59:00Z', scheduleText: null,
    onRoute: false, airportRole: 'departure', airportIcao: 'RKSS',
    routeIntervalNm: null, bandFt: null, verticalKnown: false, activeAtEtd: true,
    timeStatus: 'matched', comparisonStatus: 'undetermined',
    positionStatus: 'unresolved', scheduleState: 'active', approximated: false, conflict: false,
  }
  return {
    ...briefing,
    meta: { ...briefing.meta, generatedAt: FIXTURE_TIME },
    routeNotams: [conflictNotam, unresolvedNotam],
    routeConflicts: [conflictNotam],
    sections: {
      ...briefing.sections,
      enroute: {
        ...briefing.sections.enroute,
        legs: [
          {
            from: 'FIXA', to: 'FIXB', startNm: 0, endNm: 24, distanceNm: 24, courseTrueDeg: 128, selectedAltitudeFt: 9000, alignmentStatus: 'aligned',
            wind: { meanComponentKt: 12, minComponentKt: 8, maxComponentKt: 15 }, temp: { meanC: -6, minC: -8, maxC: -4 },
            icing: { peakLevel: 2, exposures: [{ level: 2, distanceNm: 12 }] }, turbulence: { peakLevel: 'moderate', exposures: [{ level: 'moderate', distanceNm: 10 }] },
            hazards: [], notams: [], timeStatus: 'matched', altitudeConstraint: { status: 'matched', applicability: 'applicable' },
          },
          {
            from: 'FIXB', to: 'FIXC', startNm: 24, endNm: 51, distanceNm: 27, courseTrueDeg: 141, selectedAltitudeFt: 9000, alignmentStatus: 'aligned',
            wind: null, temp: null, icing: null, turbulence: null,
            hazards: [{ code: 'SEV_TURB', label: 'Severe turbulence', verticalStatus: 'unknown', timeStatus: 'unavailable' }],
            notams: [{ id: 'FIXTURE-NOTAM', summary: 'Restricted area', effect: 'undetermined' }], timeStatus: 'unavailable', altitudeConstraint: { status: 'unavailable', applicability: 'applicable' },
          },
        ],
        procedures: [
          {
            type: 'SID', id: 'FIXTURE1A', from: 'RKSS', to: 'FIXA', startNm: 0, endNm: 24, distanceNm: 24,
            coordinates: [[126.8, 37.55], [126.9, 37.3]],
            legs: [{
              from: 'RKSS', to: 'FIXA', startNm: 0, endNm: 24, distanceNm: 24, courseTrueDeg: 128,
              wind: { meanComponentKt: 12, directionDeg: 270, speedKt: 12 }, temp: { meanC: -6, isaDevC: 4 },
              icing: { peakLevel: 2, exposures: [{ level: 2, distanceNm: 12 }] }, turbulence: { peakLevel: null, exposures: [] }, hazards: [], notams: [],
              altitudeConstraint: { status: 'unavailable', applicability: 'not_applicable' },
            }],
          },
        ],
      },
    },
  }
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

const cloudDistancesNm = [0, 20, 40, 60, 80, 100, 120, 140, 160]
const cloudRows = [
  { pressure: 975, altFt: 1000, cld: [.1,.1,.2,.2,.1,null,.1,.1,.1] },
  { pressure: 925, altFt: 2500, cld: [.1,.2,.7,.8,.2,null,.1,.7,.1] },
  { pressure: 850, altFt: 5000, cld: [.1,.7,.9,.8,.2,null,.7,.9,.2] },
  { pressure: 750, altFt: 8000, cld: [.1,.2,.8,.3,.1,null,.2,.7,.1] },
  { pressure: 700, altFt: 10000, cld: [.1,.1,.2,.1,.1,null,.1,.1,.1] },
]
const cloudLevels = cloudRows.map((row) => ({ pressure: row.pressure, altFt: row.altFt, values: row.cld.map((cld, index) => ({ distanceNm: cloudDistancesNm[index], altFt: row.altFt, cld, t: null, spread: null, icing: null, u: null, v: null })) }))
const crossSection = {
  run: { id: 'contract-fixture', model: 'fixture', tmfc: '2026071800', hf: 0, validTime: '2026-07-18T09:00:00Z' },
  availableTimes: [{ hf: 0, validTime: '2026-07-18T09:00:00Z' }, { hf: 3, validTime: '2026-07-18T12:00:00Z' }],
  levels: cloudLevels, coverage: { byVariable: { cld: { available: true, topPressure: 700, threshold: .6, unit: '1' } } }, turbulence: { available: false, levels: [] },
}
const altitudeComparison = {
  constraints: { status: 'matched', routeFloorFt: 7000, routeCeilingFt: 11000 },
  rows: [7000, 9000, 11000].map((altFt) => altFt === 9000 ? {
    altFt,
    label: `FL${altFt / 100}`,
    candidateStatus: 'valid',
    weatherStatus: 'available',
    wind: { meanComponentKt: 12 },
    icing: { summary: { status: 'available', highestGrade: 2, highestGradeExposureNm: 18, exposureNmByGrade: { 1: 12, 2: 18 } } },
    turbulence: { summary: { status: 'available', highestGrade: 1, highestGradeExposureNm: 6 } },
    hazards: [{
      source: 'SIGMET', sourceId: 'fixture-sigmet-1', label: 'Embedded Thunderstorm',
      altitude: { lower_fl: 60, upper_fl: 180 }, encounter: 'on', timeStatus: 'matched', verticalStatus: 'intersects',
      horizontalExposure: { status: 'intersects', intervals: [{ startNm: 5, endNm: 27 }] },
    }],
  } : {
    altFt,
    label: `FL${altFt / 100}`,
    candidateStatus: 'valid',
    weatherStatus: 'available',
    wind: { meanComponentKt: 12 },
    icing: { summary: { status: 'available', highestGrade: 0 } },
    turbulence: { summary: { status: 'available', highestGrade: 0 } },
    hazards: [],
  }),
  crossSection,
}

const exposure = {
  trigger: 'intersects',
  hazards: [{
    source: 'SIGMET', phenomenon: 'TS', sourceId: 'fixture-sigmet-1', label: 'Embedded Thunderstorm',
    horizontalExposure: { status: 'intersects', intervals: [{ startNm: 5, endNm: 27 }] },
  }],
  comparisonOnly: { lightning: { status: 'unavailable', observedAt: null, within20NmCount: null } },
}

// Contract precondition: the route is built from committed navdata; weather and terrain
// requests below are deterministic so dev:test collection state cannot affect assertions.
export async function installRouteBriefingFixtures(page, { altitudeResponse = altitudeComparison } = {}) {
  const exposureRequests = { single: new Map(), batch: new Map() }
  const crossSectionRequests = { count: 0, bodies: [] }
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
  await page.route('**/api/briefing/altitudes', (route) => fulfill(route, altitudeResponse))
  await page.route('**/api/vertical-profile', (route) => fulfill(route, profileFor(requestJson(route))))
  await page.route('**/api/briefing/cross-section', (route) => {
    crossSectionRequests.count += 1
    const body = requestJson(route)
    crossSectionRequests.bodies.push(body)
    const { hf } = body
    const selectedHf = Number.isFinite(Number(hf)) ? Number(hf) : crossSection.run.hf
    const selectedTime = crossSection.availableTimes.find((time) => time.hf === selectedHf)
    return fulfill(route, { ...crossSection, run: { ...crossSection.run, hf: selectedHf, validTime: selectedTime?.validTime ?? crossSection.run.validTime } })
  })
  await page.route('**/api/route-briefing', (route) => fulfill(route, briefingFor(requestJson(route))))
  return { ...exposureRequests, crossSection: crossSectionRequests }
}
