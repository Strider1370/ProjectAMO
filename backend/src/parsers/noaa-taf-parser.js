// NOAA Aviation Weather TAF (JSON) → 기존 KMA 정규화 shape.
// 국내(KMA/IWXXM) TAF 파이프라인은 건드리지 않고 해외 공항용으로만 쓴다.
// 입력: /api/data/taf?format=json 배열의 한 원소({ icaoId, issueTime, validTimeFrom/To, rawTAF, fcsts[] }).
// 출력: taf-parser.js(parse)와 동일한 { header, base, change_groups, timeline }.
import {
  parseWeatherCode,
  parseWind,
  resolveWeatherIconKey,
} from './parse-utils.js'
import { convertSmToMeters } from './noaa-metar-parser.js'
import { annotateTafTac } from './tac-annotation.js'
import { parseTafTac } from './taf-tac-parser.js'
import { buildTafForecast, formatDisplay, partialMerge } from './taf-forecast.js'

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
    // NOAA TAF JSON은 대류운을 type: "CB"로 준다(METAR JSON엔 없는 필드).
    const t = c?.type ? String(c.type).toUpperCase() : null
    const type = t === 'CB' || t === 'TCU' ? t : null
    list.push({ amount, base, type, raw: code ? `${amount}${code}${type || ''}` : amount })
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

// 원문 TAF의 미터 시정군(9999, 3500, 0800). 시각군(3012/3118)·바람(33006KT)·기온군(TX32/3106Z)은
// 슬래시나 접미사가 있어 걸리지 않는다.
export function tacVisibilityMeters(rawTaf) {
  const out = []
  for (const t of String(rawTaf || '').toUpperCase().split(/\s+/)) {
    if (/^\d{4}$/.test(t)) out.push(Number(t))
  }
  return out
}

// NOAA는 TAF 시정도 SM으로 정규화한다: 3500m → 2.17SM → 되돌리면 3492m. METAR와 같은 왕복 손실이라
// 원문 미터군이 있으면 그 값으로 되돌린다. 소수 둘째자리 반올림이라 오차는 최대 ±9m → ±10m 안에서만 스냅.
export function snapVisibilityToTac(meters, tacMeters) {
  if (!Number.isFinite(meters)) return meters
  return tacMeters.find((m) => Math.abs(m - meters) <= 10) ?? meters
}

function parseState(fcst, isBase = false, cavok = false, tacMeters = []) {
  if (cavok) {
    return {
      wind: buildWind(fcst.wdir, fcst.wspd, fcst.wgst),
      vis: 9999,
      wx: [],
      clouds: [],
      wx_touched: true,
      clouds_touched: true,
      cavok_flag: true,
      nsc_flag: false,
    }
  }
  const wind = buildWind(fcst.wdir, fcst.wspd, fcst.wgst)
  const vis = snapVisibilityToTac(convertSmToMeters(fcst.visib), tacMeters)
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

function resolveWxByVis(state) {
  const next = deepClone(state)
  const vis = Number(next.vis)
  if (Array.isArray(next.wx) && next.wx.length === 0 && Number.isFinite(vis) && vis >= 1000 && vis < 5000) {
    const br = parseWeatherCode('BR')
    next.wx = [{ ...br, icon_key: resolveWeatherIconKey(br) }]
  }
  return next
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

  // 원문(TAC)에서 읽은 변화군을 우선 쓴다. NOAA JSON은 변화군마다 앞 상태를 채운 전체 상태라
  // 무엇이 바뀌었는지와 CAVOK 지속 여부를 잃는다. 원문 해석이 NOAA 변화군 시각과 어긋나면 JSON으로 대신한다.
  const fromJson = normalizeFromJson(entry)
  const tac = parseTafTac(entry.rawTAF, { validStart, validEnd })
  const useTac = Boolean(tac) && tac.valid_start === validStart && sameGroupStarts(tac.change_groups, fromJson.change_groups)
  const { base, change_groups } = useTac ? tac : fromJson
  const timeline = buildTimeline(base, change_groups, validStart, validEnd)

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
      parsed_from: useTac ? 'TAC' : 'JSON',
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
    base,
    change_groups,
    timeline,
    forecast: buildTafForecast({ base, change_groups, valid_start: validStart, valid_end: validEnd }),
  }

  if (!parsed.header.valid_start || !parsed.header.valid_end) return null
  return parsed
}

