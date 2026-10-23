import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./useRouteBriefing.js', import.meta.url), 'utf8')

test('exposes the token list and its errors', () => {
  assert.match(source, /routeTokens/)
  assert.match(source, /routeTokenErrors/)
  assert.match(source, /setRouteTokenTexts/)
})

test('the map is not updated while any token is in error', () => {
  // 스펙 결정 5. 화면에 보이는 경로는 항상 실제로 성립하는 경로여야 한다.
  // 주석 문구가 아니라 가드 자체를 확인한다 — 주석만 고쳐도 깨지는 시험은 쓸모가 없다.
  assert.match(source, /errorCount\([^)]*\)\s*>\s*0/)
})

test('classification data is gathered on the client, not fetched per token', () => {
  // 판정에 서버를 부르면 글자를 칠 때마다 요청이 나간다.
  assert.match(source, /loadNavdata/)
  assert.match(source, /setTokenLookups/)
})

test('procedure forms come from the parts, never from the human label', () => {
  assert.match(source, /procedureTokenForms/)
  assert.doesNotMatch(source, /procedure\.label/)
})

test('pickers edit the token list through one path, not a parallel copy', () => {
  // 선택기가 자기 상태를 따로 들고 목록과 서로 맞추면 입력이 튄다.
  // 공항 알약 규칙은 lib/routeInput.js의 placeEndpoint 한 곳에 있다(동작 시험: routeInput.test.js).
  assert.match(source, /placeEndpoint\(texts, end, text/)
  const uses = source.match(/setEndpointAirportToken\(/g) ?? []
  // 정의 · 출발 · 도착 = 3곳. 교환은 방향이 뒤집혀 두 공항만 남기므로 목록을 새로 짠다.
  assert.equal(uses.length, 3)
})

test('seeding never overwrites a list the user has already typed into', () => {
  // 선택기가 공항을 채우는 순간 초기화 효과가 돌아 이용자가 친 토큰을 지운 적이 있다.
  assert.match(source, /if \(routeTokenTexts\.length > 0\)/)
})

test('the picker reads the token list, and the sync stops when values already agree', () => {
  // 무엇을 바꿀지는 순수 함수가 정하고(값이 같으면 빈 변경 — routeInput.test.js), 훅은 적용만 한다.
  assert.match(source, /fieldChangesFromTokens\(\{/)
  // 효과 안에서 확인 창을 띄우면 이용자가 누르지 않은 확인이 뜬다.
  assert.match(source, /for \(const \[field, value\] of Object\.entries\(changes\.airports\)\) updateRouteField\(field, value\)/)
})

test('FIR entry and exit are not written into the token list', () => {
  // FIR 진입·이탈은 실제 공항 코드가 아니라 우리 쪽 표시값이다.
  assert.match(source, /FIR_IN_AIRPORT && icao !== FIR_EXIT_AIRPORT/)
})

test('airport-only IFR setup clears stale route state without searching for an empty navpoint', () => {
  const emptyEnrouteBranch = source.match(/if \(!enrouteTokenText\) \{([\s\S]*?)\n    \}/)?.[1] ?? ''
  assert.match(emptyEnrouteBranch, /clearRouteDisplay\(\{ clearEditor: false \}\)/)
  assert.doesNotMatch(emptyEnrouteBranch, /runRouteSearch\(routeForm\)/)
})

test('briefing request carries procedure context and route markers for procedure NAVLOG', () => {
  assert.match(source, /const profileRequest = buildVerticalProfileRequest\(\{\s*routeGeometry, routeModel, routeResult, selectedSid, selectedStar, selectedIap,/s)
  assert.match(source, /createBriefingProvider\(null\)\.load\(\{\s*request: \{ \.\.\.profileRequest,/s)
})
