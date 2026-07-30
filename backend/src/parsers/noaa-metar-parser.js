// NOAA Aviation Weather METAR (JSON) → 기존 KMA 정규화 shape.
// 국내(KMA/IWXXM) 파이프라인은 건드리지 않고 해외 공항용으로만 쓴다.
// 입력: aviationweather.gov /api/data/metar?format=json 배열의 한 원소.
// 출력: metar-parser.js(parse)와 동일한 { header, observation, cavok_flag, nsc_flag }.
import {
  formatCloudBase,
  parseWeatherCode,
  parseWind,
  resolveWeatherIconKey,
  pickPrimaryWeatherIcon,
  toMetarTempToken,
} from './parse-utils.js'
import { annotateMetarTac } from './tac-annotation.js'

const SM_TO_M = 1609.34

// NOAA visib는 통계마일(SM) 문자열: "6+", "10+", 정수, "1 1/2"(혼합분수), "3/4"(분수), "" 등.
// KMA store는 시정을 미터 정수로 저장(9999=CAVOK/무제한)하므로 미터로 변환·통일한다.
// "6+"/"10+"처럼 '+'(이상)는 사실상 무제한 → 9999. 계산값이 9999 넘으면 9999로 캡.
export function convertSmToMeters(visib) {
  if (visib == null) return null
  let s = String(visib).trim().toUpperCase().replace(/SM$/, '').trim()
  if (s === '') return null
  const plus = s.endsWith('+')
  if (plus) s = s.slice(0, -1).trim()

  let sm
  if (s.includes(' ')) {
    // 혼합분수 "1 1/2"
    const [whole, frac] = s.split(/\s+/)
    const [n, d] = frac.split('/').map(Number)
    sm = Number(whole) + (d ? n / d : 0)
  } else if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number)
    sm = d ? n / d : NaN
  } else {
    sm = Number(s)
  }
  if (!Number.isFinite(sm)) return null

  if (plus) return 9999
  return Math.min(9999, Math.round(sm * SM_TO_M))
}

// 관측 본문 토큰만 — 경향군(BECMG/TEMPO/INTER) 이후는 예보, RMK 이후는 국가별 자유서식이다.
// 아래 전문 읽기(시정·기온·기압·구름종류·CAVOK)는 전부 이 범위 안에서만 본다.
const TREND_OR_REMARK = ['BECMG', 'TEMPO', 'INTER', 'NOSIG', 'RMK']
export function observationTokens(rawOb) {
  const out = []
  for (const tok of String(rawOb || '').split(/\s+/)) {
    const t = tok.replace(/=$/, '')
    if (TREND_OR_REMARK.includes(t)) break
    if (t) out.push(t)
  }
  return out
}

// 미국·캐나다 외 전문은 시정을 미터로 쓴다(9999, 1500). NOAA JSON의 visib는 이를 SM으로 바꿔
// 놓아서 되돌리면 1500 → 0.93SM → 1497m처럼 어긋난다. 원문에 미터군이 있으면 그것을 쓴다.
export function visibilityMetersFromTac(rawOb) {
  for (const t of observationTokens(rawOb)) {
    if (/^\d{6}Z$/.test(t)) continue // 관측시각
    const m = /^(\d{4})(?:[NSEW]{1,2})?$/.exec(t)
    if (m) return Number(m[1])
  }
  return null
}

// 기온군도 전문을 우선한다. NOAA JSON은 M00(영하 0도대)을 temp:0으로 줘서 부호가 사라진다.
// 숫자값(air/dewpoint)은 소수까지 있는 JSON 쪽을 계속 쓰고, 표시 토큰만 전문에서 가져온다.
export function tempTokenFromTac(rawOb) {
  return observationTokens(rawOb).find((t) => /^M?\d{2}\/M?\d{2}$/.test(t)) || null
}

