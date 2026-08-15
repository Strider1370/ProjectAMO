import { summarizeAirport } from './airport-summary.js'
import { levelForCategory, to3Level } from './flight-category.js'
import { buildDestination } from './taf-window.js'
import { buildConfidenceWarnings } from './confidence.js'
import { buildHazardSection } from './hazard-section.js'
import { matchTyphoonHazards } from './typhoon-briefing.js'
import { summarizeEnrouteModel } from './enroute-model.js'
import { buildFlightPlanProfile } from './profile-composer.js'
import { loadRouteCrossSection } from './enroute-cross-section.js'
import { buildRouteWeatherLegs } from './route-weather-legs.js'
import { buildRouteAxis } from './route-axis.js'
import { timeWindowsOverlap } from './geo-time-match.js'
import { matchRouteNotams } from './notam-briefing.js'
import { attachActiveAipConstraints } from './aip-airway-constraints.js'
import { buildBriefingProvenance } from './briefing-provenance.js'
import { airports as AIRPORT_LIST, overseasAirports as OVERSEAS_AIRPORTS } from '../config.js'

// 국내(shared/airports.js) + 해외(airports-overseas.json). 해외가 빠지면 도착지가
// VHHH 같은 곳일 때 좌표를 못 찾아 태풍·공항 판정이 "확인 불가"로만 나온다.
const AIRPORT_BY_ICAO = new Map([...AIRPORT_LIST, ...OVERSEAS_AIRPORTS].map((a) => [a.icao, a]))

function airportRoles(request) {
  const roles = [
    { role: 'departure', icao: request.departureAirport },
    { role: 'arrival', icao: request.arrivalAirport },
  ]
  if (request.alternateAirport) roles.push({ role: 'alternate', icao: request.alternateAirport })
  return roles
}

const ROLE_LABEL = { departure: '출발', arrival: '도착', alternate: '교체' }

// 공항경보(AIRPORT_WARNINGS) → adverse hazard 유사 shape. 경로 지오 없음(공항 스코프),
// dep/arr/alt ICAO + ETD~ETA 시간 겹침만. WIND_SHEAR는 red, 그 외 amber.
function buildAirportWarningHazards(warningData, roles, etd, eta) {
  const byIcao = warningData?.airports ?? {}
  const out = []
  for (const { role, icao } of roles) {
    for (const w of (byIcao[icao]?.warnings ?? [])) {
      // 유효시간 있으면 겹칠 때만, 없으면 포함(누락 방지).
      if (w.valid_start && w.valid_end && !timeWindowsOverlap(etd, eta, w.valid_start, w.valid_end)) continue
      out.push({
        source: '공항경보',
        code: w.wrng_type_key,
        label: w.wrng_type_name || w.wrng_type_key,
        validFrom: w.valid_start,
        validTo: w.valid_end,
        encounter: 'on',
        verticalKnown: true,
        bandFt: null,
        routeIntervalNm: null,
        airportScope: icao,
        role,
        level: w.wrng_type_key === 'WIND_SHEAR' ? 'red' : 'amber',
      })
    }
  }
  return out
}
const CAT_RANK = { VFR: 0, IFR: 1, LIFR: 2 } // 3레벨 표시 기준(MVFR fold 후)

// Go/No-go 배너: 실측 METAR 있는 공항 중 최악(3레벨) + 이유(운고/시정), 공항별 3레벨 체인.
function mergeAirportPayloads(primary, secondary) {
  return {
    ...(primary || secondary || {}),
    airports: { ...(primary?.airports || {}), ...(secondary?.airports || {}) },
  }
}

function mergeAdvisoryPayloads(primary, secondary) {
  return {
    ...(primary || secondary || {}),
    items: [...(primary?.items || []), ...(secondary?.items || [])],
  }
}

