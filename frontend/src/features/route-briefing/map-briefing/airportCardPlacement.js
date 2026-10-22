// 공항 카드 자리 계산(화면 px, 순수 함수). 공항 둘레 여섯 자리(오른쪽 위·왼쪽 위·오른쪽 아래·왼쪽 아래·오른쪽·왼쪽) 중
// 경로선을 덜 가리고, 막힌 곳(브리핑 패널·독·고도 슬라이더·이미 놓은 카드)·화면 밖과 덜 겹치는 곳을 고른다.
// 카드는 지시선으로 공항에 잇는다 — 선은 공항 점에서 카드의 가장 가까운 모서리 점까지.

const GAP = 26 // 공항 점과 카드 사이(지시선 길이)

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
    for (const [order, candidate] of candidates(anchor, own).entries()) {
      const rect = rectOf(candidate, own)
      const outside = Math.max(0, bounds.left - rect.left) + Math.max(0, rect.right - bounds.right)
        + Math.max(0, bounds.top - rect.top) + Math.max(0, rect.bottom - bounds.bottom)
      const blocked = [...obstacles, ...placed.map((p) => p.rect)].reduce((sum, other) => sum + overlapArea(rect, other), 0)
      // 화면 밖·막힌 곳은 크게, 경로를 가리는 것은 그다음, 같으면 먼저 적은 자리(오른쪽 위)를 고른다.
      const score = outside * 400 + blocked * 4 + routeHits(rect, route) * 3000 + order
      if (!best || score < best.score) best = { ...candidate, rect, score }
    }
    const { rect } = best
    // 지시선 끝: 공항 점에서 가장 가까운 카드 테두리 위 점.
    const lineEnd = [Math.min(Math.max(anchor.x, rect.left), rect.right), Math.min(Math.max(anchor.y, rect.top), rect.bottom)]
    placed.push({ key: anchor.key, side: best.side, left: Math.round(rect.left), top: Math.round(rect.top), rect, anchor: [anchor.x, anchor.y], lineEnd })
  }
  return placed.map(({ rect: _rect, ...rest }) => rest)
}