// NOAA JSON fcsts → base + change_groups. 원문을 못 읽을 때만 쓴다.
// BECMG의 timeTo는 다음 변화군 시작이라, 변화 시간대의 끝은 timeBec에서 읽는다.
function normalizeFromJson(entry) {
  const rawTokens = String(entry.rawTAF || '').toUpperCase().split(/\s+/)
  const cavokIndex = rawTokens.indexOf('CAVOK')
  const baseCavok = cavokIndex >= 0 && !rawTokens.slice(0, cavokIndex)
    .some((token) => token === 'BECMG' || token === 'TEMPO' || /^PROB(?:30|40)?$/.test(token) || /^FM\d{6}$/.test(token))
  const tacMeters = tacVisibilityMeters(entry.rawTAF)
  let baseSeen = false
  const segments = entry.fcsts.map((f) => {
    const isBase = f.fcstChange == null
    const cavok = isBase && !baseSeen && baseCavok
    if (isBase) baseSeen = true
    return {
      ...parseState(f, isBase, cavok, tacMeters),
      _from: unixToIso(f.timeFrom),
      _to: unixToIso(f.timeTo),
      _bec: unixToIso(f.timeBec),
      _raw: f,
    }
  })
  const baseSegments = segments.filter((s) => s._raw.fcstChange == null)
    .sort((a, b) => (a._from || '').localeCompare(b._from || ''))
  const changeSegments = segments.filter((s) => s._raw.fcstChange != null)
  const base = stripMeta(baseSegments[0] || segments[0])
  const change_groups = [
    ...changeSegments.map((s) => {
      const type = mapType(s._raw)
      return {
        type,
        start: s._from,
        end: type === 'BECMG' && s._bec ? s._bec : s._to,
        wind: s.wind, vis: s.vis, wx: s.wx, clouds: s.clouds,
        wx_touched: s.wx_touched, clouds_touched: s.clouds_touched,
        cavok_flag: s.cavok_flag, nsc_flag: s.nsc_flag,
      }
    }),
    ...baseSegments.slice(1).map((s) => ({
      type: 'FM',
      start: s._from,
      end: s._to,
      wind: s.wind, vis: s.vis, wx: s.wx, clouds: s.clouds,
      wx_touched: true, clouds_touched: true,
      cavok_flag: s.cavok_flag, nsc_flag: s.nsc_flag,
    })),
  ].sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  return { base, change_groups }
}

function sameGroupStarts(a, b) {
  if (a.length !== b.length) return false
  const x = a.map((g) => g.start).sort()
  const y = b.map((g) => g.start).sort()
  return x.every((v, i) => v === y[i])
}

// 시각별 상태: base에 FM(전체 교체)·BECMG(부분 적용)를 시간순으로 쌓고, TEMPO/PROB를 그 위에 덮는다.
function buildTimeline(base, changeGroups, validStart, validEnd) {
  const persistent = changeGroups.filter((g) => g.type === 'FM' || g.type === 'BECMG')
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  const temporary = changeGroups.filter((g) => /TEMPO|PROB/.test(g.type))
  const timeline = []
  for (const time of hourRange(validStart, validEnd)) {
    let state = deepClone(base)
    for (const g of persistent) {
      if (g.type === 'FM') {
        if (g.start && time >= g.start) state = deepClone(g)
        continue
      }
      // 정상 TAF는 시작 시각부터 바로 적용(플리커 방지). 단 BECMG가 유효시작과 동시에
      // 시작하는 비정상 TAF는 BASE가 지속시간 0이 되어 증발하므로 이때만 창 끝에 적용.
      const gate = g.start === validStart ? g.end : g.start
      if (gate && time >= gate) state = partialMerge(state, g)
    }
    for (const g of temporary) {
      if (g.start && g.end && time >= g.start && time < g.end) state = partialMerge(state, g)
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
  return timeline
}

function stripMeta(seg) {
  const { _from, _to, _raw, ...rest } = seg
  return rest
}

export default { parse }
