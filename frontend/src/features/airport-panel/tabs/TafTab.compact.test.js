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
  assert.match(css, /\.ap-taf-table th:nth-child\(4\) \{ width: 24%; \}/)
})
