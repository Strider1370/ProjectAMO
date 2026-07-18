// NOAA Aviation Weather TAF (JSON) → 기존 KMA 정규화 shape.
// 국내(KMA/IWXXM) TAF 파이프라인은 건드리지 않고 해외 공항용으로만 쓴다.
// 입력: /api/data/taf?format=json 배열의 한 원소({ icaoId, issueTime, validTimeFrom/To, rawTAF, fcsts[] }).
// 출력: taf-parser.js(parse)와 동일한 { header, base, change_groups, timeline }.
import {
  parseWeatherCode,
  parseWind,
  resolveWeatherIconKey,
  pickPrimaryWeatherIcon,
} from './parse-utils.js'
import { convertSmToMeters } from './noaa-metar-parser.js'
import { annotateTafTac } from './tac-annotation.js'

const CLEAR_COVERS = new Set(['SKC', 'CLR', 'NSC', 'NCD'])

function unixToIso(sec) {
  if (!Number.isFinite(sec)) return null
  return new Date(sec * 1000).toISOString().replace('.000Z', 'Z')
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v))
}

function buildWind(wdir, wspd, wgst) {
  if (wdir == null && wspd == null) return null
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
  const list = []
  let nsc = false
  for (const c of cloudArr || []) {
    const amount = c?.cover ? String(c.cover).toUpperCase() : null
    if (!amount) continue
    if (CLEAR_COVERS.has(amount)) { nsc = true; continue }
    const base = Number.isFinite(c?.base) ? c.base : null
    const code = Number.isFinite(base) ? String(Math.max(0, Math.round(base / 100))).padStart(3, '0') : null
    list.push({ amount, base, raw: code ? `${amount}${code}` : amount })
  }
  return { list, nsc }
}

function parseWxString(wxString) {
  if (wxString == null) return { value: null, touched: false }
  const s = String(wxString).trim()
  if (s === '' || /^(NSW|NOSIG)$/i.test(s)) return { value: [], touched: true }
  const value = s.split(/\s+/)
    .map((tok) => parseWeatherCode(tok))
    .filter((w) => w && (w.descriptor || (w.phenomena && w.phenomena.length > 0)))
    .map((w) => ({ ...w, icon_key: resolveWeatherIconKey(w) }))
  return { value, touched: true }
}

function parseState(fcst, isBase = false) {
  const wind = buildWind(fcst.wdir, fcst.wspd, fcst.wgst)
  const vis = convertSmToMeters(fcst.visib)
  const wx = parseWxString(fcst.wxString)
  const clouds = buildClouds(fcst.clouds)
  return {
    wind,
    vis,
    wx: wx.value,
    clouds: clouds.list,
    wx_touched: isBase ? true : wx.touched,
    clouds_touched: isBase ? true : (fcst.clouds || []).length > 0,
    cavok_flag: false,
    nsc_flag: clouds.nsc && clouds.list.length === 0,
  }
}

function mapType(fcst) {
  const change = String(fcst.fcstChange || '').toUpperCase()
  const prob = Number.isFinite(fcst.probability) ? fcst.probability : null
  if (change === 'BECMG') return 'BECMG'
  if (change === 'TEMPO') return prob ? `PROB${prob}_TEMPO` : 'TEMPO'
  if (change === 'PROB') return prob ? `PROB${prob}` : 'PROB30'
  return 'FM' // fcstChange null이지만 base가 아닌 추가 세그먼트(FM)
}

function partialMerge(current, change) {
  const next = deepClone(current)
  if (change.wind != null) next.wind = change.wind
  if (change.vis != null) next.vis = change.vis
  if (change.wx_touched === true) next.wx = change.wx
  if (change.clouds_touched === true) {
    next.clouds = change.clouds
    next.nsc_flag = change.nsc_flag === true
  }
  return next
}

function resolveWxByVis(state) {
  const next = deepClone(state)
  const vis = Number(next.vis)
  if (Array.isArray(next.wx) && next.wx.length === 0 && Number.isFinite(vis) && vis >= 1000 && vis < 5000) {
    const br = parseWeatherCode('BR')
    next.wx = [{ ...br, icon_key: resolveWeatherIconKey(br) }]
  }
  return next
}

function formatDisplay(state) {
  const weatherList = state.wx || []
  return {
    wind: state.wind?.raw || null,
    visibility: String(state.vis ?? '//'),
    weather: weatherList.map((w) => w.raw).join(' '),
    clouds: state.nsc_flag ? 'NSC' : (state.clouds || []).map((c) => c.raw).join(' '),
    weather_icon: pickPrimaryWeatherIcon(weatherList),
    weather_intensity: weatherList[0]?.intensity || null,
  }
}

