// 지도형 브리핑의 위험 막대 자료. 화면은 이 값만 그리고 판정은 여기서 한다.
// 줄 = 현상(난류·착빙·대류 + 해당 시 태풍·시정/운고). 한 줄 안에
//   model  : 수치예보가 내 비행 고도(상승·순항·강하 프로파일)에서 MOD 이상인 구간
//   frames : 예보관 발표(SIGMET·AIRMET·태풍)가 경로에 걸린 구간. mine = 내 고도와 겹침
const ROWS = [
  { key: 'turbulence', label: '난류', always: true },
  { key: 'icing', label: '착빙', always: true },
  { key: 'convection', label: '대류', always: true },
  { key: 'typhoon', label: '태풍', always: false },
  { key: 'visibility', label: '시정·운고', always: false },
]

const ROW_BY_CODE = {
  SEV_TURB: 'turbulence', MOD_TURB: 'turbulence', MTW: 'turbulence', LLWS: 'turbulence',
  SEV_ICE: 'icing', MOD_ICE: 'icing',
  TS: 'convection', EMBD_TS: 'convection', OBSC_TS: 'convection', FRQ_TS: 'convection', SQL_TS: 'convection',
  ISOL_TS: 'convection', OCNL_TS: 'convection', CB: 'convection', GR: 'convection',
  TC: 'typhoon',
  SFC_VIS: 'visibility', SFC_WIND: 'visibility', IFR: 'visibility', MT_OBSC: 'visibility',
}

function rowForCode(code) {
  const key = String(code ?? '').toUpperCase()
  if (ROW_BY_CODE[key]) return ROW_BY_CODE[key]
  if (key.includes('CLD')) return 'visibility' // BKN/OVC CLD 운고 AIRMET
  return null // VA 등 막대에 넣지 않는 현상
}

const MODEL_LEVEL = { '중': 'MOD', '심': 'SEV' }
const ALTITUDE_TOLERANCE_FT = 100

function altitudeAt(points, distanceNm) {
  if (!points.length) return null
  if (distanceNm <= points[0].distanceNm) return points[0].altitudeFt
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1], b = points[index]
    if (distanceNm > b.distanceNm) continue
    const span = b.distanceNm - a.distanceNm
    return span > 0 ? a.altitudeFt + (b.altitudeFt - a.altitudeFt) * ((distanceNm - a.distanceNm) / span) : b.altitudeFt
  }
  return points.at(-1).altitudeFt
}

function phaseFor({ points, todNm, cruiseAltitudeFt }, startNm, endNm) {
  const from = altitudeAt(points, startNm), to = altitudeAt(points, endNm)
  if (from == null || to == null) return { altitudeFt: null, phase: 'cruise' }
  const altitudeFt = { from: Math.round(from), to: Math.round(to) }
  // 단계는 구간 가운데의 고도로 정한다(상승 끝에서 시작해 순항으로 이어지는 구간은 순항).
  const mid = (startNm + endNm) / 2
  if (altitudeAt(points, mid) >= cruiseAltitudeFt - ALTITUDE_TOLERANCE_FT) return { altitudeFt, phase: 'cruise' }
  return { altitudeFt, phase: Number.isFinite(todNm) && mid >= todNm ? 'descent' : 'climb' }
}

// 구간 앞뒤 지점 이름. 이름 붙은 지점 사이가 아니면(예: 마지막 지점 뒤 접근 구간) 가장 가까운
// 앞 지점(TOD 포함)과 뒤 지점을 쓰고, 같은 이름이 되면 앞 지점을 하나 더 거슬러 간다.
function endpointNames(markers, startNm, endNm) {
  let fromIndex = -1
  markers.forEach((marker, index) => { if (marker.distanceNm <= startNm + 0.5) fromIndex = index })
  let toIndex = markers.findIndex((marker) => marker.distanceNm >= endNm - 0.5)
  if (toIndex < 0) toIndex = markers.length - 1
  if (fromIndex < 0) fromIndex = 0
  if (fromIndex >= 0 && toIndex >= 0 && markers[fromIndex]?.label === markers[toIndex]?.label && fromIndex > 0) fromIndex -= 1
  return { from: markers[fromIndex]?.label ?? null, to: markers[toIndex]?.label ?? null }
}

function passTime(etdMs, etaMs, totalNm, distanceNm) {
  if (!Number.isFinite(etdMs) || !Number.isFinite(etaMs) || !(totalNm > 0)) return null
  const ratio = Math.min(1, Math.max(0, distanceNm / totalNm))
  return new Date(etdMs + (etaMs - etdMs) * ratio).toISOString()
}

function placement(ctx, startNm, endNm) {
  return {
    startNm, endNm,
    ...endpointNames(ctx.markers, startNm, endNm),
    passFrom: passTime(ctx.etdMs, ctx.etaMs, ctx.totalNm, startNm),
    passTo: passTime(ctx.etdMs, ctx.etaMs, ctx.totalNm, endNm),
  }
}

// 같은 강도로 MERGE_GAP_NM 이내에 끊긴 구간은 한 막대로 합친다(샘플 경계로 1NM씩 갈라지던 것).
const MERGE_GAP_NM = 2
function mergeIntervals(intervals) {
  const out = []
  for (const iv of [...intervals].sort((a, b) => a.startNm - b.startNm)) {
    const last = out.at(-1)
    if (last && last.level === iv.level && iv.startNm - last.endNm <= MERGE_GAP_NM) last.endNm = Math.max(last.endNm, iv.endNm)
    else out.push({ ...iv })
  }
  return out
}

