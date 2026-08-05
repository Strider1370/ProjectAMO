import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./TafTab.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../AirportPanel.css', import.meta.url), 'utf8')

test('marks the ETA period and exposes compact table styling', () => {
  assert.match(source, /ap-taf--compact/)
  assert.match(source, /ap-taf-eta-badge/)
})

test('keeps a separator beside row-spanned weather cells', () => {
  assert.doesNotMatch(css, /\.ap-taf-table td:last-child \{\s*box-shadow: none;/)
})

test('labels TAF times with the active timezone and prioritizes wind width', () => {
  assert.match(source, /<th>시간 \(\{tz\}\)<\/th>/)
  assert.match(css, /\.ap-taf-table th:nth-child\(2\) \{ width: 13%; \}/)
  assert.match(css, /\.ap-taf-table th:nth-child\(5\) \{ width: 24%; \}/)
})

test('orders columns visibility→clouds→weather→wind and folds CAVOK into one cell', () => {
  assert.match(source, /<th>시정\(m\)<\/th><th>구름\(ft\)<\/th><th>날씨<\/th><th>바람<\/th>/)
  assert.match(source, /ap-taf-cavok" colSpan=\{3\}/)
})

// 태블릿(아이패드 11" 가로 1194px → 패널 597px)에서 타임라인 칸이 57px까지 좁아져 바람 값이
// 칸 밖으로 넘쳤다. 719px(휴대폰)에서 1279px로 기준을 올려 태블릿도 표를 쓰게 한다.
test('태블릿 폭에서는 표를 쓰고 좁은 폭 기하를 함께 켠다', () => {
  assert.match(source, /max-width: 719px/)
  assert.match(source, /max-width: 1279px/)
  // 휴대폰은 기존 동작 유지(표 + compact 아님), 태블릿만 compact.
  assert.match(source, /max-width: 719px\)'\)\.matches\) return \{ view: 'table', compact: false \}/)
  assert.match(source, /max-width: 1279px\)'\)\.matches\) return \{ view: 'table', compact: true \}/)
})

// 값 열은 가운데 정렬, 시간 열만 왼쪽. 시간 열 폭(32%)이 남아돌아 바람 열로 옮겼다 —
// 돌풍(34015G25KT)이 붙으면 균등분배 17%로는 넘쳤다.
test('좁은 폭 표는 값 열을 가운데 두고 바람 열에 돌풍 자리를 준다', () => {
  assert.match(css, /\.ap-taf-table td\.ap-taf-merged \{\s*text-align: center;/)
  assert.match(css, /\.ap-taf--compact \.ap-taf-table th:nth-child\(1\) \{ width: 26%; \}/)
  assert.match(css, /\.ap-taf--compact \.ap-taf-table th:nth-child\(5\) \{ width: 26%; \}/)
  assert.doesNotMatch(css, /\.ap-taf--compact \.ap-taf-table th:first-child/)
})
