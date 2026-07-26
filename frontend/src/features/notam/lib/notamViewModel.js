// 시간상태(색의 유일한 축) + 고도 포맷(AGL/AMSL 기준면 보존). 순수 함수, 렌더 시점 계산.
import { isScheduleActiveAt } from '../../../../../shared/notam-schedule.js'

export const SOON_WINDOW_MS = 2 * 60 * 60 * 1000 // "곧 발효" 판정 임계값(config 상수)

export const TIME_STATE = {
  active:   { key: 'active',   glyph: '●', label: '발효 중' },
  soon:     { key: 'soon',     glyph: '◐', label: '곧 발효' },
  upcoming: { key: 'upcoming', glyph: '○', label: '예정' },
  conditional: { key: 'conditional', glyph: '◌', label: '시간 확인' },
}

// 카테고리는 아이콘 + 라벨로만 구분(색과 무관). icon 키는 NotamPanel/Tab에서 tabler로 매핑.
export const NOTAM_CATEGORIES = [
  { id: 'prohibited', label: '금지',   icon: 'ban' },
  { id: 'firing',     label: '사격',   icon: 'target-arrow' },
  { id: 'danger',     label: '위험',   icon: 'alert-triangle' },
  { id: 'restricted', label: '제한',   icon: 'shield-half' },
  { id: 'moa',        label: '군작전', icon: 'swords' },
  { id: 'obstacle',   label: '장애물', icon: 'antenna' },
  { id: 'facility',   label: '시설',   icon: 'broadcast' },
  { id: 'other',      label: '기타',   icon: 'dots' },
]

export function deriveTimeState(validFrom, validTo, nowMs, soonWindowMs = SOON_WINDOW_MS) {
  const from = typeof validFrom === 'number' ? validFrom : Date.parse(validFrom)
  const to = typeof validTo === 'number' ? validTo : Date.parse(validTo)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'upcoming'
  if (nowMs >= from && nowMs <= to) return 'active'
  if (nowMs < from && from - nowMs <= soonWindowMs) return 'soon'
  return 'upcoming'
}

// B~C(공지 유효기간) 안이어도 D)에 적힌 시간대 밖이면 실제로는 꺼져 있다.
// D)를 해석 못 하면 'conditional'로 남긴다 — 모르는 걸 꺼짐으로 단정하면 켜진 구역에 들어가게 된다.
export function deriveNotamTime(item, nowMs) {
  const base = deriveTimeState(item.valid_from, item.valid_to, nowMs)
  if (base !== 'active' || !item.schedule_text) return { state: base, note: '' }
  const withinSchedule = isScheduleActiveAt(item.schedule_text, item.valid_from, item.valid_to, nowMs)
  if (withinSchedule === null) return { state: 'conditional', note: 'D) 시간 조건 확인' }
  return withinSchedule ? { state: 'active', note: '' } : { state: 'upcoming', note: 'D) 시간대 외' }
}

export function sortOperationalFirst(items, nowMs) {
  const rank = { critical: 0, warning: 1, info: 2, unclassified: 3 }
  return [...items].sort((a, b) => (rank[a.operational?.priority] ?? 3) - (rank[b.operational?.priority] ?? 3) || RANK[deriveNotamTime(a, nowMs).state] - RANK[deriveNotamTime(b, nowMs).state])
}

function comma(n) {
  return Number(n).toLocaleString('en-US')
}

// 저고도 FL 밴드는 ft로 환산(장애물/저공역은 FL 표기가 어색 — 파일럿은 ft AGL로 인지). FL30=3,000ft 이하만.
const LOW_FL_MAX = 30
function lowFlToFt(v) { return Number(v) === 0 ? 'SFC' : `${comma(Number(v) * 100)}FT` }

// SFC(0)~무제한(FL 999 등) → "전고도". 저고도 FL은 ft. 그 외 FL은 FLxxx. FT는 AGL/AMSL 라벨 보존.
export function formatAltitude(altitude) {
  if (!altitude) return ''
  const { lower, upper, unit, ref } = altitude
  if (unit === 'FL' && Number(lower) === 0 && Number(upper) >= 999) return '전고도'
  if (unit === 'FL' && Number(upper) <= LOW_FL_MAX) return `${lowFlToFt(lower)}–${lowFlToFt(upper)}`
  if (unit === 'FL') return `FL${lower}–FL${upper}`
  const lo = Number(lower) === 0 ? 'SFC' : comma(lower)
  const hi = `${comma(upper)}FT`
  const label = ref ? ` ${ref}` : '' // AGL/AMSL 라벨은 있을 때만; 기준면 불명이면 라벨 없이 값만(spec 안전 규칙)
  return `${lo}–${hi}${label}`
}

// 지도 라벨용 차트식 고도밴드: 상한 / 수평선 / 하한 (기준면 AGL/AMSL 접미사 없음 — 세부는 팝업에서).
// 예) 4920FT AGL → "4920\n───\nSFC", 전고도 → "UNL\n───\nSFC", FL밴드 → "FL120\n───\nFL060".
export function formatAltitudeBand(altitude) {
  if (!altitude) return ''
  const { lower, upper, unit } = altitude
  const isFL = String(unit || '').toUpperCase() === 'FL'
  if (isFL && Number(lower) === 0 && Number(upper) >= 999) return '전고도' // 목록/탭과 동일 라벨(밴드 대신)
  if (isFL && Number(upper) <= LOW_FL_MAX) return `${lowFlToFt(upper)}\n───\n${lowFlToFt(lower)}` // 저고도는 ft
  const up = isFL ? `FL${upper}` : (upper == null ? '무제한' : comma(upper))
  const lo = Number(lower) === 0 ? 'SFC' : (isFL ? `FL${lower}` : comma(lower))
  return `${up}\n───\n${lo}`
}

