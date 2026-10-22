// 지도형 브리핑 화면 계산(그리기와 분리). 판정은 서버의 sections.enroute.ribbon이 하고,
// 여기서는 위치·문구·높이만 만든다.
import { phenomenonKo } from '../../../shared/weather/phenomenonKo.js'
import { ICING_PRESENTATION, icingPatternStyle } from '../../../shared/weather/cloudIcingPresentation.js'
import { GKTG_BANDS } from '../../../../../shared/gktg.js'
import { ACI_BANDS } from '../../../../../shared/aci.js'

export const MAP_BRIEFING_MIN_WIDTH = 1280
const VIEW_KEY = 'projectamo.briefingView'

// 고른 보기(map | document)를 브라우저에 기억한다. 저장소가 막혀 있어도 기본값으로 동작.
export function readBriefingView(storage = globalThis.localStorage) {
  try { return storage?.getItem(VIEW_KEY) === 'document' ? 'document' : 'map' } catch { return 'map' }
}
export function writeBriefingView(view, storage = globalThis.localStorage) {
  try { storage?.setItem(VIEW_KEY, view === 'document' ? 'document' : 'map') } catch { /* 기억만 못 할 뿐 */ }
}

const DOCK_KEY = 'projectamo.briefingDock'
// 기억하는 것: 위험 막대 접힘, 단면도 접힘, 독 전체 접힘. 높이 조절 손잡이는 전체 접기 탭이 생기며 뺐다(2026-10-20).
// 단면도 높이 = 화면의 30%(최소 280: 머리 줄·지점 이름을 빼고 그림 약 200px), 위험 막대와 합쳐 화면 절반 이하.
// 위험 막대를 접으면 독이 그만큼 줄고 단면도는 커지지 않는다.
// profileOpen null = 아직 고르지 않음 → 화면 높이 900 이상이면 펼침(768 같은 낮은 화면은 단면 그림이 안 들어간다).
// collapsed = 독 전체(위험 막대·단면) 접힘 — 시간 막대 위 탭만 남는다.
export const DEFAULT_DOCK = { ribbonOpen: true, profileOpen: null, collapsed: false }
export const PROFILE_OPEN_MIN_HEIGHT = 900
const RIBBON_BLOCK_PX = 130 // 위험 막대 제목 + 4줄 + 여백(대략)
const PROFILE_RATIO = 0.3
const PROFILE_MIN_PX = 280

export function readDockState(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(DOCK_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return DEFAULT_DOCK
    return {
      ribbonOpen: saved.ribbonOpen !== false,
      profileOpen: typeof saved.profileOpen === 'boolean' ? saved.profileOpen : null,
      collapsed: saved.collapsed === true,
    }
  } catch { return DEFAULT_DOCK }
}
export function writeDockState(state, storage = globalThis.localStorage) {
  try { storage?.setItem(DOCK_KEY, JSON.stringify(state)) } catch { /* 기억만 못 할 뿐 */ }
}
export function profileOpenFor(dock, viewportHeight) {
  return typeof dock.profileOpen === 'boolean' ? dock.profileOpen : viewportHeight >= PROFILE_OPEN_MIN_HEIGHT
}
export function profileHeightPx(viewportHeight) {
  const max = Math.max(PROFILE_MIN_PX, Math.round(viewportHeight * 0.5) - RIBBON_BLOCK_PX)
  return Math.min(max, Math.max(PROFILE_MIN_PX, Math.round(viewportHeight * PROFILE_RATIO)))
}

// 위험 막대 이름 칸 폭 = 단면도 왼쪽 칸(범례 약 160 + 고도 눈금 약 80). 같은 폭이라 두 가로축이 정렬된다.
export const RIBBON_LABEL_WIDTH_PX = 240

export const LEVEL_KO = { SEV: '심한', MOD: '보통' }
const PHASE_KO = { climb: '상승', cruise: '순항', descent: '강하' }
const SOURCE_CHIP = { SIGMET: 'SIG', AIRMET: 'AIR', TYPHOON: 'TC' }

export function pctOf(nm, totalNm) {
  if (!(totalNm > 0) || !Number.isFinite(nm)) return 0
  return Math.min(100, Math.max(0, (nm / totalNm) * 100))
}

