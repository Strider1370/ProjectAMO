// 폰이 울릴 조건 — 그 시각 타임라인 항목에서 상태를 뽑는다.
// 시간 병합도 임계값도 새로 만들지 않는다: 시각별 운고·시정과 병합된 현상은 taf-window.js가,
// 공항 접근최저치는 flight-category.js가 이미 준다. 여기서는 조합만 한다.
import { airportMinima } from '../briefing/flight-category.js'
import { metricsAt, weatherAt } from '../briefing/taf-window.js'

// 내 미니마를 설정하지 않았을 때의 기본. 관제권 VFR 최저치이자 이 앱의 IFR 판정선과 같은 값이라,
// 미설정 사용자는 "IFR이면 울린다"와 같은 동작을 얻는다.
const DEFAULT_MINIMA = { visibilityM: 5000, ceilingFt: 1500 }

const num = (v) => (Number.isFinite(v) ? v : null)

// 실효 미니마 = 더 엄격한 쪽. 둘 다 "바닥"이라 먼저 걸리는 쪽이 실제 제약이다.
// 내 기준이 공항 접근최저치보다 낮으면(더 관대하면) 공항 쪽이 이긴다 — 그 밑에선 아무도
// 착륙하지 못하는데 내 기준만 보면 조용해서, 못 가는 것을 갈 수 있다고 착각하게 만든다.
function effectiveMinima(icao, userMinima) {
  const airport = airportMinima(icao)
  const personal = {
    visibilityM: num(userMinima?.visibilityM) ?? DEFAULT_MINIMA.visibilityM,
    ceilingFt: num(userMinima?.ceilingFt) ?? DEFAULT_MINIMA.ceilingFt,
  }
  const isDefault = num(userMinima?.visibilityM) == null && num(userMinima?.ceilingFt) == null
  return {
    personal,
    airport: { visibilityM: num(airport?.visibilityM), ceilingFt: num(airport?.ceilingFt) },
    isDefault,
  }
}

// 어느 쪽이 걸렸는지까지 낸다 — 공항 최저치 때문에 걸렸는데 "내 미니마 미만"이라고 하면
// 거짓말이 된다. 둘 다 걸리면 더 엄격한 쪽(= 값이 큰 쪽)을 이름으로 삼는다.
function judgeMinima(metrics, icao, userMinima) {
  const { personal, airport, isDefault } = effectiveMinima(icao, userMinima)
  const below = (value, line) => Number.isFinite(value) && Number.isFinite(line) && value < line

  const byPersonal = below(metrics.visibilityM, personal.visibilityM) || below(metrics.ceilingFt, personal.ceilingFt)
  const byAirport = below(metrics.visibilityM, airport.visibilityM) || below(metrics.ceilingFt, airport.ceilingFt)

  if (!byPersonal && !byAirport) return { minima: false, minimaBound: null }
  // 공항 최저치가 걸렸다면 그것이 더 엄격한 선이다 — 그 밑은 개인 기준과 무관하게 불가능하다.
  if (byAirport) return { minima: true, minimaBound: 'airport' }
  return { minima: true, minimaBound: isDefault ? 'default' : 'personal' }
}

// 파서가 쪼개 준 구조를 쓴다 — 원문 글자를 정규식으로 훑지 않는다.
// parse-utils.js는 wx 토큰을 { raw, intensity, descriptor, phenomena }로 나눈다:
//   TSRA → descriptor 'TS', phenomena ['RA']   (뇌전은 현상이 아니라 수식어다)
//   VCTS → intensity 'VICINITY', descriptor 'TS'
//   FZFG → descriptor 'FZ', phenomena ['FG']
//   -SN  → intensity 'LIGHT', phenomena ['SN']
//
// 부근(VC)은 발화하지 않는다. VCTS는 공항이 아니라 주변 5~10 SM의 뇌전이라,
// "출발 RKSI 뇌전 예보"라고 알리면 사실과 다른 말을 하게 된다.
const isVicinity = (w) => w?.intensity === 'VICINITY'
const hasDescriptor = (list, code) => list.some((w) => !isVicinity(w) && w?.descriptor === code)
const hasPhenomenon = (list, code) => list.some((w) => !isVicinity(w) && (w?.phenomena ?? []).includes(code))

const NOTHING = { minima: false, minimaBound: null, ts: false, fg: false, sn: false }

export function tafConditionsAt(taf, iso, icao = null, userMinima = null) {
  const metrics = metricsAt(taf, iso)
  // TAF가 없거나 유효기간 밖이면 판정하지 않는다 — 없는 것을 위험으로 읽으면 오탐이 쌓인다.
  if (!metrics) return { ...NOTHING }
  const wx = weatherAt(taf, iso)
  return {
    ...judgeMinima(metrics, icao, userMinima),
    ts: hasDescriptor(wx, 'TS'),
    fg: hasPhenomenon(wx, 'FG'),
    sn: hasPhenomenon(wx, 'SN'),
  }
}

export default { tafConditionsAt }
