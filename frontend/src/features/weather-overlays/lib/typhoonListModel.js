import { assignTyphoonColors } from './typhoonColors.js'

// 목록 모델. 렌더와 분리해 두어야 JSX 변환 없이 테스트할 수 있다.

// 기상청 태풍정보 통보문 범례의 강도 구간. 최대풍속(m/s)에서 유도한다 — API가 강도를 주지 않는다.
const INTENSITY_STEPS = [
  { min: 54, label: '5' },
  { min: 44, label: '4' },
  { min: 33, label: '3' },
  { min: 25, label: '2' },
  { min: 17, label: '1' },
]

export function intensityOf(maxWindMs) {
  if (!Number.isFinite(maxWindMs)) return null
  // 17 m/s 미만은 태풍이 아니라 열대저압부다.
  return INTENSITY_STEPS.find((step) => maxWindMs >= step.min)?.label ?? 'TD'
}

export function windKmh(maxWindMs) {
  return Number.isFinite(maxWindMs) ? Math.round(maxWindMs * 3.6) : null
}

// "26일 03시" — 통보문과 같은 한국시각 표기.
export function formatTrackTime(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return ''
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
  return `${Number(get('day'))}일 ${get('hour')}시`
}

// "280 km [남서 180]" — 통보문의 반경 표기.
const DIR_KO = {
  N: '북', NNE: '북북동', NE: '북동', ENE: '동북동',
  E: '동', ESE: '동남동', SE: '남동', SSE: '남남동',
  S: '남', SSW: '남남서', SW: '남서', WSW: '서남서',
  W: '서', WNW: '서북서', NW: '북서', NNW: '북북서',
}

export function formatRadius(ring) {
  if (!ring || !Number.isFinite(ring.radiusKm)) return null
  const base = `${ring.radiusKm} km`
  if (!ring.exceptionDir || !Number.isFinite(ring.exceptionRadiusKm)) return base
  return `${base} [${DIR_KO[ring.exceptionDir] ?? ring.exceptionDir} ${ring.exceptionRadiusKm}]`
}

// 태풍 하나의 시각별 행 — 통보문 표와 같은 구성.
export function buildTrackRows(typhoon) {
  return (typhoon?.rows ?? []).map((row, index) => {
    const isCurrent = row === typhoon.current
      || (row.validAt === typhoon.current?.validAt && Boolean(row.forecast) === Boolean(typhoon.current?.forecast))
    return {
    key: `${typhoon.number}-${row.validAt}-${row.forecast ? 'f' : 'a'}-${index}`,
    forecast: Boolean(row.forecast),
    isCurrent,
    // 분석 행이 여러 개다. 그중 가장 최근 하나만 "현재"이고 나머지는 지나온 관측이다.
    kindLabel: row.forecast ? '예상' : (isCurrent ? '현재' : '관측'),
    timeLabel: formatTrackTime(row.validAt),
    validAt: row.validAt,
    intensity: intensityOf(row.maxWindMs),
    maxWindMs: row.maxWindMs ?? null,
    maxWindKmh: windKmh(row.maxWindMs),
    pressureHpa: row.pressureHpa ?? null,
    lat: row.lat,
    lon: row.lon,
    dir: row.dir ? (DIR_KO[row.dir] ?? row.dir) : null,
    speedKmh: row.speedKmh ?? null,
    gale: formatRadius(row.gale),
    storm: formatRadius(row.storm),
    errorRadiusKm: Number.isFinite(row.errorRadiusKm) && row.errorRadiusKm > 0 ? row.errorRadiusKm : null,
    location: row.location ?? '',
    center: { lat: row.lat, lon: row.lon },
    geometry: row.geometry ?? null,
    }
  })
}

export function buildTyphoonListItems(typhoons = []) {
  const colors = assignTyphoonColors(typhoons.map((t) => t.number))
  return typhoons.map((typhoon) => {
    const rows = buildTrackRows(typhoon)
    return {
    number: typhoon.number,
    color: colors[typhoon.number],
    // 이름은 typ_lst에서 온다. 못 받았으면 번호만 쓴다.
    title: typhoon.name ? `${typhoon.number}호 태풍 ${typhoon.name}` : `${typhoon.number}호 태풍`,
    name: typhoon.name ?? null,
    pressureHpa: typhoon.current?.pressureHpa ?? null,
    maxWindMs: typhoon.current?.maxWindMs ?? null,
    intensity: intensityOf(typhoon.current?.maxWindMs),
    location: typhoon.current?.location ?? '',
    analyzedAt: typhoon.analyzedAt,
    center: { lat: typhoon.current?.lat, lon: typhoon.current?.lon },
    trackRows: rows,
    // 지나온 관측은 수십 줄이라 기본 표에서 뺀다. 통보문도 현재+예상만 표로 싣는다.
    pastRows: rows.filter((row) => !row.isCurrent && !row.forecast),
  }
  })
}

export default { buildTyphoonListItems, buildTrackRows, intensityOf, windKmh, formatTrackTime, formatRadius }
