import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TERMINAL_FLIGHT_GROUPS } from './data/terminalFixtures.js'

const page = readFileSync(new URL('./DestinationWeatherPage.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')

test('정규화된 날씨 문구와 fallback을 두 화면 경계에서 소비한다', () => {
  assert.match(page, /function weatherText\(point\)/)
  assert.match(page, /weatherText\(point\)/)
  assert.match(page, /snow: snowDay/)
  assert.match(page, /snow-day\.svg/)
  assert.doesNotMatch(page, /const weatherLabels/)
  assert.match(page, /fallbackWeatherAsset/)
})

test('clear는 board와 rail에서 번들 day/night artwork를 사용한다', () => {
  assert.match(page, /clear-day\.svg/)
  assert.match(page, /clear-night\.svg/)
  assert.match(page, /function clearWeatherAsset\(point\)/)
  assert.match(page, /clear: clearDay/)
  assert.ok((page.match(/clearWeatherAsset\(point\)/g) || []).length >= 3)
})

test('AF267 지연 tone은 board와 rail status에 같은 modifier와 amber semantics를 적용한다', () => {
  assert.match(page, /operation-status \$\{operation\.tone\}/)
  assert.match(page, /\$\{flight\.operation\.tone\} rail-motion-unit/)
  assert.equal(TERMINAL_FLIGHT_GROUPS[0][2].operation.tone, 'delay')
  assert.match(css, /\.operation-status\.delay i/)
  assert.match(css, /\.operation-status\.delay strong/)
  assert.match(css, /#f07c19/)
})

test('부분 current weather metrics do not append units to passenger fallback copy', () => {
  assert.match(page, /function currentMetric\(value, unit\)/)
  assert.match(page, /currentMetric\(current\.feelsLike, "℃"\)/)
  assert.match(page, /currentMetric\(current\.humidity, "%"\)/)
})

test('로딩·부분·오류 상태는 board와 rail의 기존 행 geometry를 유지한다', () => {
  assert.match(page, /phase === "loading"/)
  assert.match(page, /phase === "partial"/)
  assert.match(page, /phase === "error"/)
  assert.match(page, /variant === "board" \? "board-column" : "rail-flight-row"/)
  assert.match(page, /terminal-data-surface--partial/)
  assert.match(css, /\.terminal-data-surface--board/)
  assert.match(css, /\.terminal-data-surface--rail/)
  assert.match(css, /\.terminal-data-surface--board\.terminal-data-surface--loading/)
  assert.match(css, /\.terminal-data-surface--rail\.terminal-data-surface--error/)
  assert.match(css, /grid-template-columns: 1fr/)
  assert.match(css, /inline-size: 100%/)
  assert.match(css, /block-size: 100%/)
  assert.match(css, /padding: 0/)
  assert.match(css, /font-size: 20px/)
})

test('ready destinations retain city and airport labels in both branches', () => {
  assert.match(page, /function destinationDisplayName\(destination\)/)
  assert.equal((page.match(/destinationDisplayName\(flight\.destination\)/g) || []).length, 2)
  assert.deepEqual(
    TERMINAL_FLIGHT_GROUPS.flat().map((flight) => flight.destination.displayName),
    ['도쿄 하네다', '싱가포르', '파리 샤를 드 골', '오사카 간사이', '방콕 수완나품', '로마 피우미치노'],
  )
  assert.match(css, /\.destination-name \{ overflow: hidden; text-overflow: ellipsis;/)
})

test('rail renderer binds its progress-chevron icon import', () => {
  assert.match(page, /import \{[^}]*MdChevronRight[^}]*\} from "react-icons\/md"/)
  assert.match(page, /<MdChevronRight className="progress-arrow" \/>/)
})
