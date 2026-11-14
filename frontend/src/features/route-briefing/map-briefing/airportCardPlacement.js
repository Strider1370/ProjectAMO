// 공항 카드 자리 계산(화면 px, 순수 함수). 공항 둘레 여섯 자리(오른쪽 위·왼쪽 위·오른쪽 아래·왼쪽 아래·오른쪽·왼쪽) 중
// 경로선을 덜 가리고, 막힌 곳(브리핑 패널·독·고도 슬라이더·이미 놓은 카드)·화면 밖과 덜 겹치는 곳을 고른다.
// 카드는 지시선으로 공항에 잇는다 — 선은 공항 점에서 카드의 가장 가까운 모서리 점까지.

const GAP = 26 // 공항 점과 카드 사이(지시선 길이)
const CARD_GAP = 8

function candidates({ x, y }, { w, h }) {
  return [
    { side: 'ne', left: x + GAP, top: y - GAP - h },
    { side: 'se', left: x + GAP, top: y + GAP },
    { side: 'e', left: x + GAP + 10, top: y - h / 2 },
    { side: 'nw', left: x - GAP - w, top: y - GAP - h },
    { side: 'sw', left: x - GAP - w, top: y + GAP },
    { side: 'w', left: x - GAP - 10 - w, top: y - h / 2 },
  ]
}

const rectOf = (c, { w, h }) => ({ left: c.left, top: c.top, right: c.left + w, bottom: c.top + h })

function overlapArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

function pointIn(rect, [px, py]) { return px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom }

function segmentsCross([ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (d === 0) return false
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

// 경로 선분이 카드 상자를 지나는 개수.
export function routeHits(rect, route) {
  const edges = [
    [[rect.left, rect.top], [rect.right, rect.top]], [[rect.right, rect.top], [rect.right, rect.bottom]],
    [[rect.right, rect.bottom], [rect.left, rect.bottom]], [[rect.left, rect.bottom], [rect.left, rect.top]],
  ]
  let hits = 0
  for (let i = 1; i < (route?.length ?? 0); i += 1) {
    const a = route[i - 1], b = route[i]
    if (pointIn(rect, a) || pointIn(rect, b) || edges.some(([c, d]) => segmentsCross(a, b, c, d))) hits += 1
  }
  return hits
}

// anchors: [{ key, x, y, size? }] 놓을 순서대로(size가 없으면 공통 size), bounds: 지도 영역 { left, top, right, bottom }, obstacles: 막힌 상자들, route: 경로 화면 좌표.
export function placeAirportCards(anchors, { size, bounds, obstacles = [], route = [] }) {
  const placed = []
  for (const anchor of anchors) {
    const own = anchor.size ?? size
    let best = null
    const blockers = [...obstacles, ...placed.map((p) => p.rect)]
    const initial = candidates(anchor, own)
    function consider(candidate, order) {
      // Report time controls can increase the measured height. Keep each candidate
      // inside the viewport before comparing overlaps with panels and other cards.
      const rect = rectOf({
        ...candidate,
        left: Math.max(bounds.left, Math.min(candidate.left, bounds.right - own.w)),
        top: Math.max(bounds.top, Math.min(candidate.top, bounds.bottom - own.h)),
      }, own)
      const outside = Math.max(0, bounds.left - rect.left) + Math.max(0, rect.right - bounds.right)
        + Math.max(0, bounds.top - rect.top) + Math.max(0, rect.bottom - bounds.bottom)
      const blocked = blockers.reduce((sum, other) => sum + overlapArea(rect, other), 0)
      // 카드와 UI를 가리는 것보다 경로선 회피를 우선하면 작은 칩이 큰 카드 위에 놓일 수 있다.
      const distance = Math.hypot(rect.left + own.w / 2 - anchor.x, rect.top + own.h / 2 - anchor.y)
      const score = outside * 100000 + blocked * 10000 + routeHits(rect, route) * 3000 + (candidate.side === 'nearby' ? distance * 0.1 : 0) + order
      if (!best || score < best.score) best = { ...candidate, rect, score, blocked }
    }
    initial.forEach(consider)
    // 여섯 기본 자리가 막히면 이미 놓인 카드·패널의 둘레와 화면 가장자리도 탐색한다.
    if (best?.blocked > 0) {
      const xs = [bounds.left, bounds.right - own.w, ...initial.map((candidate) => candidate.left)]
      const ys = [bounds.top, bounds.bottom - own.h, ...initial.map((candidate) => candidate.top)]
      for (const rect of blockers) {
        xs.push(rect.left - own.w - CARD_GAP, rect.right + CARD_GAP)
        ys.push(rect.top - own.h - CARD_GAP, rect.bottom + CARD_GAP)
      }
      for (const left of xs) for (const top of ys) consider({ side: 'nearby', left, top }, initial.length)
    }
    const { rect } = best
    // 지시선 끝: 공항 점에서 가장 가까운 카드 테두리 위 점.
    const lineEnd = [Math.min(Math.max(anchor.x, rect.left), rect.right), Math.min(Math.max(anchor.y, rect.top), rect.bottom)]
    placed.push({ key: anchor.key, side: best.side, left: Math.round(rect.left), top: Math.round(rect.top), rect, anchor: [anchor.x, anchor.y], lineEnd })
  }
  return placed.map(({ rect: _rect, ...rest }) => rest)
}
