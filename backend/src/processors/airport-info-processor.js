import apiClient from '../api-client.js'
import store from '../store.js'
import config from '../config.js'
import airportInfoParser from '../parsers/airport-info-parser.js'

function getLatestBulletinParams() {
  const now = new Date()
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  const hour = kst.getUTCHours()
  const date = kst.toISOString().slice(0, 10).replace(/-/g, '')

  if (hour >= 17) return { base_date: date, base_time: '1700' }
  if (hour >= 6)  return { base_date: date, base_time: '0600' }

  // Before 06:00 KST — use previous day's 1700
  const yesterday = new Date(kst.getTime() - 24 * 3600 * 1000)
  return { base_date: yesterday.toISOString().slice(0, 10).replace(/-/g, ''), base_time: '1700' }
}

async function process() {
  const { base_date, base_time } = getLatestBulletinParams()
  const airports = {}
  const failed = []

  await Promise.allSettled(
    config.airports.map(async ({ icao }) => {
      try {
        const xml = await apiClient.fetchAirportInfo(icao, base_date, base_time)
        const parsed = airportInfoParser.parse(xml, icao)
        if (parsed) {
          airports[icao] = parsed
        } else {
          failed.push(icao)
        }
      } catch {
        failed.push(icao)
      }
    })
  )

  const previous = store.getLiveCached('airport_info')
  if (previous?.airports) {
    for (const icao of failed) {
      if (!airports[icao] && previous.airports[icao]) {
        airports[icao] = { ...previous.airports[icao], _stale: true }
      }
    }
  }

  const result = {
    fetched_at: new Date().toISOString(),
    base_date,
    base_time,
    airports,
  }

  const airportCount = Object.keys(airports).length
  if (airportCount === 0) {
    return { type: 'airport_info', saved: false, reason: 'empty', airports: 0, failed }
  }

  const saveResult = store.save('airport_info', result)
  return { type: 'airport_info', saved: saveResult.saved, airports: airportCount, failed }
}

export { process }
export default { process }