// 기압도 전문의 기압군을 우선한다. NOAA altim은 항상 hPa로 정규화돼 오는데, 수은주(A3022)를
// 변환·재반올림하는 과정에서 전문값과 1hPa 어긋나는 경우가 있다(A3022 = 1023hPa, altim은 1024).
// Q군은 이미 hPa 정수라 그대로 쓰면 오차가 없다.
const INHG_TO_HPA = 33.8639
export function qnhFromTac(rawOb) {
  for (const t of observationTokens(rawOb)) {
    const m = /^([QA])(\d{4})$/.exec(t)
    if (m) return m[1] === 'Q' ? Number(m[2]) : Math.round((Number(m[2]) / 100) * INHG_TO_HPA)
  }
  return null
}

// 현재기상은 NOAA가 TAC에서 디코드해 준 wxString("-RA BR", "TS VCSH")만 신뢰한다.
// rawOb 토큰 스캔은 오탐이 난다: 색상상태 BLU→BL(blowing), GRN→GR(hail), SNOCLO→SN.
function buildWeather(wxString) {
  if (!wxString) return []
  const out = []
  for (const tok of String(wxString).trim().split(/\s+/)) {
    const w = parseWeatherCode(tok)
    if (w && (w.descriptor || (w.phenomena && w.phenomena.length > 0))) {
      out.push({ ...w, icon_key: resolveWeatherIconKey(w) })
    }
  }
  return out
}

// TAC RVR군: R03/P6000FT/N, R13/3000V4000FT/N, R28/3500VP6000FT, R32L/0800U.
// FT 표기(미국·캐나다)는 미터로 환산 — store/표시 규약이 미터다. R/SNOCLO 등은 무시.
const RVR_TOKEN = /^R(\d{2}[LCR]?)\/([MP]?)(\d{3,4})(?:V([MP]?)(\d{3,4}))?(FT)?\/?[UDN]?$/

function extractRvr(rawOb) {
  if (!rawOb) return []
  const out = []
  for (const tok of String(rawOb).split(/\s+/)) {
    if (tok === 'RMK') break
    const m = RVR_TOKEN.exec(tok.replace(/=$/, ''))
    if (!m) continue
    const [, runway, op, lowRaw, , highRaw, ft] = m
    const toMeters = (v) => (v == null ? null : Math.round(Number(v) * (ft ? 0.3048 : 1)))
    const low = toMeters(lowRaw)
    const high = toMeters(highRaw)
    out.push({
      runway,
      // 변동 보고(3000V4000)는 평균값이 없다 → 운용상 의미 있는 하한을 대표값으로 쓴다.
      mean: low,
      minimum: high != null ? low : null,
      maximum: high,
      tendency: null,
      operator: op === 'P' ? 'ABOVE' : op === 'M' ? 'BELOW' : null,
    })
  }
  return out
}

function buildWind(wdir, wspd, wgst) {
  const variable = String(wdir).toUpperCase() === 'VRB'
  const node = {
    'iwxxm:meanWindDirection': variable ? null : wdir,
    'iwxxm:meanWindSpeed': { '#text': wspd == null ? 0 : wspd, '@_uom': '[kn_i]' },
    '@_variableWindDirection': variable ? 'true' : 'false',
  }
  if (wgst != null) node['iwxxm:windGustSpeed'] = { '#text': wgst, '@_uom': '[kn_i]' }
  return parseWind(node)
}

// NOAA METAR JSON에는 구름 종류 필드가 없다(TAF JSON에는 type이 있다) → 전문에서 CB/TCU를 읽는다.
// 경향군 이후는 예보이므로 제외. 층은 "운량+운고" 키로 짝짓는다.
function cloudTypesFromTac(rawOb) {
  const out = []
  for (const t of observationTokens(rawOb)) {
    const m = /^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)$/.exec(t)
    if (m) out.push({ key: `${m[1]}${m[2]}`, type: m[3] })
  }
  return out
}

// 같은 운량·운고가 두 층인데 한쪽만 대류운인 전문이 있다(FEW033TCU FEW033) → 앞에서부터 소비한다.
function takeCloudType(pending, key) {
  const i = pending.findIndex((p) => p.key === key)
  return i === -1 ? null : pending.splice(i, 1)[0].type
}

