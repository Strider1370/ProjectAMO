import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./RouteWeatherLegTable.jsx', import.meta.url), 'utf8')

test('renders the route weather leg table contract for desktop and mobile', () => {
  assert.match(jsx, /NAVLOG/)
  assert.match(jsx, /구간.*거리\(NM\).*방위.*바람성분.*풍향\/풍속.*기온.*ISA.*위험기상/s)
  // 구간 하나 = 한 줄. 지점 경계 줄(웨이포인트 행)은 내지 않고, 값은 위아래로 쌓지 않는다.
  assert.match(jsx, /buildNavlogRows\(legs, procedures\)\.filter\(\(row\) => row\.kind !== 'waypoint'\)/)
  assert.doesNotMatch(jsx, /route-weather-waypoint|rowSpan|bv-leg-stack/)
  assert.match(jsx, /data-label="바람성분"/)
  assert.match(jsx, /data-label="ISA"/)
  assert.match(jsx, /data-label="위험기상"/)
  // 표 위 한 줄 요약(평균·최대 맞바람, ISA 범위)
  assert.match(jsx, /navlogSummary\(legs\)/)
  // 위험기상 칩은 위험 막대와 같은 MOD 이상 기준(lib/navlogChips.js)
  assert.match(jsx, /legHazardChips\(leg\)/)
  assert.match(jsx, /route-weather-leg-card/)
  assert.match(jsx, /ETA 또는 연료 계산은 포함하지 않습니다/)
  // 선택고도는 표 머리에만 한 번 — 줄마다 반복하지 않는다.
  assert.doesNotMatch(jsx, /data-label="선택고도"/)
  // 맞바람/뒷바람으로 용어를 통일했다(영문 Headwind/Tailwind 금지).
  assert.match(jsx, /맞바람/)
  // 바람·기온은 평균만 — 최소~최대 범위는 표에 싣지 않는다.
  assert.doesNotMatch(jsx, /minComponentKt|maxComponentKt|minC|maxC/)
  // 줄을 가리키거나 누르면 지도에 그 구간을 알린다(호버 미리보기 + 클릭 고정).
  assert.match(jsx, /onMouseEnter:/)
  assert.match(jsx, /onMouseLeave:/)
  assert.match(jsx, /onClick:/)
  assert.match(jsx, /is-pinned/)
  assert.doesNotMatch(jsx, /'Headwind'|'Tailwind'/)
})
