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
  assert.match(source, />현지</)
  assert.match(source, />한국</)
  assert.doesNotMatch(source, /한국[^<]*KST/)
})

test('기존 FLAP과 ROLL은 행이 아닌 변경 값 wrapper를 대상으로 한다', () => {
  assert.match(source, /className="rail-flight-number rail-motion-unit"/)
  assert.match(source, /className="terminal-time-value rail-motion-unit"/)
  assert.match(source, /className=\{`rail-forecast-content rail-motion-unit/)
  assert.match(css, /\.rail-motion-roll \.rail-page\.is-entering \.rail-motion-unit/)
  assert.match(css, /\.rail-motion-flap \.rail-page\.is-entering \.rail-motion-unit/)
})

test('partial fixture의 누락 예보는 하나의 marked fallback으로 렌더한다', () => {
  const partial = applyTerminalFixtureState(TERMINAL_FLIGHT_GROUPS, 'partial')[0][0]
  assert.equal(partial.weather.afterArrival[0].available, false)
  assert.match(source, /if \(!point\.available\) return <span className="rail-forecast-unavailable rail-forecast-content rail-motion-unit" data-signage-text="ordinary" style=\{\{ '--rail-item': motionItem \}\}>예보 확인 중<\/span>/)
})

test('loading/error 행도 FLAP과 ROLL에서 같은 motion order로 copy를 드러낸다', () => {
  assert.match(source, /terminal-data-surface--\$\{flight\.dataState\.phase\}`\} style=\{\{ '--order': rowIndex \}\}/)
  assert.match(source, /<span className="rail-motion-unit" style=\{\{ '--rail-item': 0 \}\}>\{flight\.dataState\.phase === 'loading' \? '운항 정보를 불러오는 중입니다' : '운항 정보를 불러오지 못했습니다'\}<\/span>/)
  assert.match(css, /\.rail-motion-roll \.rail-page\.is-entering \.rail-flight-row[^}]*visibility: hidden/s)
  assert.match(css, /\.rail-motion-roll \.rail-page\.is-entering \.rail-motion-unit[^}]*visibility: visible/s)
  assert.match(css, /\.rail-motion-flap \.rail-page\.is-entering \.rail-motion-unit[^}]*visibility: visible/s)
})
