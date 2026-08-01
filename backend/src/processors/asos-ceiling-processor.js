import config from '../config.js'
import store from '../store.js'
import { ASOS_STATIONS as _ASOS_STATIONS } from '../../../shared/asos-stations.js'

export const ASOS_STATIONS = _ASOS_STATIONS

/**
 * Get the previous whole hour in KST as YYYYMMDDHHmm.
 * Cron runs at :15 past each hour, so we request the top of the previous hour.
 */
function getPreviousHourTm(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  kst.setUTCHours(kst.getUTCHours() - 1)
  kst.setUTCMinutes(0, 0, 0)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  const h = String(kst.getUTCHours()).padStart(2, '0')
  return `${y}${m}${d}${h}00`
}

/**
 * Parse ASOS ceiling text response (EUC-KR encoded).
 * Returns array of { stn, ceiling_ft } for stations with valid CH_MIN (not -9).
 */
export function parseAsosCeiling(text) {
  const rows = text.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.trim().split(/\s+/))

  const result = []
  for (const fields of rows) {
    if (fields.length < 28) continue
    const stn = Number(fields[1])
    const ch_min = Number(fields[27])
    if (!Number.isFinite(ch_min) || ch_min === -9) continue
    const ceiling_ft = ch_min * 100 * 3.281
    result.push({ stn, ceiling_ft })
  }
  return result
}

/**
 * Fetch ASOS ceiling data for a given hour (YYYYMMDDHHmm format).
 * Response is EUC-KR encoded.
 */
async function fetchAsosCeiling(tm, timeoutMs = config.flight_category?.timeout_ms || 30000) {
  const url = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=${tm}&stn=0&authKey=${config.api.auth_key}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const buffer = await response.arrayBuffer()
    const text = new TextDecoder('euc-kr').decode(Buffer.from(buffer))
    return text
  } finally {
    clearTimeout(timer)
  }
}

export default {
  async process() {
    let tm = getPreviousHourTm()
    let text = ''
    try {
      text = await fetchAsosCeiling(tm)
    } catch (e) {
      console.warn(`asos-ceiling: fetch failed for ${tm}:`, e.message)
      // Retry with the hour before
      const kst = new Date(new Date().getTime() + 9 * 3600 * 1000)
      kst.setUTCHours(kst.getUTCHours() - 2)
      kst.setUTCMinutes(0, 0, 0)
      const y = kst.getUTCFullYear()
      const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
      const d = String(kst.getUTCDate()).padStart(2, '0')
      const h = String(kst.getUTCHours()).padStart(2, '0')
      tm = `${y}${m}${d}${h}00`
      try {
        text = await fetchAsosCeiling(tm)
      } catch (e2) {
        console.warn(`asos-ceiling: retry also failed for ${tm}:`, e2.message)
        return { type: 'asos_ceiling', saved: false, reason: 'both fetches failed', station_count: 0 }
      }
    }

    const ceilingRows = parseAsosCeiling(text)
    if (ceilingRows.length === 0) {
      // No ceiling data for either hour — leave previous artifact intact
      return { type: 'asos_ceiling', saved: false, reason: 'no data', station_count: 0 }
    }

    // Build station objects by joining with ASOS_STATIONS
    const stationMap = new Map(ASOS_STATIONS.map(s => [s.stn, s]))
    const stations = []
    for (const row of ceilingRows) {
      const stn_info = stationMap.get(row.stn)
      if (!stn_info) {
        console.warn(`asos-ceiling: station ${row.stn} not in ASOS_STATIONS`)
        continue
      }
      stations.push({
        stn: row.stn,
        name: stn_info.name,
        lat: stn_info.lat,
        lon: stn_info.lon,
        ceiling_ft: row.ceiling_ft,
      })
    }

    const result = {
      type: 'asos_ceiling',
      tm,
      stations,
    }

    const saved = store.save('asos_ceiling', result)
    return {
      type: 'asos_ceiling',
      saved: saved.saved,
      station_count: stations.length,
    }
  },
}
