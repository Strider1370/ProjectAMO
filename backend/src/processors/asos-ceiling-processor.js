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

// NSC 상한(AMOS 경로 stations.js:98과 동일 기준). 이 값 이상은 운항상 운고가 아니다.
// 2026-08-02 16시 실측 원주·대전이 24,936 ft로 이 바로 아래였다 — 경계는 >=(포함).
const NSC_CEILING_FT = 25000

/**
 * Parse ASOS ceiling text response (EUC-KR encoded).
 *
 * 46필드 응답, 0-index 기준(실측 응답의 `#` 머리글로 확인, 2026-08-02):
 *   # YYMMDDHHMI STN WD WS GST GST GST PA PS PT PR TA TD HM PV RN RN RN RN
 *     SD SD SD WC WP WW CA CA CH CT CT CT CT VS SS SI ST TS TE TE TE TE ST WH BF IR IX
 *   #        KST  ID 16 m/s WD WS TM hPa hPa - hPa C C % hPa mm DAY JUN INT HR3
 *     DAY TOT -- -- ---------------------- TOT MID MIN -------- TOP MID LOW GD C 5 10 20 30 SEA m -- - -
 * CA_TOT(전운량) = fields[25], CH_MIN(운고) = fields[27], VS(시정) = fields[32].
 * 표준 배열 추정(전운량 26번째, 시정 33번째, 1-indexed)과 일치했다.
 *
 * VS 단위: 실측 데이터에서 여러 지점이 정확히 3993, 5000처럼 미터 단위로 보이는 값을
 * 내고, 특히 다수 지점이 정확히 5000에서 끊긴다(5 km 상한 표기) — 10 m 단위였다면
 * 50 km 상한이 되어 시정 관측으로는 말이 안 된다. 즉 VS는 이미 미터 단위, 변환 불필요.
 *
 * Returns array of { stn, ceiling_ft, cloud_amount, visibility_m, sky_clear }.
 * - sky_clear: CH_MIN === -9 이고 CA_TOT === 0(진짜 맑음), 또는 CH_MIN이 NSC 상한 이상.
 *   이 경우 ceiling_ft는 null(잴 운고가 없다).
 * - CH_MIN === -9 인데 CA_TOT도 결측(-9)이거나 그 외 애매한 값이면 제외 — 고장난
 *   관측소가 초록(맑음)으로 읽히면 안 된다.
 */
export function parseAsosCeiling(text) {
  const rows = text.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.trim().split(/\s+/))

  const result = []
  for (const fields of rows) {
    if (fields.length < 33) continue
    const stn = Number(fields[1])
    const ch_min = Number(fields[27])
    const ca_tot = Number(fields[25])
    const vs = Number(fields[32])
    if (!Number.isFinite(ch_min)) continue

    const cloud_amount = Number.isFinite(ca_tot) && ca_tot !== -9 ? ca_tot : null
    const visibility_m = Number.isFinite(vs) && vs !== -9 ? vs : null

    if (ch_min === -9) {
      if (ca_tot !== 0) continue // 결측 — 관측소가 값을 못 내고 있다, 그리지 않는다
      result.push({ stn, ceiling_ft: null, cloud_amount, visibility_m, sky_clear: true })
      continue
    }

    // 원값이 100 m 단위라 피트 소수점은 의미가 없다. 반올림하지 않으면
    // 3937.2000000000003 같은 값이 그대로 저장돼 산출물만 지저분해진다.
    const ceiling_ft = Math.round(ch_min * 100 * 3.281)
    if (ceiling_ft >= NSC_CEILING_FT) {
      result.push({ stn, ceiling_ft: null, cloud_amount, visibility_m, sky_clear: true })
    } else {
      result.push({ stn, ceiling_ft, cloud_amount, visibility_m, sky_clear: false })
    }
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
        cloud_amount: row.cloud_amount,
        visibility_m: row.visibility_m,
        sky_clear: row.sky_clear,
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