function modelSegments(ctx, intervals, { altitudeIndependent = false } = {}) {
  return mergeIntervals((intervals ?? []).filter((iv) => MODEL_LEVEL[iv.level])).map((iv) => ({
    level: MODEL_LEVEL[iv.level],
    ...placement(ctx, iv.startNm, iv.endNm),
    ...(altitudeIndependent ? { altitudeFt: null, phase: null } : phaseFor(ctx.profile, iv.startNm, iv.endNm)),
  }))
}

function frameFor(ctx, hazard) {
  const interval = hazard.routeIntervalNm
  if (!Number.isFinite(interval?.startNm) || !Number.isFinite(interval?.endNm)) return null
  return {
    source: hazard.source,
    sourceId: hazard.sourceId ?? null,
    overseas: Boolean(hazard.overseas),
    code: hazard.code ?? null,
    label: hazard.label ?? hazard.code ?? null,
    bandFt: hazard.bandFt ?? null,
    mine: hazard.encounter === 'on',
    validFrom: hazard.validFrom ?? null,
    validTo: hazard.validTo ?? null,
    ...placement(ctx, Math.round(interval.startNm), Math.round(interval.endNm)),
  }
}

// 패널 요약에 올릴 순위: 모델 SEV·SIGMET·태풍(내 고도) > 모델 MOD·AIRMET(내 고도).
function summaryRank(item) {
  if (item.kind === 'model') return item.level === 'SEV' ? 3 : 2
  return item.source === 'AIRMET' ? 2 : 3
}

function buildSummary(rows) {
  const candidates = rows.flatMap((row) => [
    ...row.model.map((segment) => ({ ...segment, kind: 'model', row: row.key, label: row.label })),
    ...row.frames.filter((frame) => frame.mine).map((frame) => ({ ...frame, kind: 'frame', row: row.key, label: row.label, sourceLabel: frame.label, level: frame.source === 'AIRMET' ? 'MOD' : 'SEV' })),
  ])
  const unavailable = rows.filter((row) => ['turbulence', 'icing'].includes(row.key) && row.status === 'unavailable').map((row) => row.key)
  if (!candidates.length) return { status: unavailable.length ? 'unknown' : 'clear', top: null, unavailable }
  const top = candidates.reduce((best, item) => {
    const rank = summaryRank(item), bestRank = summaryRank(best)
    return rank > bestRank || (rank === bestRank && item.startNm < best.startNm) ? item : best
  })
  return { status: 'hazard', top, unavailable }
}

export function buildHazardRibbon({ enrouteModel = null, convection = null, hazards = [], flightPlanProfile = null, markers = [], cruiseAltitudeFt, totalDistanceNm, etd, eta } = {}) {
  const points = (flightPlanProfile?.points ?? [])
    .filter((point) => Number.isFinite(point?.distanceNm) && Number.isFinite(point?.altitudeFt))
    .map(({ distanceNm, altitudeFt }) => ({ distanceNm, altitudeFt }))
  const todNm = flightPlanProfile?.tod?.distanceNm ?? null
  const namedMarkers = [
    ...markers.filter((marker) => marker?.label && Number.isFinite(marker.distanceNm)),
    ...(Number.isFinite(todNm) ? [{ label: 'TOD', distanceNm: todNm }] : []),
  ].sort((a, b) => a.distanceNm - b.distanceNm)
  const ctx = {
    markers: namedMarkers,
    profile: { points, todNm, cruiseAltitudeFt: Number(cruiseAltitudeFt) || 0 },
    etdMs: Date.parse(etd),
    etaMs: Date.parse(eta),
    totalNm: Number(totalDistanceNm) || 0,
  }

  const elements = new Map((enrouteModel?.elements ?? []).map((element) => [element.kind, element]))
  const modelByRow = {
    turbulence: { status: enrouteModel?.status?.turbulence ?? 'unavailable', segments: modelSegments(ctx, elements.get('turbulence')?.intervals) },
    icing: { status: enrouteModel?.status?.icing ?? 'unavailable', segments: modelSegments(ctx, elements.get('icing')?.intervals) },
    convection: { status: convection?.status ?? 'unavailable', segments: modelSegments(ctx, convection?.intervals, { altitudeIndependent: true }) },
  }

  const framesByRow = new Map()
  for (const hazard of hazards) {
    if (hazard.airportScope) continue // 공항경보는 공항 카드 몫
    const row = rowForCode(hazard.code)
    const frame = row ? frameFor(ctx, hazard) : null
    if (!frame) continue
    if (!framesByRow.has(row)) framesByRow.set(row, [])
    framesByRow.get(row).push(frame)
  }

  const rows = ROWS
    .filter((row) => row.always || framesByRow.has(row.key))
    .map((row) => ({
      key: row.key,
      label: row.label,
      // 모델이 없는 줄(태풍·시정/운고)은 null — 화면이 "확인 불가"로 그리지 않게.
      status: modelByRow[row.key]?.status ?? null,
      model: modelByRow[row.key]?.segments ?? [],
      frames: (framesByRow.get(row.key) ?? []).sort((a, b) => a.startNm - b.startNm),
    }))

  return {
    totalDistanceNm: ctx.totalNm || null,
    windApplied: false,
    rows,
    summary: buildSummary(rows),
    runs: { ...(enrouteModel?.runs ?? {}), aci: convection?.run ?? null },
  }
}

export default { buildHazardRibbon }
