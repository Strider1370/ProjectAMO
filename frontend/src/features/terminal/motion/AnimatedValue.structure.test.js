import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const board = readFileSync(new URL('../components/BoardFlightColumn.jsx', import.meta.url), 'utf8')
const rail = readFileSync(new URL('../components/RailFlightRow.jsx', import.meta.url), 'utf8')
const motion = readFileSync(new URL('./AnimatedValue.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../terminal.css', import.meta.url), 'utf8')

test('애니메이션 경계는 값에만 식별자를 부여한다', () => {
  assert.match(motion, /data-terminal-motion-value/)
  for (const label of ['출발', '탑승구', '도착', '현지', '한국', '현재 날씨']) {
    assert.doesNotMatch(board, new RegExp(`<AnimatedValue[^>]*>${label}`))
    assert.doesNotMatch(rail, new RegExp(`<AnimatedValue[^>]*>${label}`))
  }
})

test('CASCADE도 행이 아니라 값 묶음에만 시차를 준다', () => {
  assert.doesNotMatch(css, /rail-motion-cascade[^}]*\.rail-flight-row[^}]*transform/s)
  assert.match(css, /rail-motion-cascade[^}]*\[data-terminal-motion-value\]/s)
})

test('AnimatedValue forwards signage and arbitrary element props', () => {
  assert.match(motion, /\.\.\.props/)
  assert.match(motion, /\{\.\.\.props\}/)
  assert.match(motion, /style=\{\{ \.\.\.props\.style, '--terminal-motion-order': order \}\}/)
})

test('reduced motion swaps outgoing and incoming values without an overlap frame', () => {
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.is-leaving \[data-terminal-motion-value\][^}]*opacity: 0 !important/s)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.is-entering \[data-terminal-motion-value\][^}]*opacity: 1 !important/s)
  assert.match(css, /\.is-entering \[data-terminal-motion-value\][^}]*animation: none !important/s)
})

test('all value modes finish before their pages settle', () => {
  assert.match(css, /animation: split-flap-out 220ms/)
  assert.match(css, /animation-delay: calc\(270ms \+ var\(--terminal-motion-order\) \* 18ms\)/)
  assert.match(css, /animation: crossfade-out 420ms/)
  assert.match(css, /animation-delay: calc\(440ms \+ var\(--terminal-motion-order\) \* 14ms\)/)
  assert.match(css, /rail-motion-cascade[\s\S]*?animation-delay: calc\(200ms \+ var\(--terminal-motion-order\) \* 18ms\)/)
})

test('retired motion-unit selectors are absent', () => {
  for (const selector of ['flap-unit', 'roll-unit', 'rail-motion-unit']) assert.doesNotMatch(css, new RegExp(selector))
})
