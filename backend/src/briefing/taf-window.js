import { categoryFor } from './flight-category.js'
import { ceilingFromClouds } from './airport-summary.js'

function entryMetrics(entry) {
  const visibilityM = entry.visibility?.cavok ? 9999 : entry.visibility?.value
  const ceilingFt = ceilingFromClouds(entry.clouds)
  return { visibilityM, ceilingFt }
}

export function selectTafAtEta(taf, etaIso) {
  const timeline = taf?.timeline ?? []
  if (timeline.length === 0) return null
  const eta = Date.parse(etaIso)
  if (!Number.isFinite(eta)) return null

  let best = null
  for (const entry of timeline) {
    const t = Date.parse(entry.time)
    if (!Number.isFinite(t)) continue
    const delta = Math.abs(t - eta)
    if (!best || delta < best.delta) {
      const { visibilityM, ceilingFt } = entryMetrics(entry)
      best = { delta, entry: { time: entry.time, ...entry.display, category: categoryFor({ visibilityM, ceilingFt, icao: taf?.header?.icao }) } }
    }
  }
  return best?.entry ?? null
}

// ── ⑥ 목적지 리치 모델 (타임라인 막대 + 기간표 + 교체 병렬 + 원문 재구성) ──

const pad2 = (n) => String(n).padStart(2, '0')
const pad3 = (n) => String(n).padStart(3, '0')

function stateCategory({ visibilityM, cavok, clouds, icao }) {
  const vis = cavok ? 9999 : visibilityM
  return categoryFor({ visibilityM: vis, ceilingFt: ceilingFromClouds(clouds), icao })
}
function windText(wind) {
  if (!wind) return '-'
  if (wind.calm) return 'CALM'
  const dir = wind.variable ? 'VRB' : pad3(wind.direction ?? 0)
  return `${dir}/${pad2(wind.speed ?? 0)}kt${Number.isFinite(wind.gust) ? ` G${wind.gust}` : ''}`
}
function visText(visibilityM, cavok) {
  if (cavok) return '≥10km'
  if (!Number.isFinite(visibilityM)) return '-'
  return visibilityM >= 9999 ? '≥10km' : `${(visibilityM / 1000).toFixed(1)}km`
}
function cloudText(clouds, cavok) {
  if (cavok) return 'CAVOK'
  if (!clouds || clouds.length === 0) return 'NSC'
  return clouds.map((c) => c.raw || `${c.amount}${pad3(Math.round((c.base ?? 0) / 100))}`).join(' ')
}
function wxText(wx) { return (wx && wx.length) ? wx.map((w) => w.raw || w).join(' ') : '—' }

function mergeState(base, g) {
  return {
    wind: g.wind ?? base.wind,
    vis: g.vis != null ? g.vis : base.vis,
    cavok: g.cavok_flag ?? base.cavok_flag,
    clouds: g.clouds_touched ? g.clouds : base.clouds,
    wx: g.wx_touched ? g.wx : base.wx,
  }
}
// 필드별 하이라이트 — ② 현재 실황(airport-summary.js field())과 동일 임계값·이진 red.
function fieldLevels(s) {
  const vis = s.cavok ? 9999 : s.vis
  const ceil = ceilingFromClouds(s.clouds)
  const gust = Number(s.wind?.gust)
  const wxRaw = (s.wx && s.wx.length) ? s.wx.map((x) => x.raw || x).join(' ') : ''
  return {
    visLevel: Number.isFinite(vis) && vis < 5000 ? 'red' : null,
    ceilLevel: Number.isFinite(ceil) && ceil < 1000 ? 'red' : null,
    windLevel: Number.isFinite(gust) && gust >= 30 ? 'red' : null,
    wxLevel: wxRaw ? 'red' : null,
  }
}
function periodRow(type, start, end, s, icao) {
  return {
    type, start, end,
    category: stateCategory({ visibilityM: s.vis, cavok: s.cavok, clouds: s.clouds, icao }),
    wind: windText(s.wind), vis: visText(s.vis, s.cavok), clouds: cloudText(s.clouds, s.cavok), wx: wxText(s.wx),
    levels: fieldLevels(s), // { windLevel, visLevel, ceilLevel, wxLevel }
  }
}
function buildPeriods(taf, validity) {
  const base = taf?.base
  if (!base) return []
  const icao = taf?.header?.icao
  const baseState = { wind: base.wind, vis: base.vis, cavok: base.cavok_flag, clouds: base.clouds, wx: base.wx }
  const rows = [periodRow('base', validity.start, validity.end, baseState, icao)]
  for (const g of (taf.change_groups ?? [])) rows.push(periodRow(g.type, g.start, g.end, mergeState(base, g), icao))
  return rows
}
function categoryTimeline(taf) {
  const icao = taf?.header?.icao
  return (taf?.timeline ?? []).map((e) => ({
    time: e.time,
    category: stateCategory({ visibilityM: e.visibility?.value, cavok: e.visibility?.cavok, clouds: e.clouds, icao }),
  }))
}
// ── 원문 TAF 재구성 — 실제 TAC 토큰(03006KT·9999·6000·SCT030 …) ──
function ddhh(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '----'
  return `${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}`
}
function ddhhmm(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '------'
  return `${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`
}
function rawWindTok(w) {
  if (!w) return null
  if (w.calm) return '00000KT'
  const dir = w.variable ? 'VRB' : pad3(Math.round(w.direction ?? 0))
  const gst = Number.isFinite(w.gust) ? `G${pad2(Math.round(w.gust))}` : ''
  return `${dir}${pad2(Math.round(w.speed ?? 0))}${gst}KT`
}
function rawVisTok(vis) {
  if (!Number.isFinite(vis)) return null
  return String(Math.min(9999, Math.round(vis))).padStart(4, '0')
}
function rawCloudTok(clouds) {
  if (!clouds || clouds.length === 0) return 'NSC'
  return clouds.map((c) => c.raw).filter(Boolean).join(' ') || 'NSC'
}
function rawWxTok(wx) { return (wx && wx.length) ? wx.map((w) => w.raw || w).filter(Boolean).join(' ') : null }