function buildClouds(cloudArr, rawOb) {
  if (!Array.isArray(cloudArr)) return []
  const types = cloudTypesFromTac(rawOb)
  return cloudArr
    .map((c) => {
      const cover = c?.cover ? String(c.cover).toUpperCase() : null
      // NOAA는 수직시정(TAC VV002)을 cover:"OVX"로 준다. 프런트 운고·운량 판정은 VV만 인식하므로 환산.
      const amount = cover === 'OVX' ? 'VV' : cover
      const base = Number.isFinite(c?.base) ? c.base : null
      if (!amount) return null
      const code = Number.isFinite(base) ? formatCloudBase(base) : null
      const type = code ? takeCloudType(types, `${amount}${code}`) : null
      return {
        amount,
        base,
        type,
        raw: code ? `${amount}${code}${type || ''}` : amount,
      }
    })
    .filter(Boolean)
}

function buildDisplay(observation, flags, tempToken) {
  return {
    wind: observation.wind.raw,
    visibility: String(observation.visibility.value ?? '//'),
    minimum_visibility: null,
    weather: observation.weather.map((w) => w.raw).join(' '),
    clouds: (flags.cavok || flags.nsc) ? 'NSC' : observation.clouds.map((c) => c.raw).join(' '),
    temperature:
      tempToken
        ?? (observation.temperature.air != null && observation.temperature.dewpoint != null
          ? `${toMetarTempToken(observation.temperature.air)}/${toMetarTempToken(observation.temperature.dewpoint)}`
          : null),
    qnh: observation.qnh.value != null ? `Q${observation.qnh.value}` : null,
    weather_icon: flags.cavok ? 'CAVOK' : pickPrimaryWeatherIcon(observation.weather),
    weather_intensity: observation.weather[0]?.intensity || null,
  }
}

export function parse(entry) {
  if (!entry || !entry.icaoId) return null

  const rawOb = entry.rawOb || null
  const cavok = observationTokens(rawOb).includes('CAVOK')
  const clouds = cavok ? [] : buildClouds(entry.clouds, rawOb)
  const nscFlag = !cavok && clouds.length === 0
  const weather = cavok ? [] : buildWeather(entry.wxString)

  const visValue = cavok ? 9999 : (visibilityMetersFromTac(rawOb) ?? convertSmToMeters(entry.visib))

  const observation = {
    wind: buildWind(entry.wdir, entry.wspd, entry.wgst),
    visibility: {
      value: visValue,
      minimum_value: null,
      minimum_direction_degrees: null,
      cavok,
    },
    weather,
    clouds,
    temperature: {
      air: Number.isFinite(entry.temp) ? entry.temp : null,
      dewpoint: Number.isFinite(entry.dewp) ? entry.dewp : null,
    },
    qnh: { value: qnhFromTac(rawOb) ?? (Number.isFinite(entry.altim) ? Math.round(entry.altim) : null), unit: 'hPa' },
    wind_shear: null,
    rvr: extractRvr(rawOb),
  }
  observation.display = buildDisplay(observation, { cavok, nsc: nscFlag }, tempTokenFromTac(rawOb))

  const reportType = String(entry.metarType || 'METAR').toUpperCase() === 'SPECI' ? 'SPECI' : 'METAR'
  const publishTime = entry.reportTime || null

  return {
    header: {
      icao: entry.icaoId,
      airport_name: entry.name ? String(entry.name).split(',')[0].trim() : null,
      report_type: reportType,
      issue_time: publishTime,
      observation_time: publishTime,
      automated: observationTokens(rawOb).includes('AUTO'),
      // NOAA는 원문 TAC 제공(KMA=IWXXM은 원문 없음). 공항패널 METAR 탭에서 전문 표시용.
      raw_text: rawOb,
      tac: annotateMetarTac(rawOb),
      // #1 출처·시각 배지용. 해외는 NOAA. METAR는 관측 스냅샷이라 유효기간 없음.
      source: {
        identifier: 'NOAA',
        publish_time: publishTime,
        valid_from: null,
        valid_to: null,
        fetch_time: null,
      },
    },
    observation,
    cavok_flag: cavok,
    nsc_flag: nscFlag,
  }
}

export default { parse, convertSmToMeters }
