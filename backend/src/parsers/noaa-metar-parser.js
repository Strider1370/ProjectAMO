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

const CLOUD_CODES = new Set(['FEW', 'SCT', 'BKN', 'OVC', 'NSC', 'SKC', 'CLR', 'NCD', 'VV'])

// NOAA METAR JSON엔 구조화된 현재기상 배열이 없어 rawOb 토큰에서 추출한다.
// (알려진 한계 = ceiling: rawOb 토큰 스캔 휴리스틱. 구름/바람/기온/QNH/시정 토큰은 제외.)
function extractPresentWeather(rawOb) {
  if (!rawOb) return []
  const tokens = String(rawOb).split(/\s+/)
  const out = []
  for (const tok of tokens) {
    const t = tok.replace(/=$/, '')
    if (!t || t.length < 2) continue
    if (/^\d/.test(t)) continue // 시정(9999)·활주로 등 숫자 시작
    if (/KT$/.test(t)) continue // 바람
    if (/^Q\d{4}$/.test(t) || /^A\d{4}$/.test(t)) continue // QNH
    if (CLOUD_CODES.has(t.slice(0, 3)) || CLOUD_CODES.has(t)) continue // 구름층
    if (['CAVOK', 'NOSIG', 'RMK', 'AUTO', 'METAR', 'SPECI', 'NSW', 'TEMPO', 'BECMG'].includes(t)) continue
    if (/^R\d{2}/.test(t)) continue // RVR(R25L/...)
    const w = parseWeatherCode(t)
    if (w && (w.descriptor || (w.phenomena && w.phenomena.length > 0))) {
      out.push({ ...w, icon_key: resolveWeatherIconKey(w) })
    }
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

function buildClouds(cloudArr) {
  if (!Array.isArray(cloudArr)) return []
  return cloudArr
    .map((c) => {
      const amount = c?.cover ? String(c.cover).toUpperCase() : null
      const base = Number.isFinite(c?.base) ? c.base : null
      if (!amount) return null
      return {
        amount,
        base,
        raw: Number.isFinite(base) ? `${amount}${formatCloudBase(base)}` : amount,
      }
    })
    .filter(Boolean)
}

function buildDisplay(observation, flags) {
  return {
    wind: observation.wind.raw,
    visibility: String(observation.visibility.value ?? '//'),
    minimum_visibility: null,
    weather: observation.weather.map((w) => w.raw).join(' '),
    clouds: (flags.cavok || flags.nsc) ? 'NSC' : observation.clouds.map((c) => c.raw).join(' '),
    temperature:
      observation.temperature.air != null && observation.temperature.dewpoint != null
        ? `${toMetarTempToken(observation.temperature.air)}/${toMetarTempToken(observation.temperature.dewpoint)}`
        : null,
    qnh: observation.qnh.value != null ? `Q${observation.qnh.value}` : null,
    weather_icon: flags.cavok ? 'CAVOK' : pickPrimaryWeatherIcon(observation.weather),
    weather_intensity: observation.weather[0]?.intensity || null,
  }
}

export function parse(entry) {
  if (!entry || !entry.icaoId) return null

  const rawOb = entry.rawOb || null
  const cavok = /\bCAVOK\b/.test(rawOb || '')
  const clouds = cavok ? [] : buildClouds(entry.clouds)
  const nscFlag = !cavok && clouds.length === 0
  const weather = cavok ? [] : extractPresentWeather(rawOb)

  const visValue = cavok ? 9999 : convertSmToMeters(entry.visib)

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
    qnh: { value: Number.isFinite(entry.altim) ? Math.round(entry.altim) : null, unit: 'hPa' },
    wind_shear: null,
    rvr: [],
  }
  observation.display = buildDisplay(observation, { cavok, nsc: nscFlag })

  const reportType = String(entry.metarType || 'METAR').toUpperCase() === 'SPECI' ? 'SPECI' : 'METAR'
  const publishTime = entry.reportTime || null

  return {
    header: {
      icao: entry.icaoId,
      airport_name: entry.name ? String(entry.name).split(',')[0].trim() : null,
      report_type: reportType,
      issue_time: publishTime,
      observation_time: publishTime,
      automated: /\bAUTO\b/.test(rawOb || ''),
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
