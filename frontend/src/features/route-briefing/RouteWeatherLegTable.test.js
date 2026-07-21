import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./RouteWeatherLegTable.jsx', import.meta.url), 'utf8')

test('renders the route weather leg table contract for desktop and mobile', () => {
  assert.match(jsx, /경로 구간 기상 브리핑/)
  assert.match(jsx, /구간.*거리.*Course.*선택고도.*바람.*기온.*위험기상/s)
  assert.match(jsx, /data-label="위험기상"/)
  assert.match(jsx, /data-testid="route-weather-leg-card"/)
  assert.match(jsx, /ETA 또는 연료 계산은 포함하지 않습니다/)
})
