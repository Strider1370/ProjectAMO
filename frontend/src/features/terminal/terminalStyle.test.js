import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')
const themeCss = readFileSync(new URL('../../shared/theme/tokens.css', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('./components/RailFlightRow.jsx', import.meta.url), 'utf8')
const boardColumnSource = readFileSync(new URL('./components/BoardFlightColumn.jsx', import.meta.url), 'utf8')
const headerSource = readFileSync(new URL('./components/TerminalHeader.jsx', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('../../main.jsx', import.meta.url), 'utf8')

test('터미널은 외부 폰트를 요청하지 않는다', () => {
  assert.doesNotMatch(css, /fonts\.googleapis|@import\s+url/)
  assert.match(css, /font-family:\s*var\(--font-base\)/)
})

test('50인치 기준 사이니지 타입 토큰은 공유 테마가 소유한다', () => {
  for (const declaration of [
    '--signage-title: 40px', '--signage-destination: 64px',
    '--signage-code: 34px', '--signage-flight: 48px',
    '--signage-primary: 56px', '--signage-temperature: 60px',
    '--signage-arrival: 40px', '--signage-clock: 36px',
    '--signage-status: 30px', '--signage-body: 28px',
    '--signage-label: 26px', '--signage-caption: 24px',
    '--signage-footer: 22px', '--signage-safe-x: 40px', '--signage-safe-y: 24px',
  ]) assert.match(themeCss, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(css, /font-size:\s*var\(--signage-destination\)/)
})

test('시각 숫자는 고정 폭 숫자 정렬을 사용한다', () => {
  assert.match(css, /\.terminal-time-value[^}]*font-variant-numeric:\s*tabular-nums/s)
})

test('3안의 좌우 비율은 32 대 68이다', () => {
  assert.match(css, /grid-template-columns:\s*32%\s+68%/)
})

test('terminal route does not load a stored remote font preference', () => {
  assert.match(mainSource, /shouldLoadStoredFont\(window\.location\.pathname\)/)
  assert.match(mainSource, /loadStoredFont\(\)/)
})

test('passenger values carry signage markers, tabular numerals, and floor rules', () => {
  for (const source of [pageSource, boardColumnSource, headerSource]) {
    assert.match(source, /terminal-time-value/)
    assert.match(source, /data-signage-text=/)
  }
  assert.match(boardColumnSource, /data-signage-text="ordinary"/)
  for (const selector of ['\\.terminal-forecast-cell time', '\\.terminal-forecast-cell > strong', '\\.pre-arrival-forecast time', '\\.timeline-forecast strong']) {
    assert.match(css, new RegExp(`${selector}[^}]*font-size:\\s*var\\(--signage-label\\)`, 's'))
  }
})

test('every terminal numeric value category is explicitly marked', () => {
  const source = `${pageSource}\n${boardColumnSource}\n${headerSource}`
  for (const field of [
    'clocks.destinationNow', 'clocks.koreaNow', 'operation.departure', 'operation.duration',
    'operation.gate', 'clocks.arrivalLocal', 'clocks.arrivalKorea', 'point.time',
    'weather.temperature', '2026-07-30', 'clocks.destinationDate',
  ]) assert.match(source, new RegExp(`terminal-time-value[^>]*>[\\s\\S]{0,180}${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.match(boardColumnSource, /WeatherTemperature weather=\{weather\.current\}/)
  assert.match(boardColumnSource, /weather\.current\.feelsLike/)
  assert.match(boardColumnSource, /weather\.current\.humidity/)
  assert.match(boardColumnSource, /WeatherTemperature\(\{ weather/)
  assert.match(pageSource, /Forecast point=\{flight\.weather\.preArrival\}/)
  assert.match(pageSource, /<WeatherTemperature weather=\{point\} order=\{order \+ 2\} \/>/)
})

test('edge-facing terminal chrome uses the signage safe edges', () => {
  for (const selector of ['\\.terminal-page-indicator', '\\.board-header', '\\.rail-header', '\\.board-footer', '\\.exact-rail\\s+footer']) {
    assert.match(css, new RegExp(`${selector}[^}]*--signage-safe-`, 's'))
  }
})

test('rail flight information starts at the signage safe edge', () => {
  assert.match(css, /\.rail-flight-info[^}]*padding:\s*[^;]*var\(--signage-safe-x\)/s)
})

test('rail header clock label meets the signage caption floor', () => {
  assert.match(css, /\.rail-header-clock\s*>\s*span[^}]*font-size:\s*var\(--signage-caption\)/s)
})

test('passenger typography uses direct signage tokens without shadow size overrides', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  for (const [, selector, declarations] of rules) {
    const size = declarations.match(/font-size:\s*([^;]+);/)
    if (!size) continue
    const value = size[1].trim()
    if (/\.motion-mode-switch|\.view-switcher|\.next-board-button/.test(selector)) {
      assert.match(value, /^(20|22)px$/)
      continue
    }
    assert.match(value, /^var\(--signage-[\w-]+\)$/)
  }
  assert.doesNotMatch(css, /\.terminal-signage\s+\[data-signage-text=/)
})
