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
  assert.match(source, /const setEndpointAirportToken = useCallback/)
  const uses = source.match(/setEndpointAirportToken\(/g) ?? []
  // 출발 · 도착 · 교환(양쪽) = 4곳
  assert.equal(uses.length, 4)
})

test('FIR entry and exit are not written into the token list', () => {
  // FIR 진입·이탈은 실제 공항 코드가 아니라 우리 쪽 표시값이다.
  assert.match(source, /FIR_IN_AIRPORT && icao !== FIR_EXIT_AIRPORT/)
})
