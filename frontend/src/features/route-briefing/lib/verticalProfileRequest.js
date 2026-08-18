export function buildProcedurePayload(procedure, type) {
  if (!procedure) return null
  return {
    id: procedure.id ?? procedure.name ?? null,
    type,
    fixes: (procedure.fixes ?? []).map((fix) => ({
      id: fix.id,
      lon: fix.lon ?? fix.coordinates?.lon ?? null,
      lat: fix.lat ?? fix.coordinates?.lat ?? null,
      legDistanceNm: fix.legDistanceNm ?? null,
      altitude: fix.altitude ?? null,
    })),
  }
}

export function buildProcedureContextPayload({ routeResult, selectedSid, selectedStar, selectedIap }) {
  if (routeResult?.flightRule !== 'IFR') return null
  return {
    entryFix: routeResult.entryFix ?? null,
    exitFix: routeResult.exitFix ?? null,
    procedures: [
      buildProcedurePayload(selectedSid, 'SID'),
      buildProcedurePayload(selectedStar, 'STAR'),
      buildProcedurePayload(selectedIap, 'IAP'),
    ].filter(Boolean),
  }
}

function stableMarkerId(marker, occurrence) {
  if (marker?.id) return String(marker.id)
  const label = String(marker?.label ?? '').trim().toUpperCase()
  const kind = String(marker?.kind ?? 'FIX').trim().toUpperCase()
  const lon = Number(marker?.lon)
  const lat = Number(marker?.lat)
  if (!label || !Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return `marker:${kind}:${label}:${lon.toFixed(6)}:${lat.toFixed(6)}:${occurrence}`
}

function withStableMarkerIds(markers) {
  const occurrences = new Map()
  return markers.map((marker) => {
    const label = String(marker?.label ?? '').trim().toUpperCase()
    const occurrence = occurrences.get(label) ?? 0
    occurrences.set(label, occurrence + 1)
    const id = stableMarkerId(marker, occurrence)
    return id ? { ...marker, id } : marker
  })
}

export function buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints }) {
  if (!routeResult) return []
  // 저장분에서 불러온 경로는 마커를 이미 들고 있다 — 다시 만들면 displaySequence가 없어
  // 빈 배열이 되고, NAVLOG의 공항 줄과 연직단면도의 경유점 이름이 사라진다.
  if (routeResult.routeMarkers?.length) return withStableMarkerIds(routeResult.routeMarkers)

  if (routeResult.flightRule === 'VFR') {
    return withStableMarkerIds((vfrWaypoints ?? []).map((wp) => ({
      label: wp.id,
      lon: wp.lon,
      lat: wp.lat,
      kind: wp.fixed ? 'AIRPORT' : 'WAYPOINT',
      // 공표된 픽스인지 지도에서 찍은 점인지. 저장분에서 경유점을 복원할 때 이 구분이 없으면
      // 전부 찍은 점으로 되살아난다(백엔드는 이 필드를 쓰지 않는다).
      named: Boolean(wp.named),
    })))
  }

  const baseLine = routeResult.previewGeojson?.features?.find((feature) => feature.properties.role === 'route-preview-line')
  const baseCoordinates = baseLine?.geometry?.coordinates ?? []

  // 수동 IFR 경로는 항로를 따라 중간 좌표가 추가된 선을 미리보기로 쓴다. 이 선의 인덱스를
  // displaySequence에 맞추면 항로 ID를 제외한 뒤에도 마커가 한 칸씩 밀린다. 시간 레일은
  // 사용자가 지정한 경유점 좌표를 기준으로 해야 하므로, 그 좌표가 있으면 이를 우선한다.
  const manualPoints = routeResult.manualRoute?.points ?? []
  const departureCoordinate = baseCoordinates[0]
  const arrivalCoordinate = baseCoordinates.at(-1)
  if (manualPoints.length > 0 && departureCoordinate && arrivalCoordinate) {
    const intermediateMarkers = manualPoints
      .map((point) => {
        const [lon, lat] = point.coordinates ?? []
        if (!point.label || !Number.isFinite(lon) || !Number.isFinite(lat)) return null
        return { label: point.label, lon, lat, kind: 'FIX' }
      })
      .filter(Boolean)

    if (intermediateMarkers.length === manualPoints.length) {
      const labels = routeResult.displaySequence ?? []
      return withStableMarkerIds([
        { label: labels[0] ?? routeResult.departureAirport, lon: departureCoordinate[0], lat: departureCoordinate[1], kind: 'AIRPORT' },
        ...intermediateMarkers,
        { label: labels.at(-1) ?? routeResult.arrivalAirport, lon: arrivalCoordinate[0], lat: arrivalCoordinate[1], kind: 'AIRPORT' },
      ])
    }
  }

  const routeIds = new Set(routeResult.routeIds ?? [])
  const labels = (routeResult.displaySequence ?? []).filter((item) => !routeIds.has(item))

  return withStableMarkerIds(labels
    .map((label, index) => {
      const coordinate = baseCoordinates[index]
      if (!coordinate) return null
      return {
        label,
        lon: coordinate[0],
        lat: coordinate[1],
        kind: index === 0 || index === labels.length - 1 ? 'AIRPORT' : 'FIX',
      }
    })
    .filter(Boolean))
}

export function buildCrossSectionRequest({ routeGeometry, etd, tmfc, hf, routeMarkers, nwpTimeSelection }) {
  const hasForecastHour = hf !== '' && hf != null && Number.isFinite(Number(hf))
  return {
    routeGeometry,
    etd,
    ...(tmfc ? { tmfc } : {}),
    ...(hasForecastHour ? { hf: Number(hf) } : {}),
    ...(Array.isArray(routeMarkers) ? { routeMarkers } : {}),
    ...(nwpTimeSelection ? { nwpTimeSelection } : {}),
  }
}

export function buildVerticalProfileRequest({
  routeGeometry,
  routeModel = null,
  routeResult,
  selectedSid,
  selectedStar,
  selectedIap,
  vfrWaypoints,
  plannedCruiseAltitudeFt,
  candidateCruiseAltitudesFt = [],
}) {
  return {
    flightRule: routeResult?.flightRule,
    routeGeometry,
    routeModel: routeModel ?? buildCommonRouteModel({ routeGeometry, routeResult }),
    plannedCruiseAltitudeFt,
    candidateCruiseAltitudesFt,
    procedureContext: buildProcedureContextPayload({ routeResult, selectedSid, selectedStar, selectedIap }),
    vfrWaypoints: routeResult?.flightRule === 'VFR' ? vfrWaypoints : undefined,
    routeMarkers: buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints }),
    sampleSpacingMeters: 250,
  }
}
import { buildCommonRouteModel } from '../../../../../shared/route-model.js'
