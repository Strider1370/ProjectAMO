import { useState } from 'react'
import { MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import { buildTafViewModel, formatTafHour, groupTafSlots, TAF_CATEGORY_COLOR } from '../lib/tafViewModel.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

const TAF_VIEWS = [
  { id: 'timeline', label: '타임라인' },
  { id: 'table', label: '테이블' },
  { id: 'grid', label: '그리드' },
]

function tafWeatherClass(item, baseClass, { includeSpecial = true } = {}) {
  return [
    baseClass,
    item?.hasPrecipitation ? `${baseClass}--precip` : '',
    includeSpecial && item?.isSpecialWeather ? `${baseClass}--special` : '',
  ].filter(Boolean).join(' ')
}

// 원문(TAC) 블록 스타일 — Vite dev CSS HMR(대소문자 파일명) 이슈 회피용 인라인.
export const RAW_TAC_STYLE = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 },
  label: { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b' },
  text: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    padding: '8px 10px', borderRadius: 6, background: 'rgba(15,23,42,0.05)',
    border: '1px solid rgba(15,23,42,0.08)', color: '#0f172a',
  },
}

// NOAA rawTAF는 한 줄로 옴 → 우리가 읽는 TAF 형태로 변화군마다 줄바꿈·들여쓰기.
// FM(DDHHMM)·BECMG·TEMPO·PROBxx(·TEMPO)·RMK 앞에서 개행. PROBxx TEMPO는 한 줄 유지.
function formatTafTac(raw) {
  if (!raw) return raw
  return String(raw)
    .replace(/\s+(FM\d{6}|PROB\d{2}\s+TEMPO|PROB\d{2}|BECMG|TEMPO|RMK)\b/g, '\n  $1')
    .trim()
}

// 연속으로 조건이 같은 시간 슬롯을 하나의 변화구간으로 묶음 (시간별 반복 제거)
function groupTafPeriods(slots) {
  const periods = []
  for (const s of slots) {
    const key = [s.flight?.category, s.weatherLabel, s.windText, s.visibilityText, s.ceilingText].join('|')
    const last = periods[periods.length - 1]
    if (last && last.key === key) last.slots.push(s)
    else periods.push({ key, slots: [s], first: s })
  }
  return periods
}

// 구간 시간범위 라벨 (첫 슬롯 시작 ~ 마지막 슬롯+1h)
function periodRange(period, tz) {
  const first = period.slots[0]
  const lastSlot = period.slots[period.slots.length - 1]
  const endIso = new Date(new Date(lastSlot.time).getTime() + 3600 * 1000).toISOString()
  return `${formatTafHour(first.time, tz)}–${formatTafHour(endIso, tz)}`
}

