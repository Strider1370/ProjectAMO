// shared/*는 features/*를 import 못 하므로(§Architecture), airport-panel formatters의
// fmtKst를 여기 인라인한다. AMOS 관측시각은 대개 compact(YYYYMMDDHHMM)라 이 fallback은 드물게만 탄다.
function fmtKst(iso, tz = 'KST') {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (tz === 'UTC') return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    const kst = new Date(d.getTime() + 9 * 3600 * 1000)
    return kst.toISOString().replace('T', ' ').slice(0, 16) + ' KST'
  } catch { return iso }
}

const KT_PER_MS = 1.943844
const HPA_TO_INHG = 0.0295299830714

function isFiniteNumber(value) {
  return Number.isFinite(value)
}

function normalizeDegrees(value) {
  if (!isFiniteNumber(value)) return null
  return ((value % 360) + 360) % 360
}

function formatOneDecimal(value) {
  return isFiniteNumber(value) ? value.toFixed(1) : '-'
}

function formatInteger(value) {
  return isFiniteNumber(value) ? String(Math.round(value)) : '-'
}

export function formatAmosValue(value, suffix = '') {
  return isFiniteNumber(value) ? `${value}${suffix}` : '-'
}

export function formatMsToKt(value) {
  return isFiniteNumber(value) ? formatOneDecimal(value * KT_PER_MS) : '-'
}

export function formatAmosTime(value, tz = 'KST') {
  if (!value) return '관측 시간 없음'
  const compact = String(value).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (compact) {
    if (tz === 'UTC') {
      const pad = (n) => String(n).padStart(2, '0')
      const utcMs = Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]), Number(compact[4]), Number(compact[5])) - 9 * 3600 * 1000
      const d = new Date(utcMs)
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
    }
    return `${compact[1]}-${compact[2]}-${compact[3]} ${compact[4]}:${compact[5]} KST`
  }
  return fmtKst(value, tz)
}

const AMOS_REPRESENTATIVE_RUNWAYS = {
  RKSI: ['15L', '33R'],
  RKSS: ['14R', '32L'],
  RKPC: ['07', '25'],
  RKJB: ['01', '19'],
  RKNY: ['15', '33'],
  RKPU: ['18', '36'],
  RKJY: ['17', '35'],
}

export function enrichAmosRunways(amos) {
  const runways = Array.isArray(amos?.runways) ? amos.runways : []
  return [0, 1].map((index) => ({
    ...(runways[index] || {}),
    runway: runways[index]?.side || (index === 0 ? 'L' : 'R'),
  }))
}

function runwayNumberFromHeading(heading) {
  if (!isFiniteNumber(heading)) return null
  const number = Math.round((((heading % 360) + 360) % 360) / 10) || 36
  return String(number).padStart(2, '0')
}

export function runwayLabelsFromAirport(airportMeta) {
  const mapped = AMOS_REPRESENTATIVE_RUNWAYS[airportMeta?.icao]
  if (mapped) return mapped
  const first = runwayNumberFromHeading(airportMeta?.runway_hdg)
  const second = isFiniteNumber(airportMeta?.runway_hdg)
    ? runwayNumberFromHeading((airportMeta.runway_hdg + 180) % 360)
    : null
  return [first || 'RWY 1', second || 'RWY 2']
}

export function runwayHeadingFromLabel(label) {
  if (!label) return null
  const match = String(label).match(/^(\d{2})/)
  if (!match) return null
  const value = Number(match[1])
  if (!isFiniteNumber(value)) return null
  return (value % 36) * 10 || 360
}

export function pickActiveRunwayLabel(labels, wind) {
  if (!Array.isArray(labels) || labels.length === 0) return null
  if (!isFiniteNumber(wind?.direction)) return labels[0] || null
  const speed = isFiniteNumber(wind?.speed) ? wind.speed : 0
  let bestLabel = labels[0] || null
  let bestHeadwind = -Infinity
  for (const label of labels) {
    const heading = runwayHeadingFromLabel(label)
    if (!isFiniteNumber(heading)) continue
    const angleRad = ((wind.direction - heading) * Math.PI) / 180
    const headwind = Math.cos(angleRad) * speed
    if (headwind > bestHeadwind) {
      bestHeadwind = headwind
      bestLabel = label
    }
  }
  return bestLabel
}

export function formatInHgFromHpa(value) {
  return isFiniteNumber(value) ? (value * HPA_TO_INHG).toFixed(2) : '-'
}

function formatRvrValue(value) {
  if (!isFiniteNumber(value)) return '-'
  return value >= 2000 ? 'P2000' : String(Math.round(value))
}

function formatMorValue(value) {
  return isFiniteNumber(value) ? String(Math.round(value)) : '-'
}

function isRvrGood(value) {
  return isFiniteNumber(value) && value >= 2000
}

function buildWindRows(source) {
  return [
    {
      speedLabel: '평균풍속(kt)',
      speedValue: formatMsToKt(source?.wind_speed),
      directionLabel: '평균풍향(°)',
      directionValue: formatInteger(source?.wind_direction),
    },
    {
      speedLabel: '최소풍속(kt)',
      speedValue: formatMsToKt(source?.wind_speed_min),
      directionLabel: '최소풍향(°)',
      directionValue: formatInteger(source?.wind_direction_min),
    },
    {
      speedLabel: '최대풍속(kt)',
      speedValue: formatMsToKt(source?.wind_speed_max),
      directionLabel: '최대풍향(°)',
      directionValue: formatInteger(source?.wind_direction_max),
    },
  ]
}