// 유효기간(NOTAM 최우선 정보). B) ~ C) 를 'MM/DD HH:MM ~ MM/DD HH:MM KST'(또는 Z)로 — 설정탭 tz 반영 + 표기.
export function formatValidPeriod(validFrom, validTo, tz = 'KST') {
  const off = tz === 'KST' ? 9 * 3600000 : 0
  const fmt = (v) => {
    const ms = typeof v === 'number' ? v : Date.parse(v)
    if (!Number.isFinite(ms)) return '—'
    const d = new Date(ms + off)
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  }
  const suffix = tz === 'KST' ? 'KST' : 'Z'
  return `${fmt(validFrom)} ~ ${fmt(validTo)} ${suffix}`
}

// 목적(RMK/FOR) 키워드 → 한글. 없으면 ''.
function purposeKo(t) {
  if (/DRONE|UAV|UAS|무인/i.test(t)) return '드론'
  if (/FIRING|SHOOT|GUNNERY|MISSILE|사격/i.test(t)) return '사격'
  if (/AIR ?SHOW|DISPLAY|에어쇼/i.test(t)) return '에어쇼'
  if (/PARACHUT|강하/i.test(t)) return '강하'
  if (/TRAINING|EXERCISE|\bMIL\b|MILITARY|훈련/i.test(t)) return '훈련'
  return ''
}

// NOTAM E)본문 → 짧은 한글 요약. 정형 유형은 템플릿, 나머지는 노이즈(좌표/RMK/AS FLW) 앞에서 컷.
// 원문은 rawText에 그대로 보존(요약은 표시용).
export function notamSummary(item) {
  const raw = String(item?.summary || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  // 1) 공역 활성: (TEMPO) DANGER/RESTRICTED/PROHIBITED AREA
  const area = raw.match(/(TEMPO\s+)?(DANGER|RESTRICTED|PROHIBITED)\s+AREA/i)
  if (area) {
    const typeKo = { DANGER: '위험구역', RESTRICTED: '제한구역', PROHIBITED: '비행금지구역' }[area[2].toUpperCase()]
    const parts = [(area[1] ? '임시 ' : '') + typeKo]
    const rad = raw.match(/RADIUS\s*([\d.]+)\s*NM/i)
    if (rad) parts.push(`반경 ${rad[1]}NM`)
    else if (/AREA BOUNDED BY/i.test(raw)) parts.push('다각형')
    const p = purposeKo(raw)
    if (p) parts.push(p)
    return parts.join(' · ')
  }
  // 2) GPS RAIM
  if (/GPS\s+RAIM/i.test(raw)) return `GPS 신호 예측불가${/NPA/i.test(raw) ? '(NPA)' : ''}`
  // 3) 장애물(크레인/철탑 등) — 개수
  if (item?.category === 'obstacle' || /\bOBST\b/i.test(raw)) {
    const typeKo = /TOWER\s*CRANE/i.test(raw) ? '타워크레인' : /CRANE/i.test(raw) ? '크레인' : /TOWER|ANTENNA/i.test(raw) ? '철탑' : '장애물'
    const cnt = (raw.match(/\d+\s*\.?\s*(?:PSN|POSITION)\s*:/gi) || []).length
    return `임시 ${typeKo}${cnt > 1 ? ` ${cnt}기` : ''}`
  }
  // 4) 활주로/유도로/주기장 폐쇄
  const clsd = raw.match(/\b(RWY|TWY)\s+([A-Z0-9/]+)\s+CLSD/i)
  if (clsd) return `${clsd[1].toUpperCase() === 'RWY' ? '활주로' : '유도로'} ${clsd[2]} 폐쇄${/WIP/i.test(raw) ? '(공사)' : ''}`
  if (/ACFT\s+STAND.*CLSD/i.test(raw)) return `주기장 폐쇄${/WIP/i.test(raw) ? '(공사)' : ''}`
  // 4-1) 공사(WIP) — 폐쇄 아닌 작업
  const wip = raw.match(/\b(RWY|TWY)\s+([A-Z0-9/]+)\b[^]*?\bWIP\b/i)
  if (wip) return `${wip[1].toUpperCase() === 'RWY' ? '활주로' : '유도로'} ${wip[2]} 공사`
  if (/\bWIP\b/i.test(raw)) return '공사중'
  // 5) 주파수 불가
  const freq = raw.match(/FREQ\s*([\d.]+)\s*MHZ\s*NOT\s*AVBL/i)
  if (freq) {
    const alt = raw.match(/ALTN\s*FREQ\s*([\d.]+)/i)
    return `주파수 ${freq[1]}MHz 불가${alt ? ` → ${alt[1]}` : ''}`
  }
  // 6) 폴백: 좌표/RMK/AS FLW/BOUNDED 앞에서 컷
  const head = raw.split(/\s+(?:ACT\s+)?AS FLW|\s+AREA BOUNDED|\s+RMK\b|\s*\d{6}N\d{7}E|\s+PSN\s*:/i)[0].trim()
  return head.slice(0, 70)
}

const RANK = { active: 0, soon: 1, upcoming: 2 }
export function sortActiveFirst(items, nowMs) {
  return [...items].sort((a, b) =>
    RANK[deriveTimeState(a.valid_from, a.valid_to, nowMs)] -
    RANK[deriveTimeState(b.valid_from, b.valid_to, nowMs)])
}

export default { deriveTimeState, deriveNotamTime, sortOperationalFirst, formatAltitude, formatAltitudeBand, formatValidPeriod, notamSummary, sortActiveFirst, NOTAM_CATEGORIES, TIME_STATE, SOON_WINDOW_MS }