export default function EnhancedTafTab({ taf, icao }) {
  // 모바일: 테이블 고정(토글 숨김). 데스크톱·태블릿: 타임라인 기본(토글로 전환 가능).
  const [view, setView] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 719px)').matches
      ? 'table'
      : 'timeline',
  )
  const { tz } = useTimeZone()
  if (!taf) return <div className="ap-empty">TAF 데이터 없음</div>

  const { rawTimeline, slots } = buildTafViewModel(taf, icao)
  const periods = groupTafPeriods(slots) // 테이블·그리드용 변화구간 묶음

  return (
    <div className="ap-taf">
      {/* 유효기간·시각·AMD는 섹션 제목바로 이관. 여기는 뷰 토글만 */}
      <div className="ap-taf-header">
        <div className="ap-taf-switch" role="group" aria-label="TAF view">
          {TAF_VIEWS.map((item) => (
            <button key={item.id} type="button" className={`ap-taf-switch-btn${view === item.id ? ' is-active' : ''}`} onClick={() => setView(item.id)} aria-pressed={view === item.id}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rawTimeline.length === 0 && <div className="ap-empty">TAF 시간대 데이터 없음</div>}
      {rawTimeline.length > 0 && slots.length === 0 && <div className="ap-empty">TAF 유효 기간 만료</div>}

      {slots.length > 0 && view === 'timeline' && (
        <div className="ap-taf-timeline">
          <div className="ap-taf-scale" style={{ '--taf-hour-count': slots.length }}>
            {slots.map((item, index) => <span key={index}>{index % 3 === 0 || index === 0 ? formatTafHour(item.time, tz) : ''}</span>)}
          </div>
          {[
            ['비행조건', groupTafSlots(slots, (item) => item.flight.category), (item) => item.flight.category, (item) => ({ background: TAF_CATEGORY_COLOR[item.flight.category] || '#15803d', color: '#fff' })],
            ['날씨', groupTafSlots(slots, (item) => item.weatherLabel), (item) => item.weatherLabel, (item) => ({ background: item.hasPrecipitation ? '#bae6fd' : '#f8fafc', color: item.hasPrecipitation ? '#0c4a6e' : '#0f172a' })],
            ['바람', groupTafSlots(slots, (item) => item.windText), (item) => item.windText, (item) => ({ background: item.highWind ? '#fff1f2' : '#f8fafc', color: item.highWind ? '#be123c' : '#0f172a' })],
            ['시정', groupTafSlots(slots, (item) => item.visibilityText), (item) => item.visibilityText, (item) => ({ background: item.visibilityCategory.bg, color: item.visibilityCategory.valueColor })],
            ['운고', groupTafSlots(slots, (item) => item.ceilingText), (item) => item.ceilingText, (item) => ({ background: item.ceilingCategory.bg, color: item.ceilingCategory.valueColor })],
          ].map(([label, groups, textFn, styleFn], rowIndex) => (
            <div className="ap-taf-line" key={label}>
              <div className="ap-taf-line-label">{label}</div>
              <div className="ap-taf-line-track">
                {groups.map((group, index) => (
                  <div key={index} className={rowIndex === 1 ? tafWeatherClass(group.first, 'ap-taf-seg', { includeSpecial: false }) : 'ap-taf-seg'} style={{ width: group.width, ...styleFn(group.first) }} title={textFn(group.first)}>
                    {label === '날씨' && <WeatherIcon visual={group.first.visual} className="ap-taf-mini-icon" />}
                    {label === '바람' && <MoveUp className="ap-taf-mini-arrow" style={{ transform: `rotate(${group.first.windRotation}deg)` }} />}
                    <span>{textFn(group.first)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length > 0 && view === 'table' && (
        <div className="ap-taf-table-wrap">
          <table className="ap-taf-table">
          <thead><tr><th>시간 · 조건</th><th>시정</th><th>운고</th><th>바람</th><th>날씨</th></tr></thead>
          <tbody>
            {periods.map((p, index) => {
              const item = p.first
              const catColor = TAF_CATEGORY_COLOR[item.flight.category]
              return (
                <tr key={index}>
                  <td className="ap-taf-tcol" style={{ borderLeft: `4px solid ${catColor}` }}>
                    <span className="ap-taf-trange">{periodRange(p, tz)}</span>
                    <span className="ap-taf-tcat" style={{ color: catColor }}>{item.flight.category}</span>
                  </td>
                  <td style={{ color: item.visibilityCategory.valueColor }}>{item.visibilityText}</td>
                  <td style={{ color: item.ceilingCategory.valueColor }}>{item.ceilingText}</td>
                  <td className={item.highWind ? 'is-alert' : ''}>{item.windText}</td>
                  <td className={`ap-taf-wx${item.hasPrecipitation ? ' ap-taf-wx--precip' : ''}${item.isSpecialWeather ? ' ap-taf-wx--special' : ''}`}><WeatherIcon visual={item.visual} className="ap-taf-wx-icon" />{item.weatherLabel}</td>
                </tr>
              )
            })}
          </tbody>
          </table>
        </div>
      )}

      {slots.length > 0 && view === 'grid' && (
        <div className="ap-taf-grid">
          {periods.map((p, index) => {
            const item = p.first
            return (
              <article key={index} className="ap-taf-card">
                <div className="ap-taf-card-head"><span>{periodRange(p, tz)}</span><span className="ap-taf-cat" style={{ background: TAF_CATEGORY_COLOR[item.flight.category] }}>{item.flight.category}</span></div>
                <div className={tafWeatherClass(item, 'ap-taf-card-weather')}><WeatherIcon visual={item.visual} className="ap-taf-card-icon" />{item.weatherLabel}</div>
                <div className="ap-taf-card-row"><span>바람</span><strong className={item.highWind ? 'is-alert' : ''}>{item.windText}</strong></div>
                <div className="ap-taf-card-row"><span>시정</span><strong>{item.visibilityText}</strong></div>
                <div className="ap-taf-card-row"><span>운고</span><strong>{item.ceilingText}</strong></div>
              </article>
            )
          })}
        </div>
      )}

      {/* ── 원문(TAC) — 접이식(기본 접힘). 국내는 재구성본 ── */}
      {taf?.header?.raw_text && (
        <details className="ap-raw-fold">
          <summary className="ap-raw-fold-summary">원문 (TAC)</summary>
          <code style={RAW_TAC_STYLE.text}>{formatTafTac(taf.header.raw_text)}</code>
        </details>
      )}
    </div>
  )
}
