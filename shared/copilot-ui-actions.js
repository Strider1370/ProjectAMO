// App-only navigation contract. Never accepts URLs, executable text, arbitrary
// React props, map expressions or setters. The UI owns labels and capability checks.
export const COPILOT_MET_LAYER_IDS = Object.freeze([
  'radarHsr', 'radarHci', 'radarOverseas', 'echoTop', 'satellite', 'satelliteVisible',
  'ci', 'ctps', 'lightning', 'surfaceChart', 'wind', 'temp', 'cloud', 'icing',
  'turbulence', 'sigmet', 'sigmet_intl', 'airmet', 'sigwx', 'typhoon',
  'visibility', 'ceiling', 'terrainHazard',
])

export function validateCopilotUiAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !['schemaVersion', 'type', 'target'].includes(key))
    || value.schemaVersion !== 1
    || !(value.type === 'open_airport' && /^[A-Z]{4}$/.test(value.target ?? '')
      || value.type === 'enable_weather_layer' && COPILOT_MET_LAYER_IDS.includes(value.target))) {
    throw Object.assign(new Error('INVALID_UI_ACTION'), { code: 'INVALID_UI_ACTION' })
  }
  return { schemaVersion: 1, type: value.type, target: value.target }
}
