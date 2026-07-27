import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./RouteWeatherLegTable.jsx', import.meta.url), 'utf8')

test('renders the route weather leg table contract for desktop and mobile', () => {
  assert.match(jsx, /NAVLOG/)
  assert.match(jsx, /구간.*거리.*Bearing.*바람.*기온.*위험기상/s)
  assert.match(jsx, /data-label="위험기상"/)
  assert.match(jsx, /data-testid="route-weather-leg-card"/)
  assert.match(jsx, /ETA 또는 연료 계산은 포함하지 않습니다/)
  // 선택고도는 표 머리에만 한 번 — 줄마다 반복하지 않는다.
  assert.doesNotMatch(jsx, /data-label="선택고도"/)
  // 맞바람/뒷바람으로 용어를 통일했다(영문 Headwind/Tailwind 금지).
  assert.match(jsx, /맞바람/)
  // 바람·기온은 평균만 — 최소~최대 범위는 표에 싣지 않는다.
  assert.doesNotMatch(jsx, /minComponentKt|maxComponentKt|minC|maxC/)
  assert.doesNotMatch(jsx, /'Headwind'|'Tailwind'/)
})
