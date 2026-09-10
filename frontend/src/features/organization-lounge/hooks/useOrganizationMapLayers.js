import { useEffect, useState } from 'react'
import { loadChangedWeatherData } from '../../../api/weatherApi.js'

// Public map overlays only. Organization flight validation stays on its own API.
const MAP_LAYERS = Object.fromEntries([
  'hsrMeta', 'hciMeta', 'wissdomMeta', 'qpfMeta', 'echoTopMeta', 'rainviewerMeta', 'satMeta',
  'satVisibleMeta', 'convectiveMeta', 'sigmet', 'sigmetOverseas', 'airmet',
  'lightning', 'sigwxLow', 'notam',
].map((key) => [key, true]))

export default function useOrganizationMapLayers(enabled) {
  const [weather, setWeather] = useState({})
  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    let timer
    async function refresh() {
      try {
        const next = await loadChangedWeatherData(MAP_LAYERS, { deferredKeys: ['sigwxLowHistory'] })
        if (!stopped) setWeather((previous) => ({
          ...previous,
          // A failed request is undefined; an explicit empty response is null.
          ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)),
        }))
      } catch (error) {
        if (!stopped) console.warn('[OrganizationMap] Layer refresh failed:', error.message)
      } finally {
        if (!stopped) timer = setTimeout(refresh, 60_000)
      }
    }
    refresh()
    return () => { stopped = true; clearTimeout(timer) }
  }, [enabled])
  return enabled ? weather : null
}
