// 저장 스냅샷 → 브리핑 요청 입력. 순수 함수 — 네트워크·항법데이터 조회 없음.
// 이 모듈이 "재검색하지 않는다"의 계약이다: 여기서 나오는 값만으로 브리핑이 성립해야 한다.
// 해외 IFR은 절차 데이터가 없어 재검색이 `No RNAV route path`로 깨진다. 그 경로를 아예 타지 않기 위한 것.
import { normalizeRouteSnapshot } from './routeStore.js'
import { computeEtaIso } from './etaCalc.js'

const EARTH_RADIUS_NM = 3440.065

function legNm([lon1, lat1], [lon2, lat2]) {
  const toRad = (value) => value * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a))
}

// 저장된 선의 총 거리. 재검색 결과의 totalDistanceNm을 대신한다.
export function geometryDistanceNm(routeGeometry) {
  const coordinates = routeGeometry?.coordinates ?? []
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) total += legNm(coordinates[index - 1], coordinates[index])
  return Number(total.toFixed(2))
}

const isoOf = (value) => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().replace('.000Z', 'Z') : null)

// routeModel이 없거나 낡은 저장분이어도 브리핑 자체는 성립해야 한다 — 구간표만 빈다.
const EMPTY_MODEL = {
  schemaVersion: 1,
  enRouteSegments: [],
  enRouteRange: null,
  terminalRanges: null,
  graphConnectionStatus: 'unavailable',
}

export function buildSavedBriefingInputs(rawSaved) {
  const saved = normalizeRouteSnapshot(rawSaved ?? {})
  const form = saved.base?.routeForm ?? saved.routeForm ?? {}
  const routeGeometry = saved.routeGeometry ?? saved.enrouteGeometry ?? null
  if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) return { ok: false, reason: 'no_geometry' }

  const etd = isoOf(saved.etd)
  const distanceNm = geometryDistanceNm(routeGeometry)
  const eta = isoOf(saved.eta) ?? isoOf(computeEtaIso(etd, distanceNm, saved.tasKt)) ?? null

  return {
    ok: true,
    flightRule: form.flightRule ?? 'IFR',
    departureAirport: form.departureAirport ?? null,
    arrivalAirport: form.arrivalAirport ?? null,
    // procedureContext로 백엔드에 넘어가 연직단면도의 기준 픽스 이름표가 된다.
    entryFix: form.entryFix ?? null,
    exitFix: form.exitFix ?? null,
    alternateAirport: saved.alternateAirport || null,
    routeGeometry,
    // 브리핑 요청은 routeModel 안에 routeGeometry가 있는 모양을 기대한다(shared/route-model.js).
    // 저장 때 중복을 피해 뺐으므로 여기서 다시 끼운다.
    routeModel: { ...EMPTY_MODEL, ...(saved.routeModel ?? {}), routeGeometry },
    routeMarkers: saved.routeMarkers ?? [],
    etd,
    eta,
    cruiseAltitudeFt: Number(saved.cruiseAltitudeFt) || null,
    tasKt: saved.tasKt ?? null,
    distanceNm,
    routeString: saved.base?.routeString ?? '',
    enroute: saved.base?.enroute ?? null,
    procedureIds: saved.base?.procedureIds ?? {},
    nwpTimeSelection: saved.nwpTimeSelection ?? null,
  }
}

// 지도·경로 패널이 그리는 데 쓰는 최소 routeResult. 재검색 결과를 대신한다 —
// 이게 없으면 지도는 routeResult가 비어 출발·도착 직선만 그린다(저장한 경로가 아니라).
// segments/navpointIds는 없다: NAVLOG는 백엔드가 routeModel로 만들고, 지도는 이 선만 필요하다.
export function buildSavedRouteResult(inputs) {
  if (!inputs?.ok) return null
  return {
    flightRule: inputs.flightRule,
    departureAirport: inputs.departureAirport,
    arrivalAirport: inputs.arrivalAirport,
    entryFix: inputs.entryFix,
    exitFix: inputs.exitFix,
    totalDistanceNm: inputs.distanceNm,
    distanceNm: inputs.distanceNm,
    // 저장된 구간 모델을 실어 보낸다. 이게 없으면 브리핑을 만들 때 routeResult로부터 모델을
    // 다시 계산하는데, 최소 routeResult엔 segments가 없어 NAVLOG 순항 구간이 통째로 빈다.
    routeModel: inputs.routeModel,
    // 마커도 같은 이유다. 다시 만들면 displaySequence가 없어 빈 배열이 되고, 그러면
    // NAVLOG의 출발·도착 공항 줄과 연직단면도 아래 경유점 이름이 통째로 사라진다.
    routeMarkers: inputs.routeMarkers,
    // VFR 경유점은 manualRoute.points에서 복원된다(buildVfrWaypointsFromRouteResult).
    // 양 끝 공항은 경로선의 처음·끝 좌표에서 따로 붙으므로 여기선 뺀다.
    ...(inputs.flightRule === 'VFR' ? {
      manualRoute: {
        points: (inputs.routeMarkers ?? [])
          .filter((marker) => marker.kind !== 'AIRPORT')
          .map((marker) => ({
            label: marker.label,
            coordinates: [marker.lon, marker.lat],
            kind: marker.named ? 'published-fix' : 'user',
          })),
      },
    } : {}),
    previewGeojson: {
      type: 'FeatureCollection',
      features: [
        // inlineProcedureGeometry: 저장된 선에 이미 SID/STAR가 반영돼 있다는 표시.
        // 이게 없으면 표시용으로 고른 절차를 지도가 한 번 더 얹어 같은 구간이 두 번 그려진다
        // (routePreview.js의 augmentRouteWithProcedures / trimRouteLineForProcedures가 이 플래그를 보고 비켜준다).
        { type: 'Feature', properties: { role: 'route-preview-line', inlineProcedureGeometry: true }, geometry: inputs.routeGeometry },
        // 경유점 원과 이름표. 지도의 route-preview-point 레이어가 label을 읽어 글자를 찍는다.
        ...(inputs.routeMarkers ?? []).map((marker, index) => ({
          type: 'Feature',
          properties: { role: 'route-preview-point', label: marker.label, sequence: index + 1 },
          geometry: { type: 'Point', coordinates: [marker.lon, marker.lat] },
        })),
      ],
    },
  }
}

export default { buildSavedBriefingInputs, buildSavedRouteResult, geometryDistanceNm }
