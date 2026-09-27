import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const sidebar = read('../../app/layout/Sidebar.jsx')
const mobileMore = read('../../app/layout/MobileMoreMenu.jsx')
const mapControls = read('../../app/layout/MapInfoControls.jsx')
const mapView = read('../map/MapView.jsx')
const metPanel = read('../weather-overlays/WeatherOverlayPanel.jsx')

test('사이드바에 항적 항목과 패널 연결이 있다', () => {
  assert.match(sidebar, /label: 'ADS-B'/)
  assert.match(sidebar, /'ADS-B':\s+'traffic'/)
  assert.match(sidebar, /counts\.traffic/)
})

test('모바일 ADS-B는 더보기에 있고 지도 정보 버튼에는 없다', () => {
  assert.match(mobileMore, /label: 'ADS-B'/)
  assert.doesNotMatch(mapControls, /activePanel === 'traffic'/)
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