function rawBaseSeg(base) {
  if (base.cavok_flag) return [rawWindTok(base.wind), 'CAVOK'].filter(Boolean).join(' ')
  return [rawWindTok(base.wind), rawVisTok(base.vis), rawWxTok(base.wx), rawCloudTok(base.clouds)].filter(Boolean).join(' ')
}
// 변화군은 실제 TAF처럼 그 그룹에서 바뀐 요소만 나열.
function rawGroupSeg(g) {
  if (g.cavok_flag) return 'CAVOK'
  const parts = []
  if (g.wind) parts.push(rawWindTok(g.wind))
  if (g.vis != null) parts.push(rawVisTok(g.vis))
  if (g.wx_touched) { const t = rawWxTok(g.wx); if (t) parts.push(t) }
  if (g.clouds_touched) parts.push(rawCloudTok(g.clouds))
  return parts.join(' ')
}
// 라인 배열 반환(각 라인은 periods와 같은 순서: base + change_groups) → ETA 라인 하이라이트에 사용.
function reconstructRaw(taf) {
  if (!taf?.base) return null
  const h = taf.header ?? {}
  const lines = [`TAF ${h.icao ?? ''} ${ddhhmm(h.issued)}Z ${ddhh(h.valid_start)}/${ddhh(h.valid_end)} ${rawBaseSeg(taf.base)}`]
  for (const g of (taf.change_groups ?? [])) {
    lines.push(`  ${g.type.replace('_', ' ')} ${ddhh(g.start)}/${ddhh(g.end)} ${rawGroupSeg(g)}`)
  }
  return { lines, text: `${lines.join('\n')}=` }
}

// 교체공항 병렬 요약. 교체공항이 선택됐으면(icao) TAF 없어도 표시(noTaf).
function buildAlternate(alternateTaf, etaIso, icao) {
  const resolvedIcao = icao || alternateTaf?.header?.icao || null
  if (!resolvedIcao) return null // 교체공항 미선택
  if (!alternateTaf) return { icao: resolvedIcao, category: null, noTaf: true, validity: null, timeline: [], tafAtEta: null }
  const atEta = selectTafAtEta(alternateTaf, etaIso)
  return {
    icao: resolvedIcao,
    category: atEta?.category ?? null,
    noTaf: false,
    validity: { start: alternateTaf.header?.valid_start ?? null, end: alternateTaf.header?.valid_end ?? null },
    timeline: categoryTimeline(alternateTaf),
    tafAtEta: atEta,
  }
}

// ETA를 담는 기간을 표시(etaActive). base/BECMG는 "가장 늦게 시작해 ETA 이전"인 것(지속 조건),
// TEMPO/PROB는 [start,end)에 ETA가 들면. ETA가 유효기간 밖이면 강조 없음(etaOutOfRange로 안내).
function markEtaActive(periods, etaIso, validity) {
  const eta = Date.parse(etaIso)
  const vs = Date.parse(validity.start)
  const ve = Date.parse(validity.end)
  const outOfRange = Number.isFinite(eta) && Number.isFinite(vs) && Number.isFinite(ve) && (eta < vs || eta > ve)
  if (!Number.isFinite(eta) || outOfRange) return outOfRange
  let prevailingIdx = -1
  let prevailingStart = -Infinity
  periods.forEach((p, i) => {
    const persistent = p.type === 'base' || p.type.includes('BECMG')
    const st = Date.parse(p.start)
    if (persistent && Number.isFinite(st) && st <= eta && st > prevailingStart) { prevailingStart = st; prevailingIdx = i }
    if (!persistent && eta >= Date.parse(p.start) && eta < Date.parse(p.end)) p.etaActive = true // TEMPO/PROB
  })
  if (prevailingIdx >= 0) periods[prevailingIdx].etaActive = true
  return false
}

