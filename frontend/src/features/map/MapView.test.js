import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('hidden Mapbox road color keeps alpha high enough for Standard basemap expressions', () => {
  const source = readFileSync(join(__dirname, 'MapView.jsx'), 'utf8')
  const match = source.match(/const HIDDEN_ROAD_COLOR = 'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)'/)

  assert.ok(match, 'HIDDEN_ROAD_COLOR should be an rgba literal')
  assert.ok(Number(match[1]) >= 0.2, 'Mapbox Standard subtracts 0.2 from road alpha in derived color expressions')
})

test('MapView observes container size changes and resizes the Mapbox canvas', () => {
  const source = readFileSync(join(__dirname, 'MapView.jsx'), 'utf8')

  assert.match(source, /new ResizeObserver\(/)
  assert.match(source, /\.observe\(mapContainerRef\.current\)/)
  assert.match(source, /map\.resize\(\)/)
  assert.match(source, /\.disconnect\(\)/)
})

test('MapView connects the one-shot notifier to initial style readiness', () => {
  const source = readFileSync(join(__dirname, 'MapView.jsx'), 'utf8')
  assert.match(source, /import \{ createOneShotNotifier \} from '.\/lib\/createOneShotNotifier\.js'/)
  assert.match(source, /const notifyInitialStyleReady = useMemo\(\(\) => createOneShotNotifier\(onStyleReady\), \[onStyleReady\]\)/)
  assert.match(source, /setIsStyleReady\(true\)\s*\n\s*notifyInitialStyleReady\(\)/)
})

test('MapView passes exact forecast ticks to playback separately from KIM', () => {
  const source = readFileSync(join(__dirname, 'MapView.jsx'), 'utf8')

  // KIM 레이어가 없으면 일기도 시각으로 채운 NWP 시각 목록을 쓴다(timelineNwpTimes).
  // SIGWX HIGH의 앞으로 올 시각(combinedForecastTicks)은 따로 재생에 넘긴다.
  assert.match(source, /const combinedForecastTicks = highTicks\.filter/)
  assert.match(source, /useTimelinePlayback\(\{[\s\S]*?nwpTimes: timelineNwpTimes,[\s\S]*?forecastTimesMs: combinedForecastTicks,/)
  assert.match(source, /const timelineNwpTimes =[\s\S]*?sliderTimes\.length \? sliderTimes : surfaceChart\.times/)
})
