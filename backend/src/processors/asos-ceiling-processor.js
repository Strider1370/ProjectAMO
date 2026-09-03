import config from '../config.js'
import { requestObservedApi } from '../lib/request-observability.js'
import store from '../store.js'
import { ASOS_STATIONS as _ASOS_STATIONS } from '../../../shared/asos-stations.js'

export const ASOS_STATIONS = _ASOS_STATIONS

/** KST 정시를 YYYYMMDDHHmm으로 만든다. hoursAgo=0이면 현재 정시다. */
function formatAsosHourTm(now = new Date(), hoursAgo = 0) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  kst.setUTCHours(kst.getUTCHours() - hoursAgo)
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
 * 위치는 첫 번째 머리글 줄만으로 확인했다 — 두 번째 줄(서브 라벨 "GD" 등)은 토큰 수가
 * 47 대 44로 첫 줄과 어긋나 위치 대조에 쓸 수 없다(예: `VS`의 서브 라벨로 보였던
 * "GD"는 실제로는 뒤쪽의 `ST_GD` 것). 실측 CH_MIN이 기존 코드의 fields[27]과 일치하는
 * 것으로 첫 줄의 인덱스만 교차검증했다.
 *
 * VS 단위: 실측 97개 지점 중 42개(43%)가 정확히 5000에 몰려 있다 — 미터 단위라면
 * 한국의 거의 절반이 정확히 5 km에서 끊긴다는 뜻이라 말이 안 된다. 시정 격자
 * (같은 관측을 객관분석한 값)와 대조하면 서울이 grid 22,800 m인 시각에 station
 * VS 원값은 3750 — ×10 하면 37,500 m로 같은 자릿수가 된다. KMA ASOS 시정은
 * 10 m 단위이므로 `visibility_m = VS * 10`.
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
    const visibility_m = Number.isFinite(vs) && vs !== -9 ? vs * 10 : null

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
async function fetchAsosCeiling(tm) {
  const url = `https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php?tm=${tm}&stn=0&authKey=${config.api.auth_key}`
  const response = await requestObservedApi({
    operation: 'asos_ceiling', url,
    validate: async (value) => { if (!value.ok) throw new Error(`HTTP ${value.status}`) },
  })
  const buffer = await response.arrayBuffer()
  return new TextDecoder('euc-kr').decode(Buffer.from(buffer))
}

export default {
  async process({ now = new Date() } = {}) {
    let tm = null
    let ceilingRows = []
    for (const hoursAgo of [0, 1]) {
      const candidateTm = formatAsosHourTm(now, hoursAgo)
      try {
        const text = await fetchAsosCeiling(candidateTm)
        const rows = parseAsosCeiling(text)
        if (rows.length > 0) {
          tm = candidateTm
          ceilingRows = rows
          break
        }
        console.warn(`asos-ceiling: no observation rows for ${candidateTm}`)
      } catch (e) {
        console.warn(`asos-ceiling: fetch failed for ${candidateTm}:`, e.message)
      }
    }

    if (ceilingRows.length === 0) {
      // 현재와 한 시간 전 모두 자료가 없으면 이전 저장본을 그대로 둔다.
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