// 목적지 전체 모델. alternateTaf/alternateIcao = 교체공항 TAF와 ICAO(선택 시 TAF 없어도 표시).
export function buildDestination(taf, etaIso, { alternateTaf = null, alternateIcao = null, flightRule } = {}) {
  const tafAtEta = selectTafAtEta(taf, etaIso)
  const alt = flightRule === 'IFR' ? alternateRequired(taf, etaIso) : { required: null, reason: 'VFR' }
  const validity = { start: taf?.header?.valid_start ?? null, end: taf?.header?.valid_end ?? null }
  const periods = buildPeriods(taf, validity)
  const etaOutOfRange = markEtaActive(periods, etaIso, validity)
  const rawObj = reconstructRaw(taf)
  // 원문 라인 = periods와 동일 순서 → 각 라인에 ETA 활성 여부 부착(프론트에서 그 줄 하이라이트).
  const rawLines = rawObj ? rawObj.lines.map((text, i) => ({ text, etaActive: !!periods[i]?.etaActive })) : []
  return {
    icao: taf?.header?.icao ?? null,
    category: tafAtEta?.category ?? null,
    taf: tafAtEta,
    sourceTaf: taf,
    validity,
    eta: etaIso,
    etaOutOfRange,
    timeline: categoryTimeline(taf),
    periods,
    raw: rawObj?.text ?? null,
    rawLines,
    alternate: buildAlternate(alternateTaf, etaIso, alternateIcao),
    alternateRequired: alt.required,
    alternateReason: alt.reason,
  }
}

// 타임라인은 유효기간을 시간 단위로 덮는다. 그래서 구간 안이면 가장 가까운 항목이 30분을
// 넘게 떨어질 수 없다. 30분을 넘으면 유효기간 밖을 물은 것이다 — 그때 마지막 항목을 돌려주면
// 몇 시간 떨어진 예보로 판정하게 되고, 아무 표시도 남지 않는다.
const NEAREST_LIMIT_MS = 30 * 60 * 1000

function nearestEntry(taf, iso) {
  const timeline = taf?.timeline ?? []
  const target = Date.parse(iso)
  if (timeline.length === 0 || !Number.isFinite(target)) return null
  let best = null
  for (const entry of timeline) {
    const t = Date.parse(entry.time)
    if (!Number.isFinite(t)) continue
    const delta = Math.abs(t - target)
    if (!best || delta < best.delta) best = { delta, entry }
  }
  return best && best.delta <= NEAREST_LIMIT_MS ? best.entry : null
}

// #13 미니마 판정용 — ETA(또는 임의 시각)에 가장 가까운 타임라인 엔트리의 수치(운고 ft·시정 m·카테고리).
// selectTafAtEta는 display+category만 돌려줘 원시 수치가 없다 → 사용자 미니마 선 비교를 위해 숫자를 노출.
export function metricsAt(taf, iso) {
  const entry = nearestEntry(taf, iso)
  if (!entry) return null
  const { visibilityM, ceilingFt } = entryMetrics(entry)
  return { visibilityM, ceilingFt, category: categoryFor({ visibilityM, ceilingFt, icao: taf?.header?.icao }) }
}

// 그 시각의 병합된 현상. 파서가 BECMG 누적·TEMPO/PROB 구간 적용·wx_touched 판정을 끝낸 결과다.
// metricsAt과 같은 항목에서 나오므로 운고·시정과 현상의 시각이 어긋나지 않는다.
export function weatherAt(taf, iso) {
  return nearestEntry(taf, iso)?.weather ?? []
}

// 1-2-3 근사: ETA ±1h 구간에서 운고<2000ft 또는 시정<5000m이면 교체공항 필요.
export function alternateRequired(taf, etaIso) {
  const timeline = taf?.timeline ?? []
  const eta = Date.parse(etaIso)
  if (timeline.length === 0 || !Number.isFinite(eta)) return { required: null, reason: 'TAF 없음' }
  const windowMs = 60 * 60 * 1000

  for (const entry of timeline) {
    const t = Date.parse(entry.time)
    if (!Number.isFinite(t) || Math.abs(t - eta) >= windowMs) continue
    const { visibilityM, ceilingFt } = entryMetrics(entry)
    const lowCeiling = Number.isFinite(ceilingFt) && ceilingFt < 2000
    const lowVis = Number.isFinite(visibilityM) && visibilityM < 5000
    if (lowCeiling || lowVis) {
      return { required: true, reason: 'ETA 앞뒤 1시간 안에 운고 2000ft 미만 또는 시정 5000m 미만이 예보되어 있습니다.' }
    }
  }
  return { required: false, reason: 'ETA 앞뒤 1시간 동안 교체공항 기준(운고 2000ft·시정 5000m)을 충족합니다.' }
}

