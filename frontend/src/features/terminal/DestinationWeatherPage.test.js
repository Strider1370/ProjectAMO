import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TERMINAL_FLIGHT_GROUPS } from './data/terminalFixtures.js'

const railSource = readFileSync(new URL('./components/RailFlightRow.jsx', import.meta.url), 'utf8')
const boardSource = readFileSync(new URL('./components/BoardFlightColumn.jsx', import.meta.url), 'utf8')
const visualSource = readFileSync(new URL('./components/WeatherVisual.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')

test('정규화된 날씨 문구와 fallback은 공유 WeatherVisual에서 소비한다', () => {
  assert.match(visualSource, /function assetFor\(weather\)/)
  assert.match(visualSource, /snow: snowDay/)
  assert.match(visualSource, /snow-day\.svg/)
  assert.match(visualSource, /if \(!weather\?\.available\).*예보 확인 중/s)
  assert.doesNotMatch(visualSource, /const weatherLabels/)
  assert.match(boardSource, /WeatherVisual/)
  assert.match(railSource, /WeatherVisual/)
})

test('clear는 공유 WeatherVisual에서 번들 day/night artwork를 사용한다', () => {
  assert.match(visualSource, /clear-day\.svg/)
  assert.match(visualSource, /clear-night\.svg/)
  assert.match(visualSource, /weather\.type !== 'clear'/)
  assert.match(visualSource, /hour >= 18 \|\| hour < 6/)
})

test('AF267 지연 tone은 board와 rail status에 같은 amber semantics를 적용한다', () => {
  assert.match(boardSource, /terminal-board-operation \$\{operation\.tone\}/)
  assert.match(railSource, /className=\{operation\.tone\}/)
  assert.equal(TERMINAL_FLIGHT_GROUPS[0][2].operation.tone, 'delay')
  assert.match(css, /\.terminal-board-operation\.delay/)
  assert.match(css, /\.rail-flight-status \.delay/)
  assert.match(css, /#f07c19/)
})

test('부분 current weather metrics는 숫자에만 단위를 붙인다', () => {
  assert.match(boardSource, /function metric\(value, unit\)/)
  assert.match(boardSource, /typeof value === 'number'/)
  assert.match(boardSource, /metric\(weather\.current\.feelsLike, '℃'\)/)
  assert.match(boardSource, /metric\(weather\.current\.humidity, '%'\)/)
})

test('로딩·부분·오류 상태는 board와 rail의 기존 행 geometry를 유지한다', () => {
  assert.match(boardSource, /dataState\.phase === 'loading'/)
  assert.match(boardSource, /dataState\.phase === 'error'/)
  assert.match(boardSource, /terminal-data-surface--\$\{dataState\.phase\}/)
  assert.match(railSource, /dataState\.phase === 'loading'/)
  assert.match(railSource, /dataState\.phase === 'partial'/)
  assert.match(railSource, /dataState\.phase === 'error'/)
  assert.match(css, /\.terminal-data-surface--board\.terminal-data-surface--loading/)
  assert.match(css, /\.terminal-data-surface--rail\.terminal-data-surface--error/)
  assert.match(css, /inline-size: 100%/)
  assert.match(css, /block-size: 100%/)
  assert.match(css, /padding: 0/)
})

test('ready destinations retain city and airport labels in both branches', () => {
  assert.match(boardSource, /destination\.city/)
  assert.match(boardSource, /destination\.airportName/)
  assert.match(railSource, /destination\.city/)
  assert.match(railSource, /destination\.airportName/)
  assert.deepEqual(
    TERMINAL_FLIGHT_GROUPS.flat().map((flight) => flight.destination.displayName),
    ['도쿄 하네다', '싱가포르', '파리 샤를 드 골', '오사카 간사이', '방콕 수완나품', '로마 피우미치노'],
  )
  assert.match(css, /\.terminal-board-identity p \{ overflow: hidden;.*text-overflow: ellipsis;/)
})

test('rail renderer puts the arrival forecast before its later forecast cells', () => {
  assert.ok(railSource.indexOf('data-section="arrival"') < railSource.indexOf('data-section="future-forecast"'))
})
