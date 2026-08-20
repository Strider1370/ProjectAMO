// 경로 예보변화 판정 — 순수 함수. 스케줄러가 만든 스냅샷 둘을 비교해 알림 후보를 낸다.
//
// 규칙은 다섯 가지뿐이다: 공항별 미니마·TS·FG·SN, 그리고 경로상 신규 SIGMET.
// 폰 알림과 앱 안 알림센터가 **같은 규칙**을 쓴다 — 채널마다 규칙을 나누면
// "왜 앱에는 있는데 폰에는 안 왔지"를 설명해야 하고, 그 시점에 이미 신뢰를 잃는다.
//
// 없던 것이 새로 생겼을 때만 발화한다. 정시 TAF는 6시간마다 나오므로 상태를 비교하지 않으면
// 같은 뇌전 예보로 하루 네 번 울린다. 회복은 알리지 않는다 — 조용하면 이상없다는 것이 계약이다.

const CONDITIONS = ['minima', 'ts', 'fg', 'sn']
const TYPE_OF = { minima: 'MINIMA', ts: 'TS', fg: 'FG', sn: 'SN' }

// 공항이 아니라 **공항+역할**로 짝짓는다. 출발지와 교체공항이 같은 곳일 수 있고(흔한 선택),
// 공항 코드만으로 묶으면 한쪽 역할이 조용히 사라져 엉뚱한 기준과 비교된다.
// dedupKey도 같은 이유로 역할을 포함한다 — 안 그러면 두 번째 역할의 진짜 변화가 삼켜진다.
const slotOf = (a) => `${a.icao}:${a.role ?? ''}`

function airportChanges(prev, curr) {
  const before = new Map((prev?.airports ?? []).map((a) => [slotOf(a), a]))
  const out = []
  for (const now of curr?.airports ?? []) {
    const then = before.get(slotOf(now))
    if (!then) continue // 이 자리의 직전 상태가 없다 — 기준점이 없으므로 판정하지 않는다
    for (const key of CONDITIONS) {
      if (now[key] && !then[key]) {
        out.push({
          type: TYPE_OF[key],
          target: now.icao,
          role: now.role ?? null,
          // 어느 미니마가 걸렸는지. 문구가 "내 미니마 미만"과 "접근최저치 미만"을 가른다.
          bound: key === 'minima' ? (now.minimaBound ?? null) : null,
          dedupKey: `${TYPE_OF[key]}:${slotOf(now)}`,
        })
      }
    }
  }
  return out
}

function sigmetChanges(prev, curr) {
  const seen = new Set((prev?.sigmets ?? []).map((s) => s.key))
  return (curr?.sigmets ?? [])
    .filter((s) => !seen.has(s.key))
    .map((s) => ({ type: 'SIGMET', target: s.label ?? s.key, role: null, dedupKey: `SIGMET:${s.key}` }))
}

export function detectChanges(prev, curr) {
  if (!prev) return [] // 첫 평가는 기준점만 잡는다
  return [...airportChanges(prev, curr), ...sigmetChanges(prev, curr)]
}

export default { detectChanges }