function formatComponentValue(value) {
  return isFiniteNumber(value) ? String(Math.round(value)).padStart(2, '0') : '--'
}

function formatWindSummary(directionDeg, speedKt) {
  const direction = formatInteger(directionDeg)
  const speed = formatOneDecimal(speedKt)
  if (direction === '-' && speed === '-') return '-'
  return `${direction}° / ${speed}kt`
}

export function calculateRunwayWindComponent({ windDirectionDeg, windSpeedKt, runwayHeadingDeg }) {
  if (!isFiniteNumber(windDirectionDeg) || !isFiniteNumber(windSpeedKt) || !isFiniteNumber(runwayHeadingDeg)) {
    return { headTailLabel: '-', headTailKt: null, crossLabel: '-', crossKt: null }
  }

  const angleRad = ((windDirectionDeg - runwayHeadingDeg) * Math.PI) / 180
  const headwind = Math.cos(angleRad) * windSpeedKt
  const crosswind = Math.sin(angleRad) * windSpeedKt

  return {
    headTailLabel: headwind >= 0 ? 'H' : 'T',
    headTailKt: Math.abs(headwind),
    crossLabel: crosswind >= 0 ? 'R' : 'L',
    crossKt: Math.abs(crosswind),
  }
}

export function buildAmosConsoleModel(amos, metar, airportMeta, tz = 'KST') {
  const runways = enrichAmosRunways(amos)
  const runwayLabels = runwayLabelsFromAirport(airportMeta)
  const twoMinute = runways[0] || {}
  const tenMinute = runways[1] || {}
  const componentWindSource = tenMinute
  const windDirection = normalizeDegrees(componentWindSource.wind_direction)
  const windSpeedKt = isFiniteNumber(componentWindSource.wind_speed)
    ? componentWindSource.wind_speed * KT_PER_MS
    : null
  const activeRunwayLabel = pickActiveRunwayLabel(runwayLabels, {
    direction: windDirection ?? metar?.observation?.wind?.direction,
    speed: windSpeedKt ?? metar?.observation?.wind?.speed ?? 0,
  })
  const activeRunwayIndex = runwayLabels[1] === activeRunwayLabel ? 1 : 0
  const activeHeadingDeg = runwayHeadingFromLabel(activeRunwayLabel)
  const component = calculateRunwayWindComponent({
    windDirectionDeg: windDirection,
    windSpeedKt,
    runwayHeadingDeg: activeHeadingDeg,
  })
  const arcStartDeg = normalizeDegrees(componentWindSource.wind_direction_min)
  const arcEndDeg = normalizeDegrees(componentWindSource.wind_direction_max)
  const rf = amos?.daily_rainfall
  const obs = amos?.observation || {}
  const observedTime = rf?.observed_tm_kst || obs.observed_tm_kst

  return {
    observedTimeLabel: formatAmosTime(observedTime, tz),
    runwayLabels,
    activeRunwayLabel,
    inactiveRunwayLabel: runwayLabels[activeRunwayIndex === 1 ? 0 : 1] || null,
    activeRunwayIndex,
    activeHeadingDeg,
    dial: {
      runwayRotationDeg: isFiniteNumber(activeHeadingDeg) ? activeHeadingDeg - 90 : 0,
      windFromDeg: windDirection,
      arcStartDeg,
      arcEndDeg,
      arcWrapsNorth: isFiniteNumber(arcStartDeg) && isFiniteNumber(arcEndDeg) && arcEndDeg < arcStartDeg,
      headTailLabel: component.headTailLabel,
      headTailValue: formatComponentValue(component.headTailKt),
      crossLabel: component.crossLabel,
      crossValue: formatComponentValue(component.crossKt),
    },
    prioritySummary: [
      { key: 'activeRunway', label: '사용 활주로', value: `${activeRunwayLabel || '-'} IN USE` },
      { key: 'headTail', label: 'H/T-WS(kt)', value: `${component.headTailLabel} ${formatComponentValue(component.headTailKt)}` },
      { key: 'crosswind', label: 'CROSS-WS(kt)', value: `${component.crossLabel} ${formatComponentValue(component.crossKt)}` },
      { key: 'tenMinuteWind', label: '10분 평균풍', value: formatWindSummary(windDirection, windSpeedKt) },
    ],
    windGroups: [
      { key: 'twoMinute', label: '2분', rows: buildWindRows(twoMinute) },
      { key: 'tenMinute', label: '10분', rows: buildWindRows(tenMinute) },
    ],
    visibilityRows: runwayLabels.map((label, index) => {
      const runway = runways[index] || {}
      return {
        label: `RWY ${label} RVR(m) / MOR(m)`,
        rvrValue: formatRvrValue(runway.rvr_m),
        morValue: formatMorValue(runway.visibility_m),
        isRvrGood: isRvrGood(runway.rvr_m),
      }
    }),
    commonCells: [
      { label: '운고(ft)', value: amos?.weather?.cloud_min_m == null ? 'NCD' : formatInteger(amos.weather.cloud_min_m) },
      { label: 'QNH(hPa)', value: formatInteger(amos?.pressure?.qnh_hpa) },
      { label: 'QNH(inHg)', value: formatInHgFromHpa(amos?.pressure?.qnh_hpa) },
      { label: '기온(°C)', value: formatOneDecimal(amos?.weather?.temperature_c) },
      { label: '이슬점(°C)', value: formatOneDecimal(amos?.weather?.dewpoint_c) },
      { label: '일강수량(mm)', value: formatOneDecimal(amos?.daily_rainfall?.mm) },
    ],
  }
}
