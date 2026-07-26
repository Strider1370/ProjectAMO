// 경로상 NOTAM 매칭(사실 계산). geo-time-match 코어 재사용 — hazardLevel() 심각도 그라데이션은 쓰지 않음.
import { routeIntervalInGeometry, routeCorridorInGeometry, timeWindowsOverlap } from './geo-time-match.js'
import { classifyEncounter } from './hazard-matcher.js'

const HIGH_FT = 99999

// NOTAM altitude { lower, upper, unit, ref } → { lowFt, highFt }. bandToFt(SIGMET shape)와 필드가 달라 별도 어댑터.
// ponytail: AGL/AMSL 기준면 차이는 coarse 수직 겹침 판정에서 무시(지형고도 무시). 정밀 필요 시 ref별 지표고 보정.
export function notamBandToFt(altitude) {
  if (!altitude) return null
  const unit = String(altitude.unit || '').toUpperCase()
  const toFt = (v) => (unit === 'FL' ? Number(v) * 100 : Number(v))
  const lowFt = altitude.lower == null ? 0 : toFt(altitude.lower)
  const unlimited = altitude.upper == null || (unit === 'FL' && Number(altitude.upper) >= 999)
  const highFt = unlimited ? HIGH_FT : toFt(altitude.upper)
  if (!Number.isFinite(lowFt) && !Number.isFinite(highFt)) return null
  return { lowFt: Number.isFinite(lowFt) ? lowFt : 0, highFt: Number.isFinite(highFt) ? highFt : HIGH_FT }
}

// spec §Route-Briefing Integration: 공역 제한 계열(ICAO Q-code 정의). 장애물/시설/기타는 정보성 → 저촉 아님.
const RESTRICTION_CATEGORIES = new Set(['prohibited', 'restricted', 'danger', 'firing'])

// items: /api/notam items. ctx: { axis, etd, eta, cruiseAltitudeFt, airports:[{role,icao}] }.
// 포함 규칙: 발효중(시간창 겹침) AND (경로가 폴리곤 통과 OR location이 출/도착/교체 공항).
//   - 목적지 공항 NOTAM(예: 목적지 크레인)은 직선 VFR 경로가 폴리곤을 안 지나도 반드시 노출 —
//     공항경보(buildAirportWarningHazards)와 동일 원칙. scope:'fir'만 제외.
// 반환: { routeNotams(사실 나열, 정렬됨), routeConflicts(공역제한∩발효중∩경로 통과) }.
export function matchRouteNotams(items, ctx) {
  const roleByIcao = new Map((ctx.airports ?? []).map((a) => [a.icao, a.role]))
  const routeNotams = []
  for (const it of (items ?? [])) {
    if (it?.scope === 'fir') continue // 전국 스코프는 경로 매칭에서 제외(무의미한 전량 매칭)
    const flightTimeKnown = Number.isFinite(Date.parse(ctx.etd)) && Number.isFinite(Date.parse(ctx.eta))
    const validityKnown = Number.isFinite(Date.parse(it.valid_from)) && Number.isFinite(Date.parse(it.valid_to))
    const timeStatus = !flightTimeKnown ? 'not_provided' : !validityKnown ? 'unavailable' : 'matched'
    if (timeStatus === 'matched' && !timeWindowsOverlap(ctx.etd, ctx.eta, it.valid_from, it.valid_to)) continue
    // 회랑(선+폭)은 버퍼 판정으로, 면은 기존 판정으로.
    const interval = !it.geometry ? { entered: false }
      : it.bufferNm != null && it.geometry.type === 'LineString'
        ? routeCorridorInGeometry(ctx.axis, it.geometry, it.bufferNm)
        : routeIntervalInGeometry(ctx.axis, it.geometry)
    // 위치를 못 정했으면 저촉으로 단정하지 않되 목록에서 빼지도 않는다(정책: 상태와 이유를 반환).
    const positionStatus = it.geometry ? 'resolved' : 'unresolved'
    const airportRole = roleByIcao.get(it.location) || null // 출/도착/교체 공항의 NOTAM인가
    if (!interval.entered && !airportRole && positionStatus === 'resolved') continue // 경로도 안 걸리고 대상 공항도 아니면 제외(위치 불명은 예외)
    const bandFt = notamBandToFt(it.altitude)
    let encounter = 'nearby'
    let verticalKnown = false
    if (interval.entered) {
      ({ encounter, verticalKnown } = classifyEncounter(
        { startNm: interval.startNm, endNm: interval.endNm, bandFt },
        { totalDistanceNm: ctx.axis?.totalDistanceNm, cruiseAltitudeFt: ctx.cruiseAltitudeFt },
      ))
    }
    // 고도 통과: 밴드 미상이면 보수적으로 통과 간주(under-alarm 금지, spec 안전 규칙).
    const passesAltitude = !verticalKnown || encounter === 'on'
    // 저촉 = 공역제한 계열 ∩ 발효중 ∩ 경로가 폴리곤을 계획고도에서 통과(경로 교차가 있어야 함).
    const comparisonStatus = timeStatus === 'matched' && verticalKnown ? 'warn' : 'undetermined'
    const conflict = positionStatus === 'resolved' && comparisonStatus === 'warn'
      && RESTRICTION_CATEGORIES.has(it.category) && interval.entered && passesAltitude
    routeNotams.push({
      id: it.id,
      category: it.category,
      summary: it.summary,
      operational: it.operational || null,
      rawText: it.rawText || it.summary || '', // 브리핑 행에서 '원문 보기' 펼침용
      altitude: it.altitude,
      validFrom: it.valid_from,
      validTo: it.valid_to,
      scheduleText: it.schedule_text || null, // D) 시간대 — 브리핑 목록도 발효 중/시간대 밖을 가르려면 필요

      onRoute: interval.entered,
      airportRole,                                  // 'departure'|'arrival'|'alternate'|null
      airportIcao: airportRole ? it.location : null,
      routeIntervalNm: interval.entered ? { startNm: interval.startNm, endNm: interval.endNm } : null,
      bandFt,
      verticalKnown,
      activeAtEtd: timeStatus === 'matched' && Date.parse(it.valid_from) <= Date.parse(ctx.etd),
      timeStatus,
      comparisonStatus,
      conflict,
      positionStatus,
      geometrySource: it.geometrySource ?? null,
      approximated: it.approximated ?? false,
    })
  }
  // 정렬: 발효중 먼저 → 경로교차(진입거리순) → 공항매칭(진입거리 없음, 뒤로).
  const entryNm = (n) => (n.routeIntervalNm ? n.routeIntervalNm.startNm : Number.POSITIVE_INFINITY)
  const sortRank = (n) => n.activeAtEtd ? 0 : n.comparisonStatus === 'warn' ? 1 : 2
  routeNotams.sort((a, b) =>
    (sortRank(a) - sortRank(b)) ||
    (entryNm(a) - entryNm(b)))
  const routeConflicts = routeNotams.filter((n) => n.conflict)
  return { routeNotams, routeConflicts }
}

export default { notamBandToFt, matchRouteNotams }
