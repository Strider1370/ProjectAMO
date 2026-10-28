import test from 'node:test'
import assert from 'node:assert/strict'
import { placeAirportCards, routeHits } from './airportCardPlacement.js'

const size = { w: 240, h: 80 }
const bounds = { left: 0, top: 0, right: 1600, bottom: 700 }
const overlaps = (a, b) => a.left < b.left + size.w && b.left < a.left + size.w && a.top < b.top + size.h && b.top < a.top + size.h

test('남북형(RKSI→RKPC): 경로선을 가리지 않는 쪽, 왼쪽 브리핑 패널은 피한다', () => {
  const route = [[700, 80], [720, 300], [730, 620]]
  const panel = { left: 0, top: 0, right: 360, bottom: 450 }
  const placed = placeAirportCards([{ key: 'RKSI', x: 700, y: 80 }, { key: 'RKPC', x: 730, y: 620 }], { size, bounds, obstacles: [panel], route })
  for (const card of placed) {
    const rect = { left: card.left, top: card.top, right: card.left + size.w, bottom: card.top + size.h }
    assert.equal(routeHits(rect, route), 0, `${card.key} 카드가 경로를 가림`)
    assert.ok(rect.left >= 0 && rect.right <= 1600 && rect.top >= 0 && rect.bottom <= 700, `${card.key} 카드가 화면 밖`)
  }
  assert.ok(!overlaps(placed[0], placed[1]))
})

test('동서형: 경로가 가로로 지나면 카드는 위·아래로, 두 카드가 서로 겹치지 않는다', () => {
  const route = [[300, 350], [800, 360], [1300, 350]]
  const placed = placeAirportCards([{ key: 'A', x: 300, y: 350 }, { key: 'B', x: 1300, y: 350 }], { size, bounds, route })
  for (const card of placed) {
    assert.ok(['ne', 'nw', 'se', 'sw'].includes(card.side), `${card.key}: ${card.side}`)
    const rect = { left: card.left, top: card.top, right: card.left + size.w, bottom: card.top + size.h }
    assert.equal(routeHits(rect, route), 0)
  }
})

test('지시선 끝은 공항 점에서 가장 가까운 카드 테두리 위', () => {
  const [card] = placeAirportCards([{ key: 'A', x: 500, y: 300 }], { size, bounds, route: [] })
  assert.equal(card.side, 'ne')
  assert.deepEqual(card.lineEnd, [card.left, card.top + size.h])
})


test('태블릿: 시간대 선택으로 커진 카드도 화면 위·아래로 잘리지 않는다', () => {
  const viewport = { left: 8, top: 8, right: 1186, bottom: 826 }
  const own = { w: 360, h: 260 }
  const placed = placeAirportCards([{ key: 'A', x: 580, y: 30, size: own }, { key: 'B', x: 800, y: 800, size: own }], {
    size, bounds: viewport,
    obstacles: [{ left: 8, top: 8, right: 350, bottom: 490 }, { left: 8, top: 680, right: 1186, bottom: 826 }],
  })
  for (const card of placed) {
    assert.ok(card.top >= viewport.top)
    assert.ok(card.top + own.h <= viewport.bottom)
    assert.ok(card.left >= viewport.left)
    assert.ok(card.left + own.w <= viewport.right)
  }
})
