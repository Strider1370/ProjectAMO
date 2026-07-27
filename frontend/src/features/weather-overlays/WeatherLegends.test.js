import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { entriesLeftToRight } from './lib/legendOrder.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, 'WeatherLegends.jsx'), 'utf8')
const panelSource = fs.readFileSync(path.join(here, 'WeatherOverlayPanel.jsx'), 'utf8')
const css = fs.readFileSync(path.join(here, '../map/MapView.css'), 'utf8')

// 토글 버튼은 레이더 타일을 켜는 즉시 눈에 띄도록 WeatherOverlayPanel(레이어 패널)의
// "레이더/위성" 제목 줄로 옮겼다 — 범례 팝업 안에 있으면 찾기 어렵다는 피드백 반영.
test('the radar motion toggle lives in the layer panel, not the legend', () => {
  assert.doesNotMatch(source, /const radarMotionEnabled/)
  assert.doesNotMatch(source, /radar-motion-toggle/)
  assert.match(panelSource, /레이더 에코 이동벡터 표시/)
  assert.match(css, /\.map-view-wrapper \.map-right-legends > \* \{[\s\S]*?pointer-events:\s*auto/)
})

test('all hooks run before the no-visible-legend return', () => {
  const effect = source.indexOf('useEffect(() =>')
  const emptyReturn = source.indexOf('&& !echoTopLegendVisible) return null')
  assert.ok(effect >= 0)
  assert.ok(emptyReturn > effect)
})

test('horizontal legends preserve ascending ramps and reverse only descending sources', () => {
  const ascending = [{ label: 'weak' }, { label: 'strong' }]
  const descending = [{ label: 'strong' }, { label: 'weak' }]
  assert.deepEqual(entriesLeftToRight(ascending).map((entry) => entry.label), ['weak', 'strong'])
  assert.deepEqual(entriesLeftToRight(descending, true).map((entry) => entry.label), ['weak', 'strong'])
})

// 에코탑 범례의 동작 검증은 브라우저 계약(frontend/verification/contracts/echo-top.spec.mjs)이 맡는다.
// 여기 있던 두 테스트는 소스 문자열을 찾는 방식이라, 실제로 렌더되지 않는 코드 경로를 검사하면서도
// 통과했다 — MapView가 bottomDock={!isMobile}을 넘겨 오른쪽 범례(panel)는 어느 화면에서도 렌더되지
// 않는데, 그 경로의 문구만 확인하고 있었다. 계약이 실제 화면에서 문구와 자료 없음 상태를 확인한다.

test('motion note explains what the arrow length means', () => {
  assert.match(source, /길이 = 10분 이동거리/)
  assert.match(source, /예측 아님/)
})
