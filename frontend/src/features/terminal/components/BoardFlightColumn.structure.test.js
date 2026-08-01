import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./BoardFlightColumn.jsx', import.meta.url), 'utf8')
const viewSource = readFileSync(new URL('./BoardView.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../terminal.css', import.meta.url), 'utf8')

test('1안은 승객 우선순위 순서로 렌더한다', () => {
  const sections = ['identity', 'flight', 'departure', 'arrival', 'forecast', 'current-weather']
  const positions = sections.map((name) => source.indexOf(`data-section="${name}"`))
  assert.ok(positions.every((position) => position >= 0))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
})

test('승객용 고정 문구는 짧은 승인 문구를 사용한다', () => {
  for (const label of ['현지 시각', '한국', 'KST', '출발', '탑승구', '도착', '현지', '현재 날씨']) {
    assert.match(source, new RegExp(`<(?:span|small) data-fixed-label>${label}`))
  }
  assert.doesNotMatch(source, /출발 예정|도착 예정|예상 도착|운항 상태/)
})

test('운항 상태 값은 항공편 번호 옆에 tone으로 표시한다', () => {
  assert.match(source, /terminal-board-operation \$\{operation\.tone\}/)
  assert.match(source, /\{value\(operation\.status\)\}/)
  assert.doesNotMatch(source, /운항 상태/)
})

test('보드 로딩과 오류는 전체 열 surface modifier를 사용한다', () => {
  assert.match(source, /terminal-data-surface--\$\{dataState\.phase\}/)
})

test('부분 current metric은 숫자에만 단위를 붙인다', () => {
  assert.match(source, /function metric\(value, unit\)/)
  assert.match(source, /metric\(weather\.current\.feelsLike, '℃'\)/)
  assert.match(source, /metric\(weather\.current\.humidity, '%'\)/)
})

test('사용할 수 없는 예보 cell은 ordinary marker가 있는 한 문구만 표시한다', () => {
  assert.match(source, /function ForecastCell\(\{ point, order \}\)/)
  assert.match(source, /data-signage-text="ordinary">예보 확인 중/)
  assert.match(source, /if \(!point\.available\) return <div className="terminal-forecast-cell"><AnimatedValue mode="value" order=\{order\} data-signage-text="ordinary">예보 확인 중<\/AnimatedValue><\/div>/)
})

test('changing airline logo is a value boundary', () => {
  assert.match(source, /<AnimatedValue mode="value" order=\{6\} className="terminal-board-airline-logo"><img src=\{airlineLogoFor\(airline\.logoKey\)\}/)
  assert.match(css, /\.terminal-board-airline-logo \{[^}]*grid-row: 1 \/ -1/)
})

test('보드는 page 전환 계층을 유지하고 changing values만 전환한다', () => {
  assert.match(viewSource, /className=\{`board-page \$\{transition \? 'is-leaving' : ''\}`\}/)
  assert.match(viewSource, /className="board-page is-entering"/)
  assert.match(source, /import AnimatedValue from '\.\.\/motion\/AnimatedValue\.jsx'/)
  for (const field of ['destination.city', 'airline.flightNumber', 'operation.departure', 'clocks.arrivalLocal', 'weather.current.wind']) {
    assert.match(source, new RegExp(`<AnimatedValue[^>]*>[\\s\\S]{0,180}${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  }
  for (const label of ['출발', '탑승구', '도착', '현지', '한국', '현재 날씨']) {
    assert.doesNotMatch(source, new RegExp(`<AnimatedValue[^>]*>${label}`))
  }
  assert.match(css, /\.board-page\.is-entering \.terminal-board-flight \{ background: transparent; \}/)
  for (const mode of ['motion-split', 'motion-roll', 'motion-wipe', 'motion-fade']) {
    assert.match(css, new RegExp(`\\.${mode}[^}]*\\[data-terminal-motion-value\\]`, 's'))
    assert.doesNotMatch(css, new RegExp(`\\.${mode}[^}]*\\.(?:terminal-board-flight|board-band|board-band-surface)[^}]*?(?:transform|visibility|clip-path|animation)`, 's'))
  }
  assert.doesNotMatch(css, /\.board-band:nth-child\(5\)/)
  assert.doesNotMatch(css, /\.board-band:last-child \.board-band-surface/)
})

test('board column has one destination heading and labels its article', () => {
  assert.match(source, /<article[^>]*aria-labelledby=\{destinationHeadingId\}/)
  assert.match(source, /const destinationHeadingId = `terminal-board-destination-\$\{flight\.id\}`/)
  assert.match(source, /<h2 id=\{destinationHeadingId\} className="terminal-board-city">/)
  assert.doesNotMatch(source, /<section data-section=/)
})

test('current weather and clock values occupy stable label tracks', () => {
  assert.match(source, /className="terminal-current-weather-heading"><AnimatedValue[^>]*>\{destination\.city\}<\/AnimatedValue><span data-fixed-label>현재 날씨<\/span>/)
  assert.match(source, /className="terminal-board-local-date"/)
  assert.match(css, /\.terminal-current-weather-heading \{[^}]*grid-template-columns: 12ch max-content/)
  const localDateRule = css.match(/\.terminal-board-local-date \{[^}]+\}/)?.[0] ?? ''
  assert.match(localDateRule, /grid-template-columns:\s*minmax\(10ch,\s*12ch\)\s+max-content\s+5ch\s+max-content/)
  assert.doesNotMatch(localDateRule, /grid-template-columns:\s*auto\s+auto\s+auto\s+auto/)
})

test('board delay status uses the shared amber token rather than a literal color', () => {
  assert.match(css, /\.terminal-board-flight-id \.terminal-board-operation\.delay \{ color: var\(--level-amber\); \}/)
  const boardDelayRule = css.match(/\.terminal-board-flight-id \.terminal-board-operation\.delay \{[^}]+\}/)?.[0] ?? ''
  assert.doesNotMatch(boardDelayRule, /#f07c19/)
})