export function formatAltitudeFt(ft) {
  if (!Number.isFinite(ft)) return null
  if (ft <= 0) return 'SFC'
  // 국내 전이고도 14,000ft까지는 ft, 그 위는 FL — 고도 비교 화면(formatAltitude)과 같은 기준.
  return ft > 14000 ? `FL${String(Math.round(ft / 100)).padStart(3, '0')}` : `${Math.round(ft).toLocaleString('en-US')}ft`
}

// SIGMET·AIRMET 고도대는 발표처럼 10,000ft 위를 FL로 쓴다(FL140–200, SFC–10,000ft).
function formatBandAltitude(ft) {
  if (!Number.isFinite(ft)) return null
  if (ft <= 0) return 'SFC'
  return ft > 10000 ? `FL${String(Math.round(ft / 100)).padStart(3, '0')}` : `${Math.round(ft).toLocaleString('en-US')}ft`
}

export function formatBand(bandFt) {
  if (!bandFt) return '고도 미상'
  const low = formatBandAltitude(bandFt.lowFt) ?? 'SFC'
  const high = formatBandAltitude(bandFt.highFt)
  if (!high) return low
  // 둘 다 FL이면 "FL140–200", 아니면 "SFC–FL320"·"SFC–10,000ft".
  return low.startsWith('FL') && high.startsWith('FL') ? `${low}–${high.slice(2)}` : `${low}–${high}`
}

// 줄 왼쪽 상태 칩: 모델 결과(SEV/MOD/없음/불가). 모델이 없는 줄(태풍·시정/운고)은 null.
export function modelChip(row) {
  if (row.status == null) return null
  if (row.status === 'unavailable') return { text: '불가', tone: 'unknown', title: '모델 자료 없음 · 확인 불가' }
  if (row.status === 'none' || !row.model.length) return { text: '없음', tone: 'none', title: '모델 MOD 이상 없음' }
  const level = row.model.some((segment) => segment.level === 'SEV') ? 'SEV' : 'MOD'
  return { text: level, tone: level.toLowerCase(), title: `모델 ${level}` }
}

// 발표 칩: 출처별 하나. 내 고도와 겹치는 발표가 하나라도 있으면 실선.
export function sourceChips(row) {
  const bySource = new Map()
  for (const frame of row.frames) {
    const text = SOURCE_CHIP[frame.source] ?? frame.source
    bySource.set(text, (bySource.get(text) ?? false) || frame.mine)
  }
  return [...bySource].map(([text, mine]) => ({ text, mine }))
}

export function frameTag(frame) {
  const src = frame.source === 'TYPHOON' ? '태풍' : frame.source
  const name = frame.source === 'TYPHOON' ? (frame.label ?? '') : (phenomenonKo(frame.code) ?? frame.label ?? frame.code ?? '')
  const band = frame.source === 'TYPHOON' ? '전 고도' : formatBand(frame.bandFt)
  return `${src} ${name} · ${band} · ${frame.mine ? '내 고도' : '다른 고도'}`.replace(/\s+/g, ' ').trim()
}

// 수치예보 막대는 글자 없이 색만 — 강도·구간·고도는 툴팁(그리고 aria-label)으로.
export function segmentTitle(rowLabel, segment) {
  const altitude = segment.altitudeFt
    ? (segment.phase === 'cruise' ? formatAltitudeFt(segment.altitudeFt.to) : `${formatAltitudeFt(segment.altitudeFt.from)}→${formatAltitudeFt(segment.altitudeFt.to)}`)
    : '전 고도'
  const route = segment.from && segment.to ? ` ${segment.from}→${segment.to}` : ''
  return `수치예보 ${rowLabel} ${segment.level} · ${altitude} ·${route} ${segment.startNm}–${segment.endNm}NM`.replace(/\s+/g, ' ').trim()
}

export function rowEmptyText(row) {
  if (row.model.length || row.frames.length) return null
  if (row.status === 'unavailable') return '단면 자료 없음 · 확인 불가'
  return '모델 MOD 이상 없음'
}

function minutesBetween(fromIso, toIso) {
  const ms = Date.parse(toIso) - Date.parse(fromIso)
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 60000)) : null
}

