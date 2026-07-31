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
  assert.match(source, />출발</)
  assert.match(source, />탑승구</)
  assert.match(source, />도착</)
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
  assert.match(source, /function ForecastCell\(\{ point \}\)/)
  assert.match(source, /data-signage-text="ordinary">예보 확인 중/)
  assert.match(source, /if \(!point\.available\) return <div className="terminal-forecast-cell">/)
})

test('보드는 기존 page 전환 계층과 band delay 변수를 제공한다', () => {
  assert.match(viewSource, /className=\{`board-page \$\{transition \? 'is-leaving' : ''\}`\}/)
  assert.match(viewSource, /className="board-page is-entering"/)
  assert.equal((source.match(/'--band'/g) || []).length, 6)
  assert.match(css, /\.board-page\.is-entering \.terminal-board-flight \{ background: transparent; \}/)
  assert.match(css, /\.motion-split \.board-page\.is-entering \.terminal-board-flight \{ visibility: hidden; \}/)
  assert.doesNotMatch(css, /\.board-band:nth-child\(5\)/)
  assert.doesNotMatch(css, /\.board-band:last-child \.board-band-surface/)
})

test('board column has one destination heading and labels its article', () => {
  assert.match(source, /<article[^>]*aria-labelledby=\{destinationHeadingId\}/)
  assert.match(source, /const destinationHeadingId = `terminal-board-destination-\$\{flight\.id\}`/)
  assert.match(source, /<h2 id=\{destinationHeadingId\} className="terminal-board-city">/)
  assert.doesNotMatch(source, /<section data-section=/)
})

test('board delay status uses the shared amber token rather than a literal color', () => {
  assert.match(css, /\.terminal-board-flight-id \.terminal-board-operation\.delay \{ color: var\(--level-amber\); \}/)
  const boardDelayRule = css.match(/\.terminal-board-flight-id \.terminal-board-operation\.delay \{[^}]+\}/)?.[0] ?? ''
  assert.doesNotMatch(boardDelayRule, /#f07c19/)
})
