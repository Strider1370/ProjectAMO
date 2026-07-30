import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TrafficPanel.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./TrafficPanel.css', import.meta.url), 'utf8')

test('기존 패널 껍데기를 재사용한다', () => {
  assert.match(source, /dev-layer-panel layer-drawer/)
  assert.match(source, /aria-label="항적 필터"/)
})

test('켜기/끄기 스위치와 다섯 구역이 있다', () => {
  assert.match(source, /ADS-B 표시/)
  for (const title of ['소속', '고도', '기종', '검색']) {
    assert.ok(source.includes(title), `구역 없음: ${title}`)
  }
  assert.match(source, /필터 초기화/)
})

test('고도는 슬라이더 두 개(이중 슬라이더)다', () => {
  const ranges = source.match(/type="range"/g) || []
  assert.equal(ranges.length, 2)
  assert.match(source, /ALTITUDE_STEP_FT/)
  assert.match(css, /\.traffic-alt-slider/)
})

test('꺼져 있으면 필터를 비활성하고 안내를 보여준다', () => {
  assert.match(source, /ADS-B를 켜면 지금 떠 있는 소속이 표시됩니다/)
  assert.match(source, /disabled=\{!visible\}/)
})

test('수신 중·조건에 맞는 기체 없음·안 떠 있는 선택을 각각 안내한다', () => {
  assert.match(source, /수신 중/)
  assert.match(source, /조건에 맞는 항공기 없음/)
  assert.match(source, /선택했지만 지금 안 떠 있음/)
})

test('보이는 수와 전체 수를 함께 보여준다', () => {
  assert.match(source, /보이는 항공기/)
  assert.match(source, /\{visibleCount\}/)
  assert.match(source, /\{counts\.total\}/)
})
