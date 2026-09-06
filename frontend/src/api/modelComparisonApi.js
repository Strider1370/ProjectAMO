import { MODEL_COMPARISON_AIRPORTS } from '../../../shared/airport-model-comparison.js'

export { MODEL_COMPARISON_AIRPORTS }

export async function fetchModelComparison(icao, { signal } = {}) {
  const normalized = String(icao || '').toUpperCase()
  if (!MODEL_COMPARISON_AIRPORTS.includes(normalized)) throw new Error('unsupported_airport')
  const response = await fetch(`/api/airport/${normalized}/model-comparison`, { signal })
  if (!response.ok) throw new Error(`comparison_http_${response.status}`)
  const payload = await response.json()
  if (!payload || typeof payload !== 'object') throw new Error('comparison_empty_payload')
  if (payload.airport?.icao !== normalized) throw new Error('comparison_airport_mismatch')
  return payload
}
