// BriefingView의 순수 표시 변환 — 심각도/범주 색, 최악값 선택, 목적지 타임라인 막대 세그먼트.
// 이전엔 BriefingView.jsx(736줄)의 JSX 사이에 인라인돼 뷰 전체를 렌더해야만 검증 가능했다.
// 여기로 추출해 순수·테스트 가능하게 한다(rawWindsModel.js 패턴). tz 의존 포맷(kstParts 등)은
// 컴포넌트에 잔류 — tz 클로저·JSX와 엮여 있어 이번 범위 밖.

export const CAT_RANK = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 }
export const SEG_RANK = { '약': 1, '중': 2, '심': 3 }

// 색 = 심각도(level): VFR/MVFR=green(양호) / IFR=amber(주의) / LIFR=red(경고). 카테고리 고정색 폐기.
export const LEVEL_COLOR = { green: 'var(--level-green)', amber: 'var(--level-amber)', red: 'var(--level-red)', gray: '#94a3b8' }

export const catLevel = (c) => (c === 'VFR' || c === 'MVFR' ? 'green' : c === 'IFR' ? 'amber' : c === 'LIFR' ? 'red' : 'gray')
export const catColorOf = (c) => LEVEL_COLOR[catLevel(c)]

// 표시용 3레벨 fold (배너·②·⑥ 일관): MVFR→VFR(마진 VFR은 VFR로).
export const catDisplay = (c) => (c === 'MVFR' ? 'VFR' : c)

export const worstAirport = (a) =>
  (a ?? []).reduce((acc, x) => (!acc || (CAT_RANK[x.category] ?? -1) > (CAT_RANK[acc.category] ?? -1) ? x : acc), null)
export const worstInterval = (iv) =>
  (iv ?? []).reduce((acc, x) => (!acc || SEG_RANK[x.level] > SEG_RANK[acc.level] ? x : acc), null)

export const pctOf = (iso, s, span) => ((Date.parse(iso) - s) / span) * 100

// ⑥ 목적지 카테고리 타임라인 막대 — 시간대별 최악 범주(결정론 단일 막대).
export function tafBarSegments(timeline, validity) {
  const s = Date.parse(validity?.start)
  const e = Date.parse(validity?.end)
  if (!timeline?.length || !Number.isFinite(s) || !Number.isFinite(e) || e <= s) return []
  const span = e - s
  const segs = []
  for (const entry of timeline) {
    const color = catColorOf(entry.category)
    const left = Math.max(0, Math.min(100, pctOf(entry.time, s, span)))
    if (segs.length && segs[segs.length - 1].color === color) continue
    segs.push({ color, left, time: entry.time }) // time = 이 색(범주)이 시작되는 시각 = 전환점
  }
  return segs.map((sg, i) => ({ ...sg, width: (i < segs.length - 1 ? segs[i + 1].left : 100) - sg.left }))
}
