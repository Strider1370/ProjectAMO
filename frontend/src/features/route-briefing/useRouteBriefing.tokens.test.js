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
