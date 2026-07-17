import { KNOWN_AIRPORTS } from './procedureData.js'
import {
  chooseIapKeyForRunway,
  filterProceduresByRunway,
  getWindDirection,
  pickBestRunwayGroup,
} from './routeBriefingModel.js'

// IFR 자동 추천 결정: 출발/도착 절차(SID/STAR/IAP)와 진입·이탈 fix 후보를 만들어
// SID 구간 포함 총거리가 최소인 조합을 고른다. 이전엔 useRouteBriefing.js의 useEffect
// 130줄 클로저에 박혀 무테스트였다 — 여기로 추출해 순수·주입식으로 만들어 테스트 가능하게 한다.
//
// 비동기 I/O(loadOverseasLinks·buildBriefingRoute)는 주입한다(네트워크 없이 테스트).
// 순수 헬퍼(pickBestRunwayGroup 등)는 직접 import. 준비 안 됐거나 후보 전멸이면 null.
// React 수명주기 가드(activePanel·autoRecommendRequested·cancelled)는 호출자(effect)가 소유.
export async function recommendProcedures({
  routeForm,
  sidOptions,
  starOptions,
  iapData,
  metarData,
  isFirInMode,
  isFirExitMode,
  effectiveRouteType,
  loadOverseasLinks,
  buildBriefingRoute,
  includeAll = false,
}) {
  const isDomesticDeparture = KNOWN_AIRPORTS.includes(routeForm.departureAirport)
  const isDomesticArrival = KNOWN_AIRPORTS.includes(routeForm.arrivalAirport)
  const isOverseasArrival = !isDomesticArrival && !isFirExitMode && routeForm.arrivalAirport
  const isOverseasDeparture = !isDomesticDeparture && !isFirInMode && routeForm.departureAirport

  if (isFirInMode && !routeForm.entryFix) return null
  if (isFirExitMode && !routeForm.exitFix) return null

  // 출발/도착이 각각 준비됐는지 통합 체크.
  // 출발: FIR진입(수동 entryFix) / 해외(최근접지점) / 국내(SID) 중 하나.
  // 도착: FIR이탈(수동 exitFix) / 해외(최근접지점) / 국내(STAR+IAP) 중 하나.
  const departureReady = isFirInMode || isOverseasDeparture || (isDomesticDeparture && sidOptions.length > 0)
  const arrivalReady = isFirExitMode || isOverseasArrival || (isDomesticArrival && starOptions.length > 0 && !!iapData)
  if (!departureReady || !arrivalReady) return null

  // 출발 후보: FIR진입(수동 entryFix) / 해외(최근접지점) / 국내(SID).
  const buildDepartureCandidates = async () => {
    if (isFirInMode) return [{ sid: null, entryFix: routeForm.entryFix }]
    if (isOverseasDeparture) {
      const links = await loadOverseasLinks()
      const link = links[routeForm.departureAirport]
      // 최근접 1개만 쓰면 목적지 반대편 fix로 진입해 되돌아가는 경로가 될 수 있음.
      // 근접 후보 전부를 넘겨 아래 총거리 순위가 방향까지 고려해 진입 fix를 고르게 한다.
      if (!link?.nearbyFixes?.length) return []
      return link.nearbyFixes.map((nf) => ({ sid: null, entryFix: nf.fix }))
    }
    return filterProceduresByRunway(
      sidOptions,
      pickBestRunwayGroup(
        sidOptions.flatMap((proc) => proc.runways ?? []),
        getWindDirection(metarData, routeForm.departureAirport),
      ),
    ).map((sid) => ({ sid, entryFix: sid.enrouteFix ?? '' }))
  }

  // Handle arrival: domestic with STAR/IAP, FIR exit with manual fix, or overseas with nearestFix
  const buildArrivalCandidates = async () => {
    if (isFirExitMode) {
      return [{ star: null, iapKey: null, exitFix: routeForm.exitFix }]
    }
    if (isOverseasArrival) {
      const links = await loadOverseasLinks()
      const link = links[routeForm.arrivalAirport]
      // 이탈도 마찬가지 — 근접 후보 전부를 넘겨 총거리 최소인 이탈 fix를 고르게 한다.
      if (!link?.nearbyFixes?.length) return []
      return link.nearbyFixes.map((nf) => ({ star: null, iapKey: null, exitFix: nf.fix }))
    }
    // Domestic arrival
    const arrivalRunwayGroup = pickBestRunwayGroup(
      starOptions
        .map((star) => iapData?.starToIapCandidates?.[star.id]?.runways ?? [])
        .flat(),
      getWindDirection(metarData, routeForm.arrivalAirport),
    )
    return filterProceduresByRunway(
      starOptions
        .map((star) => {
          const entry = iapData.starToIapCandidates?.[star.id]
          return { star, entry, runways: entry?.runways ?? [] }
        })
        .filter(({ entry }) => entry),
      arrivalRunwayGroup,
    ).map(({ star, entry }) => ({
      star,
      iapKey: chooseIapKeyForRunway(entry, iapData, arrivalRunwayGroup),
      exitFix: star.startFix ?? '',
    }))
  }

  const [departureCandidates, arrivalCandidates] = await Promise.all([
    buildDepartureCandidates(),
    buildArrivalCandidates(),
  ])

  const results = await Promise.all(
    departureCandidates.flatMap(({ sid, entryFix }) =>
      arrivalCandidates.map(async ({ star, iapKey, exitFix }) => {
        try {
          const result = await buildBriefingRoute({
            departureAirport: routeForm.departureAirport,
            arrivalAirport: routeForm.arrivalAirport,
            entryFix,
            exitFix,
            routeType: effectiveRouteType,
          })
          return {
            sid,
            star,
            iapKey,
            entryFix,
            exitFix,
            routeResult: result,
            // SID 구간까지 포함한 총거리로 순위(항로 구간만 보면 서쪽 진입지점 등 엉뚱한 SID 선택됨)
            distanceNm: Number(result?.totalDistanceNm ?? result?.distanceNm) || Number.POSITIVE_INFINITY,
          }
        } catch {
          return null
        }
      }),
    ),
  )

  const valid = results.filter(Boolean).sort((a, b) => a.distanceNm - b.distanceNm)
  if (includeAll) return valid
  const fallbackSid = departureCandidates[0] ?? null
  const fallbackArrival = arrivalCandidates[0] ?? null
  const best = valid[0] ?? (fallbackSid && fallbackArrival
    ? {
        sid: fallbackSid.sid ?? null,
        star: fallbackArrival.star,
        iapKey: fallbackArrival.iapKey,
        entryFix: fallbackSid.entryFix,
        exitFix: fallbackArrival.exitFix,
      }
    : null)

  return best
}

export default { recommendProcedures }
