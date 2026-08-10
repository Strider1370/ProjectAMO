export const GROUND_FORECAST_DISPLAY_MODE = Object.freeze({
  SIGNAGE: 'signage',
  CLASSIC: 'classic',
})

export const GROUND_FORECAST_DISPLAY_MODE_STORAGE_KEY = 'ground_forecast_display_mode'

export function normalizeGroundForecastDisplayMode(value) {
  return value === GROUND_FORECAST_DISPLAY_MODE.CLASSIC
    ? GROUND_FORECAST_DISPLAY_MODE.CLASSIC
    : GROUND_FORECAST_DISPLAY_MODE.SIGNAGE
}
