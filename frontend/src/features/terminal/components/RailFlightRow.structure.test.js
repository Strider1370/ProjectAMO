import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyTerminalFixtureState, TERMINAL_FLIGHT_GROUPS } from '../data/terminalFixtures.js'

const source = readFileSync(new URL('./RailFlightRow.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../terminal.css', import.meta.url), 'utf8')

test('3안은 운항정보와 도착예보를 명시적으로 분리한다', () => {
  assert.match(source, /data-region="flight-info"/)
  assert.match(source, /data-region="arrival-weather"/)
})

test('도착 예보가 일반 과거 예보보다 먼저 온다', () => {
  const arrival = source.indexOf('data-section="arrival"')
  const future = source.indexOf('data-section="future-forecast"')
  const preArrival = source.indexOf('data-section="pre-arrival"')
  assert.ok(arrival >= 0 && future > arrival && preArrival > arrival)
  assert.doesNotMatch(source, /pastForecast/)
})

test('도착 시각은 현지와 한국 고정 열을 사용한다', () => {
  assert.match(source, /<span data-fixed-label>현지<\/span>/)
  assert.match(source, /<span data-fixed-label>한국<\/span>/)
  assert.doesNotMatch(source, /한국[^<]*KST/)
})

test('rail destination keeps the city and code at their dedicated signage sizes', () => {
  assert.match(source, /className="rail-destination-city"/)
  assert.match(source, /className="rail-destination-code"/)
  assert.match(css, /\.rail-destination-city \{[^}]*font-size: var\(--signage-destination\)/)
  assert.match(css, /\.rail-destination-code \{[^}]*font-size: var\(--signage-code\)/)
})

test('rail local and Korea times use stable value tracks', () => {
  assert.match(source, /className="rail-local-date"/)
  assert.match(source, /<span data-fixed-label>한국<\/span>/)
  assert.match(source, /<span data-fixed-label>KST<\/span>/)
  const localDateRule = css.match(/\.rail-local-date \{[^}]+\}/)?.[0] ?? ''
  assert.match(localDateRule, /grid-template-columns:\s*minmax\(10ch,\s*12ch\)\s+max-content\s+5ch\s+max-content/)
  assert.doesNotMatch(localDateRule, /grid-template-columns:\s*auto\s+auto\s+auto\s+auto/)
})

test('FLAP과 ROLL은 fixed labels나 행이 아닌 changing values를 대상으로 한다', () => {
  assert.match(source, /import AnimatedValue from '\.\.\/motion\/AnimatedValue\.jsx'/)
  assert.match(source, /motionOrder\(rowIndex, 0\)/)
  assert.match(source, /motionOrder\(rowIndex, 15\)/)
  assert.match(source, /const RAIL_MOTION_ITEMS_PER_ROW = 32/)
  assert.match(source, /return rowIndex \* RAIL_MOTION_ITEMS_PER_ROW \+ item/)
  assert.doesNotMatch(source, /item % RAIL_MOTION_ITEMS_PER_ROW/)
  assert.doesNotMatch(source, /rail-motion-unit/)
  for (const label of ['출발', '탑승구', '도착', '현지', '한국']) {
    assert.doesNotMatch(source, new RegExp(`<AnimatedValue[^>]*>${label}`))
  }
  for (const mode of ['rail-motion-roll', 'rail-motion-flap', 'rail-motion-wipe', 'rail-motion-fade']) {
    assert.match(css, new RegExp(`\\.${mode}[^}]*\\[data-terminal-motion-value\\]`, 's'))
    assert.doesNotMatch(css, new RegExp(`\\.${mode}[^}]*\\.rail-flight-row[^}]*?(?:transform|visibility|clip-path|animation)`, 's'))
  }
})

test('rail rows expose stable flight hooks for geometry contracts', () => {
  assert.match(source, /data-testid="rail-flight-row" data-flight-id=\{flight\.id\}/)
})

test('partial fixture의 누락 예보는 하나의 marked fallback으로 렌더한다', () => {
  const partial = applyTerminalFixtureState(TERMINAL_FLIGHT_GROUPS, 'partial')[0][0]
  assert.equal(partial.weather.afterArrival[0].available, false)
  assert.match(source, /if \(!point\.available\) return <AnimatedValue mode="value" order=\{order\} className="rail-forecast-unavailable rail-forecast-content" data-signage-text="ordinary">예보 확인 중<\/AnimatedValue>/)
})

test('loading/error 행은 stationary fallback copy를 유지한다', () => {
  assert.match(source, /terminal-data-surface--\$\{flight\.dataState\.phase\}`\} data-testid="rail-flight-row" data-flight-id=\{flight\.id\} style=\{\{ '--order': rowIndex \}\}/)
  assert.match(source, /<span>\{flight\.dataState\.phase === 'loading' \? '운항 정보를 불러오는 중입니다' : '운항 정보를 불러오지 못했습니다'\}<\/span>/)
  assert.match(css, /\.rail-motion-cascade \.rail-page\.is-entering \[data-terminal-motion-value\]/)
  assert.doesNotMatch(css, /rail-motion-cascade[^}]*\.rail-flight-row[^}]*transform/s)
})
