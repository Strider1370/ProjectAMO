import { color } from '../../../shared/theme/tokens.js'
import { airportStateRingRadius, airportWarningPulseRadius, AIRPORT_WARNING_RING_WIDTH } from './airportMarkerSizing.js'

export const AIRPORT_WARNING_HALO_LAYER = 'kma-weather-airports-warning-halo'
export const AIRPORT_WARNING_RING_LAYER = 'kma-weather-airports-warning-ring'
export const AIRPORT_WARNING_PULSE_LAYER = 'kma-weather-airports-warning-pulse'
export const AIRPORT_WARNING_LAYER_IDS = [AIRPORT_WARNING_PULSE_LAYER, AIRPORT_WARNING_RING_LAYER]
const PERIOD_MS = 1000

export function addAirportWarningLayers(map, source, beforeId) {
  const common = {
    type: 'circle', source, slot: 'top', minzoom: 0,
    filter: ['==', ['get', 'warningActive'], true],
  }
  // 개발 중에 남아 있는 이전 흰 후광도 제거한다.
  if (map.getLayer(AIRPORT_WARNING_HALO_LAYER)) map.removeLayer(AIRPORT_WARNING_HALO_LAYER)
  if (!map.getLayer(AIRPORT_WARNING_PULSE_LAYER)) map.addLayer({
    ...common, id: AIRPORT_WARNING_PULSE_LAYER,
    paint: {
      'circle-radius': airportWarningPulseRadius(),
      'circle-color': color.level.red, 'circle-opacity': 0,
      'circle-stroke-width': 0,
      'circle-radius-transition': { duration: 0 },
      'circle-opacity-transition': { duration: 0 },
    },
  }, map.getLayer(AIRPORT_WARNING_RING_LAYER) ? AIRPORT_WARNING_RING_LAYER : beforeId)
  if (!map.getLayer(AIRPORT_WARNING_RING_LAYER)) map.addLayer({
    ...common, id: AIRPORT_WARNING_RING_LAYER,
    paint: {
      'circle-radius': airportStateRingRadius(true), 'circle-opacity': 0,
      'circle-stroke-color': color.level.red, 'circle-stroke-width': AIRPORT_WARNING_RING_WIDTH,
      'circle-stroke-opacity': 1,
      'circle-stroke-opacity-transition': { duration: 0 },
      'circle-stroke-width-transition': { duration: 0 },
    },
  }, beforeId)
}

// 스타일 설치는 공항 레이어가 소유한다. 비동기 설치/스타일 교체를 기다렸다가 맥동만 시작한다.
export function animateAirportWarnings(map, { hasWarnings, environment = window }) {
  if (!hasWarnings) return () => {}
  const media = environment.matchMedia('(prefers-reduced-motion: reduce)')
  const document = environment.document
  let timer = null
  let running = false
  let stopped = false
  let startedAt = 0

  function paint(progress, opacity) {
    map.setPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-opacity', opacity)
    map.setPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-radius', airportWarningPulseRadius(progress))
  }
  function stopTimer() {
    running = false
    if (timer !== null) environment.clearTimeout(timer)
    timer = null
  }
  function tick() {
    timer = null
    if (stopped || !map.getLayer(AIRPORT_WARNING_PULSE_LAYER)) { stopTimer(); return }
    const progress = ((environment.performance.now() - startedAt) % PERIOD_MS) / PERIOD_MS
    // Mapbox 공식 예제와 같이 바깥으로 커지면서 완전히 사라진 후 다시 시작한다.
    paint(progress, 0.3 * (1 - progress))
    timer = environment.setTimeout(tick, 33)
  }
  function reconcile() {
    if (stopped || !map.getLayer(AIRPORT_WARNING_RING_LAYER) || !map.getLayer(AIRPORT_WARNING_PULSE_LAYER)) { stopTimer(); return }
    // 지도 필터/콘솔 미리보기가 확산 원에도 동일하게 적용되게 한다.
    const filter = map.getFilter(AIRPORT_WARNING_RING_LAYER)
    if (JSON.stringify(filter) !== JSON.stringify(map.getFilter(AIRPORT_WARNING_PULSE_LAYER))) {
      map.setFilter(AIRPORT_WARNING_PULSE_LAYER, filter)
    }
    if (media.matches || document.hidden) {
      const wasRunning = running
      stopTimer()
      // setPaintProperty도 styledata를 발생시키므로 값이 바뀔 때만 쓴다.
      if (wasRunning || map.getPaintProperty(AIRPORT_WARNING_PULSE_LAYER, 'circle-opacity') !== 0) paint(0, 0)
    } else if (!running) {
      running = true
      startedAt = environment.performance.now()
      tick()
    }
  }
  map.on('styledata', reconcile)
  media.addEventListener('change', reconcile)
  document.addEventListener('visibilitychange', reconcile)
  reconcile()
  return () => {
    stopped = true
    stopTimer()
    map.off('styledata', reconcile)
    media.removeEventListener('change', reconcile)
    document.removeEventListener('visibilitychange', reconcile)
  }
}
