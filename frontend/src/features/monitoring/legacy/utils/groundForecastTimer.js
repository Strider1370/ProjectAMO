import { GROUND_FORECAST_CYCLE_MS } from './groundForecastViewModel.js'

export function scheduleGroundForecastAdvance(callback, timerApi = globalThis) {
  const handle = timerApi.setTimeout(callback, GROUND_FORECAST_CYCLE_MS)
  return () => timerApi.clearTimeout(handle)
}
