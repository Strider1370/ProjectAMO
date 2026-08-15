import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./RouteWeatherLegTable.jsx', import.meta.url), 'utf8')

test('renders the route weather leg table contract for desktop and mobile', () => {
  assert.match(jsx, /NAVLOG/)
  assert.match(jsx, /구간.*거리.*Bearing.*바람성분.*풍향\/풍속.*기온.*ISA.*위험기상/s)
  // 성분과 실제 풍향·풍속을 따로, 기온과 ISA 편차도 따로 낸다(상용 EFB 관례).
  assert.match(jsx, /data-label="풍향\/풍속"/)
  assert.match(jsx, /data-label="ISA"/)
  assert.match(jsx, /data-label="위험기상"/)
  assert.match(jsx, /data-testid="route-weather-leg-card"/)
  assert.match(jsx, /ETA 또는 연료 계산은 포함하지 않습니다/)
  // 선택고도는 표 머리에만 한 번 — 줄마다 반복하지 않는다.
  assert.doesNotMatch(jsx, /data-label="선택고도"/)
  // 맞바람/뒷바람으로 용어를 통일했다(영문 Headwind/Tailwind 금지).
  assert.match(jsx, /맞바람/)
  // 바람·기온은 평균만 — 최소~최대 범위는 표에 싣지 않는다.
  assert.doesNotMatch(jsx, /minComponentKt|maxComponentKt|minC|maxC/)
  // 줄을 가리키거나 누르면 지도에 그 구간을 알린다(호버 미리보기 + 클릭 고정).
  assert.match(jsx, /onMouseEnter=/)
  assert.match(jsx, /onMouseLeave=/)
  assert.match(jsx, /onClick=/)
  assert.match(jsx, /is-pinned/)
  assert.doesNotMatch(jsx, /'Headwind'|'Tailwind'/)
})

test('renders compact SID STAR IAP summaries that alone control procedure highlighting', () => {
  assert.match(jsx, /procedures = \[\]/)
  assert.match(jsx, /procedure\.type/)
  assert.match(jsx, /procedure-navlog-summary/)
  assert.match(jsx, /procedure\.coordinates/)
  assert.match(jsx, /절차 상세 웨이포인트/)
})
