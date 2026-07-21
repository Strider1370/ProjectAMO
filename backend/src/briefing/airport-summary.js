import { categoryDetail, levelForCategory } from './flight-category.js'

export function ceilingFromClouds(clouds) {
  const bases = (clouds ?? [])
    .filter((c) => c && (c.amount === 'BKN' || c.amount === 'OVC') && Number.isFinite(c.base))
    .map((c) => c.base)
  return bases.length ? Math.min(...bases) : null
}

function field(text, flag) { return { text: text ?? '-', flag: Boolean(flag) } }

// 매트릭스 표출용 포맷 (§5-B): 바람 270/12kt·돌풍 G28, 시정 ≥10km/3.2km.
function formatWindKt(wind) {
  if (!wind) return '-'
  if (wind.calm) return 'CALM'
  const spd = String(wind.speed ?? 0).padStart(2, '0')
  const dir = wind.variable ? 'VRB' : String(wind.direction ?? 0).padStart(3, '0')
  return `${dir}/${spd}kt`
}
function formatVisibilityKm(visibilityM) {
  if (!Number.isFinite(visibilityM)) return '-'
  if (visibilityM >= 9999) return '≥10km'
  return `${(visibilityM / 1000).toFixed(1)}km`
}

// 원문 METAR 재구성 — IWXXM엔 원본 TAC 문자열이 없어 파싱데이터로 재조립.
// (display 토큰은 파서가 이미 TAC 형태로 만든 것: wind '27008KT', clouds 'BKN008', temp '15/13', qnh 'Q1009')
function metarDdhhmm(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z`
}
function reconstructMetarRaw(metar) {
  const obs = metar?.observation
  if (!obs) return null
  const h = metar.header ?? {}
  const cavok = obs.visibility?.cavok
  const parts = [h.report_type || 'METAR', h.icao, metarDdhhmm(h.observation_time), obs.display?.wind]
  if (cavok) {
    parts.push('CAVOK')
  } else {
    if (Number.isFinite(obs.visibility?.value)) parts.push(String(Math.min(9999, obs.visibility.value)).padStart(4, '0'))
    if (obs.display?.weather) parts.push(obs.display.weather)
    parts.push(obs.display?.clouds || 'NSC')
  }
  parts.push(obs.display?.temperature, obs.display?.qnh)
  return `${parts.filter(Boolean).join(' ')}=`
}

// METAR observation.rvr([{runway, mean}]) → "R15L/2000m, ..."; 보고 없으면 "2000+"(저시정 아님).
// frontend shared/weather/helpers.js formatRvr와 동일 규칙(런타임 분리라 각자 보유).
function formatRvr(obs) {
  const entries = Array.isArray(obs?.rvr) ? obs.rvr : []
  const parts = entries
    .map((r) => (r?.runway && Number.isFinite(r?.mean) ? `R${r.runway}/${r.mean}m` : null))
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '2000+'
}

export function summarizeAirport(role, metar) {
  if (!metar?.observation) {
    return { role, icao: metar?.header?.icao ?? null, category: 'UNKNOWN', driver: null, level: 'gray', fields: {}, raw: null, observationTime: null, reportType: null, source: null }
  }
  const obs = metar.observation
  const visibilityM = obs.visibility?.cavok ? 9999 : obs.visibility?.value
  const ceilingFt = ceilingFromClouds(obs.clouds)
  const { category, driver } = categoryDetail({ visibilityM, ceilingFt, icao: metar.header?.icao })
  const gust = obs.wind?.gust

  const tempText = obs.display?.temperature ? `${obs.display.temperature}℃` : null
  const rvrText = formatRvr(obs)
  const fields = {
    wind: { ...field(formatWindKt(obs.wind), Number.isFinite(gust) && gust >= 30), gust: Number.isFinite(gust) ? gust : null },
    visibility: field(formatVisibilityKm(visibilityM), Number.isFinite(visibilityM) && visibilityM < 5000),
    rvr: field(rvrText, rvrText !== '2000+'), // 실제 RVR 보고(저시정) 시 강조, 아니면 2000+
    ceiling: field(obs.display?.clouds, Number.isFinite(ceilingFt) && ceilingFt < 1000),
    temp: field(tempText, false),
    weather: field(obs.display?.weather || '-', (obs.weather ?? []).length > 0),
    qnh: field(obs.display?.qnh, false),
  }

  return {
    role,
    icao: metar.header?.icao ?? null,
    category,
    driver, // 'ceiling' | 'visibility' | 'both' — 배너 이유 노출용
    level: levelForCategory(category),
    fields,
    observationTime: metar.header?.observation_time ?? null,
    reportType: metar.header?.report_type ?? null, // 'METAR' | 'SPECI'
    source: metar.header?.source ?? null, // #1 출처·시각 배지(KMA·발표·수신)
    raw: reconstructMetarRaw(metar), // 원문 METAR 재구성(IWXXM라 원본 없음 → 파싱데이터 재조립)
    metar: {
      header: {
        icao: metar.header?.icao,
        report_type: metar.header?.report_type,
        issue_time: metar.header?.issue_time,
        observation_time: metar.header?.observation_time,
        source: metar.header?.source,
        raw_text: metar.header?.raw_text,
        tac: metar.header?.tac,
      },
      observation: metar.observation,
    },
  }
}

export default { ceilingFromClouds, summarizeAirport }