// 패널 요약 한 줄. formatTime(iso) → 'HH:mm'.
export function summaryCallout(summary, formatTime = (iso) => iso) {
  if (!summary || summary.status === 'unknown') {
    return { tone: 'unknown', badge: '?', title: '난류·착빙 확인 불가', detail: '모델 자료 없음 · SIGMET·AIRMET만 확인' }
  }
  if (summary.status === 'clear') {
    // 일부 구간 자료가 없으면 "위험 없음"이라고 단정하지 않는다.
    if (summary.partial?.length) return { tone: 'unknown', badge: '?', title: '확인된 구간에서 MOD 이상 위험 없음', detail: '일부 구간 모델 자료 없음 · 위험 막대 빗금 확인' }
    return { tone: 'clear', badge: 'OK', title: '내 고도에서 MOD 이상 위험 없음', detail: '수치예보·SIGMET 기준' }
  }
  const top = summary.top
  const phase = top.phase ? `${PHASE_KO[top.phase]} 중 ` : ''
  const minutes = minutesBetween(top.passFrom, top.passTo)
  const source = top.kind === 'frame' ? `${top.source} ` : ''
  const route = top.from && top.to ? `${top.from}→${top.to}` : `${top.startNm}–${top.endNm}NM`
  const time = top.passFrom && top.passTo ? ` · ${formatTime(top.passFrom)}–${formatTime(top.passTo)}` : ''
  return {
    tone: top.level === 'SEV' ? 'sev' : 'mod',
    badge: top.level,
    title: `${phase}${source}${LEVEL_KO[top.level] ?? ''} ${top.label}${minutes ? ` ${minutes}분` : ''}`.replace(/\s+/g, ' ').trim(),
    detail: `${route}${time}`,
  }
}

