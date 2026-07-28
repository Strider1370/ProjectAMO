import apiClient from '../api-client.js'
import store from '../store.js'
import config from '../config.js'
import takeoffForecastParser from '../parsers/takeoff-forecast-parser.js'

// 발표시각(fctm) = 현재 KST 정시. 이륙예보는 매시 발표, fctm 이후 시각들을 돌려준다.
function latestFctm() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  const y = kst.getUTCFullYear()
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}${pad(kst.getUTCHours())}00`
}

async function process({ signal } = {}) {
  const fctm = latestFctm()
  const airports = {}
  const failed = []

  await Promise.allSettled(
    config.airports.map(async ({ icao }) => {
      try {
        const xml = await apiClient.fetchTakeoffFcst(icao, fctm, { signal })
        const parsed = takeoffForecastParser.parse(xml, icao)
        if (parsed) airports[icao] = parsed
        else failed.push(icao)
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error
        failed.push(icao)
      }
    }),
  )
  signal?.throwIfAborted()

  // 실패/공백은 이전 캐시로 stale 유지(airport_info 패턴).
  const previous = store.getCached('takeoff_fcst')
  if (previous?.airports) {
    for (const icao of failed) {
      if (!airports[icao] && previous.airports[icao]) {
        airports[icao] = { ...previous.airports[icao], _stale: true }
      }
    }
  }

  const result = { fetched_at: new Date().toISOString(), fctm, airports }
  const count = Object.keys(airports).length
  if (count === 0) {
    return { type: 'takeoff_fcst', saved: false, reason: 'empty', airports: 0, failed }
  }
  const saveResult = store.save('takeoff_fcst', result)
  return { type: 'takeoff_fcst', saved: saveResult.saved, airports: count, failed }
}

export { process }
export default { process }