export default { selectTafAtEta, alternateRequired, metricsAt, weatherAt }

// ── 공항 카드: ETD/ETA ±1시간 TAF 한 줄(지도형 브리핑 6단계) ──
// at = 기준 시각의 우세 예보(시간별 타임라인에서 가장 가까운 항목), changes = 앞뒤 1시간 안에 걸린 다른 예보
// (TEMPO·PROB·BECMG 변화군 + 시간별 우세 예보가 바뀌는 시각). 글은 TAF 표기 그대로(바람 시정 일기 구름).
const WINDOW_MS = 60 * 60 * 1000

function displayText(display) {
  return [display?.wind, display?.visibility, display?.weather && display.weather !== '-' ? display.weather : null, display?.clouds]
    .filter(Boolean).join(' ').trim() || null
}

// 타임라인 항목 글: 미리 만든 display가 있으면 그것, 없으면(직전 발표 보관본) 원시 값으로.
function entryText(entry) {
  if (entry?.display) return displayText(entry.display)
  const cavok = entry?.visibility?.cavok
  const vis = cavok ? 'CAVOK' : Number.isFinite(entry?.visibility?.value) ? String(entry.visibility.value).padStart(4, '0') : null
  const wx = (entry?.weather ?? []).map((w) => w.raw ?? w).join(' ') || null
  const clouds = cavok ? null : (entry?.clouds ?? []).map((c) => c.raw).filter(Boolean).join(' ') || null
  return [entry?.wind?.raw, vis, wx, clouds].filter(Boolean).join(' ').trim() || null
}

function groupText(group) {
  const vis = group.cavok_flag ? 'CAVOK' : Number.isFinite(group.vis) ? String(group.vis).padStart(4, '0') : null
  const wx = (group.wx ?? []).length ? group.wx.map((w) => w.raw ?? w).join(' ') : group.nsw_flag ? 'NSW' : null
  const clouds = group.cavok_flag ? null : (group.clouds ?? []).length ? group.clouds.map((c) => c.raw).join(' ') : group.nsc_flag ? 'NSC' : null
  return [group.wind?.raw, vis, wx, clouds].filter(Boolean).join(' ').trim() || null
}

export function tafWindow(taf, iso, { windowMs = WINDOW_MS } = {}) {
  const center = Date.parse(iso)
  const timeline = taf?.timeline ?? []
  if (!Number.isFinite(center) || timeline.length === 0) return null
  const validStart = Date.parse(taf?.header?.valid_start), validEnd = Date.parse(taf?.header?.valid_end)
  if (Number.isFinite(validStart) && Number.isFinite(validEnd) && (center < validStart || center > validEnd)) {
    // 새 TAF가 아직 발효 전(예: 11Z 발표 · 12Z부터)이면 그 시각에 유효한 것은 직전 발표다.
    const previous = taf?.previous
    const prevStart = Date.parse(previous?.header?.valid_start), prevEnd = Date.parse(previous?.header?.valid_end)
    if (center < validStart && previous?.timeline?.length && center >= prevStart && center <= prevEnd) {
      const window = tafWindow({ header: { icao: taf?.header?.icao, ...previous.header }, timeline: previous.timeline, change_groups: previous.change_groups ?? [] }, iso, { windowMs })
      return window ? { ...window, previous: true } : null
    }
    return { at: null, changes: [], outOfRange: true, issued: taf?.header?.issued ?? null }
  }
  const from = center - windowMs, to = center + windowMs
  const at = nearestEntry(taf, iso)
  const atText = at ? entryText(at) : null
  const changes = []
  // 시간별 우세 예보가 창 안에서 바뀌는 시각
  let previous = atText
  for (const entry of timeline) {
    const t = Date.parse(entry.time)
    if (!Number.isFinite(t) || t <= center || t > to) continue
    const text = entryText(entry)
    if (text && text !== previous) changes.push({ type: '변화', start: entry.time, end: null, text })
    previous = text
  }
  // 창과 겹치는 변화군(TEMPO·PROB·BECMG)
  for (const group of taf?.change_groups ?? []) {
    const start = Date.parse(group.start), end = Date.parse(group.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= from || start >= to) continue
    changes.push({ type: group.type, start: group.start, end: group.end, text: groupText(group) })
  }
  changes.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  return {
    at: at ? { time: at.time, text: atText, category: metricsAt(taf, at.time)?.category ?? null } : null,
    changes,
    outOfRange: false,
    issued: taf?.header?.issued ?? null,
  }
}
