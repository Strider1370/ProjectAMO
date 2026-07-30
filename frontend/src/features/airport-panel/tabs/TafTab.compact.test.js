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
