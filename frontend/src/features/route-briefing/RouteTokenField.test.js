import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const jsx = readFileSync(new URL('./RouteTokenField.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./RouteTokenField.css', import.meta.url), 'utf8')

test('typing happens in a real input element, not a contenteditable', () => {
  // 커서·선택·붙여넣기·모바일 키보드를 직접 다루지 않기 위한 계약이다.
  assert.match(jsx, /<input/)
  assert.doesNotMatch(jsx, /contentEditable/i)
})

test('space and enter confirm a token, backspace removes the previous pill', () => {
  assert.match(jsx, /=== ' '/)
  assert.match(jsx, /'Enter'/)
  assert.match(jsx, /'Backspace'/)
})

test('pills are drawn, not focusable text inputs', () => {
  assert.doesNotMatch(jsx, /<input[^>]*className="rtf-pill/)
})

test('pill colors come from the shared palette', () => {
  assert.match(jsx, /TOKEN_COLORS/)
  assert.match(css, /\.rtf-pill/)
})

test('the field wraps to multiple lines instead of scrolling sideways', () => {
  // 긴 경로가 가로 스크롤로 숨으면 무엇을 쳤는지 한눈에 볼 수 없다.
  assert.match(css, /flex-wrap:\s*wrap/)
})

test('the touch target meets the iPad minimum', () => {
  assert.match(css, /min-height:\s*44px/)
})

test('pressing a pill does not let the on-screen keyboard close', () => {
  // iPad에서 알약을 누를 때 기본 동작이 초점을 옮기면 키보드가 닫힌다.
  assert.match(jsx, /onMouseDown/)
  assert.match(jsx, /preventDefault/)
})