function buildBanner(airports) {
  const scored = airports
    .filter((a) => a.category && a.category !== 'UNKNOWN')
    // level = 심각도(VFR/MVFR=green, IFR=amber, LIFR=red). 라벨은 3단계 fold(MVFR→VFR).
    // 색은 category 고정색이 아니라 level로 매긴다(프론트 색 일치용).
    .map((a) => ({ icao: a.icao, role: a.role, category: to3Level(a.category), driver: a.driver, level: a.level }))
  if (scored.length === 0) return { worst: null, airports: [] }
  const worst = scored.reduce((acc, x) => ((CAT_RANK[x.category] ?? -1) > (CAT_RANK[acc.category] ?? -1) ? x : acc))
  return { worst, airports: scored }
}

export function composeBriefing(request, data) {
  const metarPayload = mergeAirportPayloads(data?.metar, data?.metarOverseas || data?.metar_overseas)
  const tafPayload = mergeAirportPayloads(data?.taf, data?.tafOverseas || data?.taf_overseas)
  const sigmetPayload = mergeAdvisoryPayloads(data?.sigmet, data?.sigmetOverseas || data?.sigmet_overseas)
  const metarByIcao = metarPayload.airports ?? {}
  const tafByIcao = tafPayload.airports ?? {}

  const axis = buildRouteAxis(request.routeGeometry, 2000)
  const cruiseAltitudeFt = Number(request.plannedCruiseAltitudeFt) || 0
  let flightPlanProfile = null
  try {
    flightPlanProfile = buildFlightPlanProfile(request, axis).profile
  } catch {
    // 브리핑은 기존처럼 순항고도만으로도 계속 만들 수 있어야 한다. 프로파일을 만들지 못하면
    // 단면 모델이 아래의 기존 순항고도 fallback을 사용한다.
    flightPlanProfile = null
  }

  const adverse = buildHazardSection({
    sigmet: sigmetPayload.items ?? [],
    airmet: data?.airmet?.items ?? [],
    axis,
    etd: request.etd,
    eta: request.eta,
    cruiseAltitudeFt,
    enRouteRange: request.routeModel?.enRouteRange ?? null,
    airportWarnings: buildAirportWarningHazards(data?.warning, airportRoles(request), request.etd, request.eta),
    typhoons: matchTyphoonHazards({
      typhoons: data?.typhoon?.typhoons ?? [],
      axis,
      etd: request.etd,
      eta: request.eta,
      enRouteRange: request.routeModel?.enRouteRange ?? null,
      airports: airportRoles(request).map(({ role, icao }) => ({
        role,
        icao,
        lat: AIRPORT_BY_ICAO.get(icao)?.lat,
        lon: AIRPORT_BY_ICAO.get(icao)?.lon,
      })),
    }),
  })
  const aipConstraints = attachActiveAipConstraints({ dataRoot: data?.dataRoot, routeModel: request.routeModel })

  // 경로상 NOTAM(사실 나열) + 경로 저촉(공역제한 계열 ∩ 발효중 ∩ 계획고도 통과). scope:'fir' 제외.
  const { routeNotams, routeConflicts: notamConflicts } = matchRouteNotams(data?.notam?.items ?? [], {
    axis, etd: request.etd, eta: request.eta, cruiseAltitudeFt,
    airports: airportRoles(request), // 출/도착/교체 공항 NOTAM은 경로 미교차라도 포함
  })

  // 상시 유효 공역(제한/금지/위험구역) 저촉 — NOTAM 목록엔 안 섞고 저촉 배너에만 합류(airspace-zones.js).
  // data.airspaceZones 없으면(=기존 테스트) 그냥 빈 배열 → 기존 동작 그대로.
  const { routeConflicts: zoneConflicts } = matchRouteNotams(data?.airspaceZones ?? [], {
    axis, etd: request.etd, eta: request.eta, cruiseAltitudeFt, airports: [],
  })
  const routeConflicts = [...notamConflicts, ...zoneConflicts]

  const amosByIcao = data?.amos?.airports ?? {}
  const takeoffByIcao = data?.takeoff_fcst?.airports ?? {}
  const airports = airportRoles(request).map(({ role, icao }) => ({
    ...summarizeAirport(role, metarByIcao[icao] ?? { header: { icao } }),
    amos: amosByIcao[icao] ?? null, // ② 도착 행 확장(AMOS 지상실황) — 프론트에서 buildAmosConsoleModel 재사용
    takeoffFcst: takeoffByIcao[icao] ?? null, // ② 출발 행 확장(이륙예보 매시 wd/ws/ta/qnh)
  }))

  const banner = buildBanner(airports)

  const arrivalTaf = tafByIcao[request.arrivalAirport] ?? null
  const alternateTaf = request.alternateAirport ? (tafByIcao[request.alternateAirport] ?? null) : null
  const destination = buildDestination(arrivalTaf, request.eta, { alternateTaf, alternateIcao: request.alternateAirport ?? null, flightRule: request.flightRule })
  destination.level = destination.category ? levelForCategory(destination.category) : 'gray'

  // 경로 조우만(공항경보는 경로 지오 없음 → enroute encounters 제외).
  const encounters = adverse.hazards.filter((h) => h.encounter === 'on' && !h.airportScope)
  let loaded = data?.enrouteCrossSection ?? null
  if (!loaded && data?.dataRoot) {
    try { loaded = loadRouteCrossSection({ root: data.dataRoot, routeGeometry: request.routeGeometry, body: request }) } catch { loaded = null }
  }
  const enrouteModel = loaded?.available
    ? summarizeEnrouteModel({ crossSection: loaded.crossSection, turbulence: loaded.turbulence, totalDistanceNm: loaded.totalDistanceNm, cruiseAltitudeFt, flightPlanProfile })
    : null
  const routeWeatherLegs = buildRouteWeatherLegs({
    routeModel: request.routeModel,
    routeGeometry: request.routeGeometry,
    routeMarkers: request.routeMarkers,
    procedureContext: request.procedureContext,
    weatherAxis: loaded?.axis,
    selectedCruiseAltitudeFt: cruiseAltitudeFt,
    crossSection: loaded?.crossSection,
    turbulence: loaded?.turbulence,
    hazards: adverse.hazards,
    routeNotams,
    aipConstraints,
  })
  const enroute = {
    // adverse와 동일한 보수 레벨을 따른다(밴드 미상 SIGMET이 ④에서만 amber로 새지 않도록).
    level: adverse.level,
    plannedCruiseAltitudeFt: cruiseAltitudeFt,
    encounters,
    crossSectionAvailable: loaded ? Boolean(loaded.available) : true,
    // enroute 단면 모델을 여기서 소유(이전엔 라우트·경보 스케줄러가 사후 mutate). root 없으면 null.
    model: enrouteModel,
    legs: routeWeatherLegs.legs,
    procedures: routeWeatherLegs.procedures,
    aipConstraints,
  }

  const summary = [
    { key: 'hazard', label: '위험', level: adverse.level },
    ...airports.map((a) => ({ key: a.icao, label: `${ROLE_LABEL[a.role]} ${a.icao}`, level: a.level })),
    ...(routeConflicts.length ? [{ key: 'notam', label: `경로 저촉 ${routeConflicts.length}`, level: 'red' }] : []),
  ]

  return {
    meta: {
      departureAirport: request.departureAirport,
      arrivalAirport: request.arrivalAirport,
      alternateAirport: request.alternateAirport ?? null,
      flightRule: request.flightRule,
      etd: request.etd,
      eta: request.eta,
      generatedAt: new Date(data?.now ?? Date.now()).toISOString(),
    },
    summary,
    banner,
    routeNotams,
    routeConflicts,
    provenance: buildBriefingProvenance({ routeModel: request.routeModel, aipConstraints, hazards: adverse.hazards, enrouteModel }),
    sections: { adverse, enroute, current: { airports }, destination },
    // 신뢰도 경고 — 심각도(배너 색)와 분리된 "판정을 얼마나 믿을 수 있는가" 축. 판정 로직 불변.
    warnings: buildConfidenceWarnings({
      airports,
      destination,
      arrivalTaf,
      request,
      now: data?.now != null ? new Date(data.now).getTime() : Date.now(),
      kimRun: data?.kimRun ?? null,
    }),
  }
}

export default { composeBriefing }
