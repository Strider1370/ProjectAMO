import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const sidebar = read('../../app/layout/Sidebar.jsx')
const mobile = read('../../app/layout/MobileMapOverlay.jsx')
const mapView = read('../map/MapView.jsx')
const metPanel = read('../weather-overlays/WeatherOverlayPanel.jsx')

test('사이드바에 항적 항목과 패널 연결이 있다', () => {
  assert.match(sidebar, /label: 'ADS-B'/)
  assert.match(sidebar, /'ADS-B':\s+'traffic'/)
  assert.match(sidebar, /counts\.traffic/)
})

test('모바일 지도 버튼에 항적이 있다', () => {
  assert.match(mobile, /activePanel === 'traffic'/)
  assert.match(mobile, /trafficCount/)
})

test('기상 패널에는 항적이 남아 있지 않다', () => {
  assert.doesNotMatch(metPanel, /'adsb'/)
  assert.doesNotMatch(metPanel, /title: '항적'/)
})

test('ADS-B 켜기/끄기가 기상 레이어 상태에서 빠졌다', () => {
  assert.doesNotMatch(mapView, /metVisibility\.adsb/)
  assert.match(mapView, /const \[trafficVisible, setTrafficVisible\] = useState\(false\)/)
})

test('MapView가 항적 패널을 렌더하고 대수를 넘긴다', () => {
  assert.match(mapView, /activePanel === 'traffic'/)
  assert.match(mapView, /<TrafficPanel/)
  assert.match(mapView, /traffic: trafficVisible \? 1 : 0/)
})
