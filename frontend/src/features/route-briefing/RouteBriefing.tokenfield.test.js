import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const jsx = readFileSync(new URL('./RouteBriefingPanel.jsx', import.meta.url), 'utf8')

test('desktop and mobile share one token field', () => {
  assert.match(jsx, /import RouteTokenField/)
  // 두 화면이 같은 덩이를 쓴다 — 두 번 쓰면 한쪽만 고쳐지는 일이 생긴다.
  const uses = jsx.match(/\{routeTokenField\}/g) ?? []
  assert.equal(uses.length, 2, '데스크톱과 모바일 두 곳에서 써야 한다')
  assert.equal((jsx.match(/<RouteTokenField/g) ?? []).length, 1, '부품은 한 번만 짜야 한다')
})

test('the apply button and its stale help text are gone from both paths', () => {
  assert.doesNotMatch(jsx, /경로 적용/)
  assert.doesNotMatch(jsx, /SID\/STAR는 절차 선택에 따로 표시됩니다/)
  assert.doesNotMatch(jsx, /초안을 입력한 뒤 경로 적용으로 확정하세요/)
  assert.doesNotMatch(jsx, /rb-route-plan/)
  // 옛 textarea가 남아 있으면 반쪽 상태다.
  assert.doesNotMatch(jsx, /<textarea/)
})

test('the read-only colored sequence row is gone', () => {
  // 입력칸과 결과 표시를 합쳤으므로 같은 것을 두 번 보여주지 않는다 (스펙 결정 3).
  assert.doesNotMatch(jsx, /route-check-sequence/)
  assert.doesNotMatch(jsx, /ROUTE_SEQUENCE_COLORS/)
})

test('the status and summary line replaces the button', () => {
  assert.match(jsx, /rtf-status/)
  assert.match(jsx, /routeTokenErrors\.length/)
  assert.match(jsx, /routeSummaryText/)
})

test('an absent departure airport is announced, not silently empty', () => {
  // 브리핑에서 공항 기상이 그냥 없는 것과 공항을 안 정해서 없는 것은 다르다.
  assert.match(jsx, /출발공항 없음/)
})

test('routes without airports are allowed', () => {
  assert.doesNotMatch(jsx, /const canSearch = !!routeForm\.departureAirport && !!routeForm\.arrivalAirport/)
  assert.match(jsx, /const canSearch = routeTokens\.length > 0/)
})

test('the map-gesture confirmation survives, since it is unrelated to typing', () => {
  assert.match(jsx, /pendingRouteEdit/)
})
