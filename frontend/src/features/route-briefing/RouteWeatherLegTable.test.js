import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./RouteWeatherLegTable.jsx', import.meta.url), 'utf8')

test('renders the route weather leg table contract for desktop and mobile', () => {
  assert.match(jsx, /NAVLOG/)
  assert.match(jsx, /웨이포인트.*거리.*Bearing.*바람성분.*풍향\/풍속.*기온.*ISA.*위험기상/s)
  // 지점 자체와 그 다음 지점까지의 구간을 별도 행으로 둔다.
  assert.match(jsx, /buildNavlogRows/)
  assert.match(jsx, /data-testid="route-weather-waypoint"/)
  assert.doesNotMatch(jsx, /bv-leg-connector/)
  // 거리 앞 삼각형 표식은 뺐다 — 방위는 바로 아래 줄에 숫자로 있다.
  assert.doesNotMatch(jsx, /bv-leg-direction/)
  // 짝지은 두 값은 가로선으로 가른다.
  assert.match(jsx, /bv-leg-stack/)
  // 웨이포인트 셀은 아래 화살표 영역과, 구간 데이터 셀은 다음 빈 영역과 세로 병합한다.
  assert.match(jsx, /rowSpan=\{waypointRowSpan\}/)
  assert.match(jsx, /rowSpan=\{2\} data-label="거리 · Bearing"/)
  // 짝지은 값은 한 칸에 두 줄로 — 값은 하나도 빼지 않되 열 수를 8에서 5로 줄인다.
  assert.match(jsx, /data-label="바람성분 · 풍향\/풍속"/)
  assert.match(jsx, /data-label="기온 · ISA"/)
  assert.match(jsx, /bv-leg-stack/)
  assert.match(jsx, /data-label="위험기상"/)
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