// 위험 막대 색 = 연직단면도 범례 색. 난류는 단면의 GKTG 칸 색, 착빙은 단면의 착빙 무늬, 대류는 지도 대류영역(실험) 색.
// 막대는 같은 색을 더 진하게(.6) — 단면 칸과 같은 .3이면 흰 바탕에서 MOD 노랑이 거의 안 보였다.
const TURBULENCE_BAR_OPACITY = 0.6
const LEVEL_GRADE = { MOD: 2, SEV: 3 }
function turbulenceColor(grade, alpha) {
  const [r, g, b] = GKTG_BANDS[grade].rgba
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
export function hazardSwatchStyle(rowKey, level) {
  const grade = LEVEL_GRADE[level]
  if (!grade) return {}
  if (rowKey === 'turbulence') return { backgroundColor: turbulenceColor(grade, TURBULENCE_BAR_OPACITY) }
  if (rowKey === 'icing') return icingPatternStyle(grade)
  if (rowKey === 'convection') return { backgroundColor: ACI_BANDS[grade].color }
  return {}
}

function readableTextColor(cssColor) {
  const hex = /^#([0-9a-f]{6})$/i.exec(cssColor ?? '')
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(cssColor ?? '')
  let r, g, b, a = 1
  if (hex) [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
  else if (rgba) { [r, g, b] = rgba.slice(1, 4).map(Number); a = rgba[4] == null ? 1 : Number(rgba[4]) }
  else return '#1f2937'
  // 흰 바탕 위 반투명 → 실제 보이는 색으로 바꿔 밝기를 잰다.
  const [R, G, B] = [r, g, b].map((v) => v * a + 255 * (1 - a))
  return (0.299 * R + 0.587 * G + 0.114 * B) > 150 ? '#1f2937' : '#ffffff'
}

// 줄 왼쪽 강도 칩: 막대와 같은 색의 단색 바탕(착빙은 점무늬 없이 바탕색만) + 읽히는 글자색.
export function hazardChipStyle(rowKey, level) {
  const grade = LEVEL_GRADE[level]
  if (!grade) return {}
  const backgroundColor = rowKey === 'turbulence' ? turbulenceColor(grade, TURBULENCE_BAR_OPACITY)
    : rowKey === 'icing' ? ICING_PRESENTATION[grade].fillColor
      : rowKey === 'convection' ? ACI_BANDS[grade].color : null
  return backgroundColor ? { backgroundColor, color: readableTextColor(backgroundColor) } : {}
}

// 틀 이름표 짧은 판: "SIG 차폐뇌우" / "태풍" — 좁은 틀에서 잘리지 않게(전체는 툴팁).
export function frameShortTag(frame) {
  if (frame.source === 'TYPHOON') return '태풍'
  return `SIG ${phenomenonKo(frame.code) ?? frame.code ?? ''}`.trim()
}

// 지도 경로 위 위험 색 띠 색 = 위험 막대 색(같은 원천). 선이라 무늬 대신 착빙은 바탕색, 태풍은 보라.
export const TYPHOON_LINE_COLOR = '#6d28d9'
export function hazardLineColor(rowKey, level) {
  if (rowKey === 'typhoon') return TYPHOON_LINE_COLOR
  const grade = LEVEL_GRADE[level]
  if (!grade) return null
  if (rowKey === 'turbulence') return turbulenceColor(grade, 1)
  if (rowKey === 'icing') return ICING_PRESENTATION[grade].fillColor
  if (rowKey === 'convection') return ACI_BANDS[grade].color
  return null
}

const MODEL_SOURCE = { turbulence: 'KIM GKTG', icing: 'KIM 착빙', convection: 'KIM 대류영역(실험)' }
const MODEL_RUN = { turbulence: 'ktg', icing: 'kim', convection: 'aci' }

// "2026102000" → "10/20 00Z"
function formatRunCycle(tmfc) {
  const match = /^\d{4}(\d{2})(\d{2})(\d{2})/.exec(String(tmfc ?? ''))
  return match ? `${match[1]}/${match[2]} ${match[3]}Z` : null
}

// 막대·틀 상세 팝오버 내용(2026-10-22 사용자 검토로 정리): 머리 = 현상·강도 하나, 본문 = 언제·어디서·어느 고도,
// 아래 옅은 두 줄 = 출처·근거. formatTime(iso) → 'HH:mm', tzLabel → 'KST'.
export function selectionDetail(selection, { runs = {}, formatTime = (iso) => iso, tzLabel = '' } = {}) {
  if (!selection?.item) return null
  const { row, kind, item } = selection
  const typhoon = item.source === 'TYPHOON'
  const level = kind === 'model' ? item.level : typhoon ? 'TC' : 'SEV'
  const minutes = minutesBetween(item.passFrom, item.passTo)
  const tz = tzLabel ? ` ${tzLabel}` : ''
  const mine = kind === 'model' ? true : Boolean(item.mine) // 수치예보 막대는 내 비행 고도 단면에서 뽑은 것
  const detail = {
    level,
    // 모델: "난류 MOD" / 발표: "SIGMET 심한 난기류" / 태풍: 이름
    title: kind === 'model' ? `${row.label} ${item.level}` : typhoon ? (item.label ?? '태풍') : `${item.source}${item.overseas ? '(해외)' : ''} ${phenomenonKo(item.code) ?? item.label ?? row.label}`,
    mine,
    when: item.passFrom && item.passTo ? `${formatTime(item.passFrom)}–${formatTime(item.passTo)}${tz}${minutes ? ` · ${minutes}분` : ''}` : null,
    route: item.from && item.to ? `${item.from} → ${item.to}` : `${item.startNm}–${item.endNm}NM`,
    altitude: null,
    note: null,
    source: null,
    basis: `${item.startNm}–${item.endNm}NM · 통과 시각은 바람 미반영`,
  }
  let altitude
  if (kind === 'model') {
    const from = formatAltitudeFt(item.altitudeFt?.from), to = formatAltitudeFt(item.altitudeFt?.to)
    altitude = !item.altitudeFt ? '전 고도' : item.phase === 'cruise' || from === to ? `${to} 순항` : `${from}→${to} ${PHASE_KO[item.phase] ?? ''}`.trim()
    // 상승·강하 중 위험은 순항고도로 그려진 지도 레이어에 안 보일 수 있다. 고도는 바꾸지 않고 안내만.
    if (item.phase && item.phase !== 'cruise' && from && to) {
      const [low, high] = item.altitudeFt.from <= item.altitudeFt.to ? [from, to] : [to, from]
      const range = item.phase === 'descent' ? `${high}–${low}` : `${low}–${high}`
      detail.note = `이 위험은 ${range.replace(/ft–/, '–')} · 고도 슬라이더로 확인`
    }
    const run = runs?.[MODEL_RUN[row.key]]
    const cycle = formatRunCycle(run?.tmfc)
    const valid = run?.validTime ? `유효 ${formatTime(run.validTime)}${tz}` : null
    detail.source = [`${MODEL_SOURCE[row.key] ?? 'KIM'}${cycle ? ` ${cycle}` : ''}`, valid].filter(Boolean).join(' · ')
  } else {
    altitude = typhoon ? '전 고도' : formatBand(item.bandFt)
    const valid = item.validFrom && item.validTo ? `유효 ${formatTime(item.validFrom)}–${formatTime(item.validTo)}${tz}` : null
    detail.source = [typhoon ? '태풍 정보' : `${item.source} 발표`, valid].filter(Boolean).join(' · ')
  }
  detail.altitude = `${altitude} · ${mine ? '내 비행 고도' : '다른 고도'}`
  return detail
}

// 위험 막대 틀 ↔ 단면 상자 ↔ 지도 면을 잇는 발표 id(SIGMET 원본 id). 태풍 틀은 단면·지도 면이 없어 null.
export function frameAdvisoryId(frame) {
  return frame?.source === 'SIGMET' || frame?.source === 'AIRMET' ? (frame.sourceId ?? null) : null
}

// "지도·고도·시간 맞추기": 시간 = 구간 통과 가운데 시각, 고도 = 모델 순항 구간은 순항고도·상승/강하 구간은 가운데 고도 /
// 내 고도 발표는 순항고도 / 다른 고도 발표는 발표 고도대 가운데. 고도 없는 대류·태풍은 시간만.
export function focusTarget(selection, { cruiseAltitudeFt = null } = {}) {
  const item = selection?.item
  if (!item) return null
  const from = Date.parse(item.passFrom), to = Date.parse(item.passTo)
  const timeMs = Number.isFinite(from) && Number.isFinite(to) ? Math.round((from + to) / 2) : null
  let altitudeFt = null
  // 순항 단계 막대는 상승 끝에서 시작해도 순항고도로(가운데 고도로 하면 상승 중 고도가 섞인다).
  if (selection.kind === 'model' && item.altitudeFt) altitudeFt = item.phase === 'cruise' && Number.isFinite(cruiseAltitudeFt) ? cruiseAltitudeFt : (item.altitudeFt.from + item.altitudeFt.to) / 2
  else if (selection.kind === 'frame' && item.source !== 'TYPHOON') {
    if (item.mine && Number.isFinite(cruiseAltitudeFt)) altitudeFt = cruiseAltitudeFt
    else if (Number.isFinite(item.bandFt?.highFt)) altitudeFt = ((item.bandFt.lowFt ?? 0) + item.bandFt.highFt) / 2
  }
  return { timeMs, altitudeFt: Number.isFinite(altitudeFt) ? Math.round(altitudeFt) : null }
}

// 막대를 눌러 켠 레이어 안내: "난류(KIM GKTG) 레이어를 켰습니다 · FL250 · 21:00 KST".
// 고도는 KIM 기압면 레이어(난류·구름·착빙)를 켰을 때만 — SIGMET·태풍·대류는 고도 없이 그려진다.
const TOAST_LAYER_LABEL = { turbulence: '난류(KIM GKTG)', cloudIcing: '구름·착빙(KIM)', icing: '착빙(KIM)', aciExperiment: '대류영역(실험)', sigmet: 'SIGMET(국내)', sigmet_intl: 'SIGMET(해외)', airmet: 'AIRMET', typhoon: '태풍' }
const LEVELED_LAYERS = new Set(['turbulence', 'cloudIcing', 'icing'])
export function layerToastText(ids, { levelLabel = null, timeLabel = null } = {}) {
  if (!ids?.length) return null
  // 구름·착빙 묶음과 그 안의 착빙을 함께 켰으면 묶음 이름 하나로.
  const shown = ids.includes('cloudIcing') ? ids.filter((id) => id !== 'icing') : ids
  const layers = shown.map((id) => TOAST_LAYER_LABEL[id] ?? id).join(' · ')
  const level = ids.some((id) => LEVELED_LAYERS.has(id)) ? levelLabel : null
  return { layers, detail: [level, timeLabel].filter(Boolean).join(' · ') }
}

// 위험 막대 한 줄에서 마우스가 가리키는 칸. 틀이 모델 막대를 덮고 있어 둘 다 누를 수 있게 위치로 고른다:
// 틀 이름표 위·틀 위아래 테두리 → 틀, 가운데 → 그 거리의 모델 막대(없으면 틀). 반환: { kind, index } | null.
export function pickRibbonTarget(row, nm, { edge = false, tagFrameIndex = -1 } = {}) {
  if (tagFrameIndex >= 0) return { kind: 'frame', index: tagFrameIndex }
  const inside = (item) => nm >= item.startNm && nm <= item.endNm
  const model = row.model.findIndex(inside)
  const frame = row.frames.findIndex(inside)
  if (frame >= 0 && (edge || model < 0)) return { kind: 'frame', index: frame }
  if (model >= 0) return { kind: 'model', index: model }
  return null
}
