// 지도형 브리핑 화면 계산(그리기와 분리). 판정은 서버의 sections.enroute.ribbon이 하고,
// 여기서는 위치·문구·높이만 만든다.
import { phenomenonKo } from '../../../shared/weather/phenomenonKo.js'

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
    return { tone: 'clear', badge: 'OK', title: '내 고도에서 MOD 이상 위험 없음', detail: summary.unavailable?.length ? '일부 모델 자료 없음' : '수치예보·SIGMET·AIRMET 기준' }
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
