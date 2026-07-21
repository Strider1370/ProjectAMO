import { useState } from 'react'
import { MoveUp } from 'lucide-react'
import { buildTafViewModel, buildTafTacLines, formatTafHour, formatTafPeriodRange, groupTafSlots, TAF_CATEGORY_COLOR } from '../lib/tafViewModel.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import '../AirportPanel.css'

function tafWeatherClass(item, baseClass, { includeSpecial = true } = {}) {
  return [
    baseClass,
    item?.hasPrecipitation ? `${baseClass}--precip` : '',
    includeSpecial && item?.isSpecialWeather ? `${baseClass}--special` : '',
  ].filter(Boolean).join(' ')
}

function CloudText({ value }) {
  return <span className="ap-taf-clouds">{String(value).split(/\s+/).filter(Boolean).map((cloud, index) => <span className={/CB$/.test(cloud) ? 'ap-taf-cloud--cb' : /^(BKN|OVC|VV)/.test(cloud) ? 'ap-taf-cloud--ceiling' : undefined} key={`${cloud}-${index}`}>{cloud}{' '}</span>)}</span>
}

// 연속으로 조건이 같은 시간 슬롯을 하나의 변화구간으로 묶음 (시간별 반복 제거)
function groupTafPeriods(slots) {
  const periods = []
  for (const s of slots) {
    const key = [s.flight?.category, s.weatherText, s.windText, s.visibilityText, s.cloudText].join('|')
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
  return formatTafPeriodRange(first.time, endIso, tz)
}

// 컬럼 값이 연속으로 같은 행들을 rowSpan으로 세로 병합하기 위한 행별 span 계산.
// span > 0 인 행만 <td>를 그리고, 0인 행은 위 셀의 rowSpan에 덮이므로 렌더링 생략.
function computeColumnSpans(periods, textFn) {
  const spans = new Array(periods.length).fill(0)
  let i = 0
  while (i < periods.length) {
    const text = textFn(periods[i].first)
    let j = i + 1
    while (j < periods.length && textFn(periods[j].first) === text) j++
    spans[i] = j - i
    i = j
  }
  return spans
}

export default function EnhancedTafTab({ taf, icao, eta = null, forceCompact = false }) {
  // 모바일: 테이블 고정. 데스크톱·태블릿: 타임라인 고정. 뷰 토글 없음.
  const [view] = useState(() =>
    forceCompact || (typeof window !== 'undefined' && window.matchMedia('(max-width: 719px)').matches)
      ? 'table'
      : 'timeline',
  )
  const { tz } = useTimeZone()
  if (!taf) return <div className="ap-empty">TAF 데이터 없음</div>

  const { rawTimeline, slots } = buildTafViewModel(taf, icao)
  const periods = groupTafPeriods(slots) // 테이블·그리드용 변화구간 묶음
  const tacLines = buildTafTacLines(taf, icao)

  return (
    <div className={`ap-taf${forceCompact ? ' ap-taf--compact' : ''}`}>
      {rawTimeline.length === 0 && <div className="ap-empty">TAF 시간대 데이터 없음</div>}
      {rawTimeline.length > 0 && slots.length === 0 && <div className="ap-empty">TAF 유효 기간 만료</div>}

      {slots.length > 0 && view === 'timeline' && (
        <div className="ap-taf-timeline">
          <div className="ap-taf-scale" style={{ '--taf-hour-count': slots.length }}>
            {slots.map((item, index) => <span key={index}>{index % 3 === 0 || index === 0 ? formatTafHour(item.time, tz) : ''}</span>)}
          </div>
          {[
            ['비행조건', groupTafSlots(slots, (item) => item.flight.category), (item) => item.flight.category, (item) => ({ background: TAF_CATEGORY_COLOR[item.flight.category] || '#15803d', color: '#fff' })],
            ['날씨', groupTafSlots(slots, (item) => item.weatherText), (item) => item.weatherText, (item) => ({ background: item.hasPrecipitation ? '#bae6fd' : '#f8fafc', color: item.hasPrecipitation ? '#0c4a6e' : '#0f172a' })],
            ['바람', groupTafSlots(slots, (item) => item.windText), (item) => item.windText, (item) => ({ background: item.highWind ? '#fff1f2' : '#f8fafc', color: item.highWind ? '#be123c' : '#0f172a' })],
            ['시정(m)', groupTafSlots(slots, (item) => item.visibilityText), (item) => item.visibilityText, (item) => ({ background: item.visibilityCategory.bg, color: item.visibilityCategory.valueColor })],
            ['구름(ft)', groupTafSlots(slots, (item) => item.cloudText), (item) => item.cloudText, (item) => ({ background: item.ceilingCategory.bg, color: item.ceilingCategory.valueColor })],
          ].map(([label, groups, textFn, styleFn], rowIndex) => (
            <div className="ap-taf-line" key={label}>
              <div className="ap-taf-line-label">{label}</div>
              <div className="ap-taf-line-track">
                {groups.map((group, index) => (
                  <div key={index} className={`${rowIndex === 1 ? tafWeatherClass(group.first, 'ap-taf-seg', { includeSpecial: false }) : 'ap-taf-seg'}${label === '구름(ft)' ? ' ap-taf-seg--clouds' : ''}${group.items.length === 1 && ['바람', '시정(m)'].includes(label) ? ' ap-taf-seg--hour' : ''}`} style={{ width: group.width, ...styleFn(group.first) }} title={textFn(group.first)}>
                    {label === '바람' && <MoveUp className="ap-taf-mini-arrow" style={{ transform: `rotate(${group.first.windRotation}deg)` }} />}
                    {label === '구름(ft)' ? <CloudText value={textFn(group.first)} /> : <span>{textFn(group.first)}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length > 0 && view === 'table' && (() => {
        const visSpans = computeColumnSpans(periods, (item) => item.visibilityText)
        const cloudSpans = computeColumnSpans(periods, (item) => item.cloudText)
        const windSpans = computeColumnSpans(periods, (item) => item.windText)
        const wxSpans = computeColumnSpans(periods, (item) => item.weatherText)
        return (
          <div className="ap-taf-table-wrap">
            <table className="ap-taf-table">
            <thead><tr><th>시간 ({tz})</th><th>시정(m)</th><th>구름(ft)</th><th>바람</th><th>날씨</th></tr></thead>
            <tbody>
              {periods.map((p, index) => {
                const item = p.first
                const catColor = TAF_CATEGORY_COLOR[item.flight.category]
                const etaMs = Date.parse(eta)
                const isEtaPeriod = Number.isFinite(etaMs) && p.slots.some((slot) => {
                  const slotMs = Date.parse(slot.time)
                  return slotMs <= etaMs && etaMs < slotMs + 3600000
                })
                return (
                  <tr key={index} className={isEtaPeriod ? 'ap-taf-eta-period' : undefined}>
                    <td className="ap-taf-tcol" style={{ borderLeft: `4px solid ${catColor}` }}>
                      <span className="ap-taf-trange">{periodRange(p, tz)}</span>
                      <span className="ap-taf-tcat" style={{ color: catColor }}>
                        {item.flight.category}
                        {isEtaPeriod && <span className="ap-taf-eta-badge">ETA</span>}
                      </span>
                    </td>
                    {visSpans[index] > 0 && <td className="ap-taf-merged" rowSpan={visSpans[index]} style={{ color: item.visibilityCategory.valueColor }}>{item.visibilityText}</td>}
                    {cloudSpans[index] > 0 && <td className="ap-taf-merged" rowSpan={cloudSpans[index]} style={{ color: item.ceilingCategory.valueColor }}><CloudText value={item.cloudText} /></td>}
                    {windSpans[index] > 0 && <td className={`ap-taf-merged${item.highWind ? ' is-alert' : ''}`} rowSpan={windSpans[index]}>{item.windText}</td>}
                    {wxSpans[index] > 0 && <td className={`ap-taf-merged ap-taf-wx${item.hasPrecipitation ? ' ap-taf-wx--precip' : ''}${item.isSpecialWeather ? ' ap-taf-wx--special' : ''}`} rowSpan={wxSpans[index]}>{item.weatherText}</td>}
                  </tr>
                )
              })}
            </tbody>
            </table>
          </div>
        )
      })()}

      {/* ── 원문(TAC) — 접이식(기본 접힘). METAR TAC과 동일하게 큰 글자 + 임계값 색칠,
          줄(기본/TEMPO/BECMG/FM/PROB)마다 그 시점의 비행조건 배지를 앞에 붙인다. ── */}
      {tacLines.length > 0 && (
        <details className="ap-raw-fold">
          <summary className="ap-raw-fold-summary">원문 (TAC)</summary>
          <div className="ap-taf-tac-block">
            {tacLines.map((line, i) => (
              <div className="ap-taf-tac-row" key={i}>
                <code className="ap-metar-tac">
                  {line.segments.map((seg, j) => <span key={j} className={seg.className}>{seg.text}</span>)}
                </code>
                {line.category ? <span className={`ap-metar-tac-chip ap-metar-tac-chip--${line.category}`}>{line.category}</span> : null}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
