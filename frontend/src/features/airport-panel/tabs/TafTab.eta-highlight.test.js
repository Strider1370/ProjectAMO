import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./TafTab.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../AirportPanel.css', import.meta.url), 'utf8')

// ETA 강조는 시간(첫) 칸에만 건다. 값 칸은 여러 시간대에 걸쳐 rowSpan으로 병합돼 있어
// 같이 칠하면 "그 값 전체가 ETA"로 읽히고, 줄 전체에 테두리를 두르면 앞줄에서 시작한
// 병합 칸을 가로지르는 잘린 선이 그어진다.
test('ETA 강조는 시간 칸에만 걸린다', () => {
  assert.match(jsx, /ap-taf-tcol\$\{isEtaPeriod \? ' is-eta' : ''\}/)
  // 값 칸(시정·구름·바람·날씨)에는 ETA 클래스가 붙지 않는다.
  assert.doesNotMatch(jsx, /etaClass/)
  assert.doesNotMatch(jsx, /coversEtaRow/)
})

test('강조는 줄 테두리가 아니라 칸 단위 스타일이다', () => {
  assert.doesNotMatch(css, /tr\.ap-taf-eta-period \{[^}]*outline/)
  assert.match(css, /td\.is-eta \{/)
})

// 브리핑 목적지 예보는 병합 칸이 많아 12px로는 읽기 어려웠다.
test('브리핑 목적지 예보 표는 14px로 읽는다', () => {
  assert.match(css, /\.ap-taf--compact \.ap-taf-table \{[^}]*font-size: var\(--fs-300\)/)
})