function hourRange(startIso, endIso) {
  const out = []
  const start = new Date(startIso)
  const end = new Date(endIso)
  for (let c = new Date(start); c < end; c = new Date(c.getTime() + 3600 * 1000)) {
    out.push(c.toISOString().replace('.000Z', 'Z'))
  }
  return out
}

export function parse(entry) {
  if (!entry || !entry.icaoId || !Array.isArray(entry.fcsts) || entry.fcsts.length === 0) return null

  const validStart = unixToIso(entry.validTimeFrom)
  const validEnd = unixToIso(entry.validTimeTo)
  if (!validStart || !validEnd) return null

  // fcstChange===null → base/FM 세그먼트, 그 외 → 변화군.
  const segments = entry.fcsts.map((f) => ({
    ...parseState(f, f.fcstChange == null),
    _from: unixToIso(f.timeFrom),
    _to: unixToIso(f.timeTo),
    _raw: f,
  }))

  const baseSegments = segments.filter((s) => s._raw.fcstChange == null)
    .sort((a, b) => (a._from || '').localeCompare(b._from || ''))
  const changeSegments = segments.filter((s) => s._raw.fcstChange != null)

  const base = baseSegments[0] || segments[0]

  // change_groups: 변화군 + 첫 base 이후의 FM 세그먼트(type='FM')
  const change_groups = [
    ...changeSegments.map((s) => ({
      type: mapType(s._raw),
      start: s._from,
      end: s._to,
      wind: s.wind, vis: s.vis, wx: s.wx, clouds: s.clouds,
      wx_touched: s.wx_touched, clouds_touched: s.clouds_touched,
      cavok_flag: s.cavok_flag, nsc_flag: s.nsc_flag,
    })),
    ...baseSegments.slice(1).map((s) => ({
      type: 'FM',
      start: s._from,
      end: s._to,
      wind: s.wind, vis: s.vis, wx: s.wx, clouds: s.clouds,
      wx_touched: true, clouds_touched: true,
      cavok_flag: s.cavok_flag, nsc_flag: s.nsc_flag,
    })),
  ].sort((a, b) => (a.start || '').localeCompare(b.start || ''))

  const becmgList = changeSegments.filter((s) => mapType(s._raw) === 'BECMG')
  const tempoList = changeSegments.filter((s) => /TEMPO|PROB/.test(mapType(s._raw)))

  const timeline = []
  for (const time of hourRange(validStart, validEnd)) {
    // 해당 시각을 덮는 base/FM 세그먼트(가장 늦게 시작한 것) 선택
    let state = null
    for (const seg of baseSegments) {
      if (seg._from && time >= seg._from && (!seg._to || time < seg._to)) state = seg
    }
    state = deepClone(state ? stripMeta(state) : stripMeta(base))

    for (const becmg of becmgList) {
      // 정상 TAF는 시작 시각부터 바로 적용(플리커 방지). 단 BECMG가 유효시작과 동시에
      // 시작하는 비정상 TAF는 BASE가 지속시간 0이 되어 증발하므로 이때만 창 끝에 적용.
      const gate = becmg._from === validStart ? becmg._to : becmg._from
      if (gate && time >= gate) state = partialMerge(state, becmg)
    }
    for (const tempo of tempoList) {
      if (tempo._from && tempo._to && time >= tempo._from && time < tempo._to) state = partialMerge(state, tempo)
    }

    state = resolveWxByVis(state)
    timeline.push({
      time,
      wind: state.wind,
      visibility: { value: state.vis, cavok: state.cavok_flag },
      weather: state.wx || [],
      clouds: state.clouds || [],
      display: formatDisplay(state),
    })
  }

  const issued = unixToIso(entry.issueTime) || entry.issueTime || null

  const parsed = {
    header: {
      icao: entry.icaoId,
      airport_name: entry.name ? String(entry.name).split(',')[0].trim() : null,
      report_type: 'TAF',
      issued,
      valid_start: validStart,
      valid_end: validEnd,
      report_status: /CANCEL/i.test(entry.rawTAF || '') ? 'CANCELLATION' : (entry.prior ? 'CORRECTION' : 'NORMAL'),
      // NOAA는 원문 TAC 제공. 공항패널 TAF 탭에서 전문 표시용.
      raw_text: entry.rawTAF || null,
      tac: annotateTafTac(entry.rawTAF, timeline),
      temperatures: { max: { value: null, time: null }, min: { value: null, time: null } },
      source: {
        identifier: 'NOAA',
        publish_time: issued,
        valid_from: validStart,
        valid_to: validEnd,
        fetch_time: null,
      },
    },
    base: stripMeta(base),
    change_groups,
    timeline,
  }

  if (!parsed.header.valid_start || !parsed.header.valid_end) return null
  return parsed
}

function stripMeta(seg) {
  const { _from, _to, _raw, ...rest } = seg
  return rest
}

export default { parse }
