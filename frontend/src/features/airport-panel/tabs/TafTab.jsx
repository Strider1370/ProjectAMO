import { useState } from 'react'
import { MoveUp } from 'lucide-react'
import { buildTafViewModel, buildTafTacLines, formatTafHour, formatTafPeriodRange, groupTafSlots, TAF_CATEGORY_COLOR } from '../lib/tafViewModel.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import useDemoMode from '../../../shared/demoMode/useDemoMode.js'
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
  // 모바일·태블릿: 테이블 고정. 데스크톱: 타임라인 고정. 뷰 토글 없음.
  // 타임라인은 패널 폭이 좁아지면 칸이 잘게 쪼개져 값이 칸 밖으로 넘친다. 패널 폭은
  // clamp(560px, 50vw, 960px)라 화면이 좁을수록 패널도 좁다 — 아이패드 11" 가로(1194px)에서
  // 패널 597px, 가장 좁은 칸 57px이라 바람(14006KT)이 잘렸다.
  // 데스크톱(패널 720px)도 변화구간이 많은 TAF에서는 바람 값이 넘친다 — 그건 타임라인 자체 문제라 여기서 다루지 않는다.
  const [{ view, compact }] = useState(() => {
    if (forceCompact) return { view: 'table', compact: true }
    if (typeof window === 'undefined') return { view: 'timeline', compact: false }
    // 휴대폰은 기존 그대로(가로 스크롤 표). 태블릿·좁은 창은 표에 좁은 폭 기하까지 적용한다.
    if (window.matchMedia('(max-width: 719px)').matches) return { view: 'table', compact: false }
    if (window.matchMedia('(max-width: 1279px)').matches) return { view: 'table', compact: true }
    return { view: 'timeline', compact: false }
  })
  const { tz } = useTimeZone()
  const { nowMs } = useDemoMode()
  if (!taf) return <div className="ap-empty">TAF 데이터 없음</div>

  const { rawTimeline, slots } = buildTafViewModel(taf, icao, nowMs)
  const periods = groupTafPeriods(slots) // 테이블·그리드용 변화구간 묶음
  const tacLines = buildTafTacLines(taf, icao)

  return (
    <div className={`ap-taf${compact ? ' ap-taf--compact' : ''}`}>
      {rawTimeline.length === 0 && <div className="ap-empty">TAF 시간대 데이터 없음</div>}
      {rawTimeline.length > 0 && slots.length === 0 && <div className="ap-empty">TAF 유효 기간 만료</div>}

      {slots.length > 0 && view === 'timeline' && (
        <div className="ap-taf-timeline">
          <div className="ap-taf-scale" style={{ '--taf-hour-count': slots.length }}>
            {slots.map((item, index) => <span key={index}>{index % 3 === 0 || index === 0 ? formatTafHour(item.time, tz) : ''}</span>)}
          </div>
          {[
            ['비행조건', groupTafSlots(slots, (item) => item.flight.category), (item) => item.flight.category, (item) => ({ background: TAF_CATEGORY_COLOR[item.flight.category] || '#15803d', color: '#fff' }), ''],
            ['날씨', groupTafSlots(slots, (item) => item.weatherText), (item) => item.weatherText, (item) => ({ background: item.hasPrecipitation ? '#bae6fd' : '#f8fafc', color: item.hasPrecipitation ? '#0c4a6e' : '#0f172a' }), 'ap-taf-seg--weather'],
            ['바람', groupTafSlots(slots, (item) => item.windText), (item) => item.windText, (item) => ({ background: item.highWind ? '#fff1f2' : '#f8fafc', color: item.highWind ? '#be123c' : '#0f172a' }), 'ap-taf-seg--wind'],
            ['시정(m)', groupTafSlots(slots, (item) => item.visibilityText), (item) => item.visibilityText, (item) => ({ background: item.visibilityCategory.bg, color: item.visibilityCategory.valueColor }), 'ap-taf-seg--visibility'],
            ['구름(ft)', groupTafSlots(slots, (item) => item.cloudText), (item) => item.cloudText, (item) => ({ background: item.ceilingCategory.bg, color: item.ceilingCategory.valueColor }), 'ap-taf-seg--clouds'],
          ].map(([label, groups, textFn, styleFn, rowClass], rowIndex) => (
            <div className="ap-taf-line" key={label}>
              <div className="ap-taf-line-label">{label}</div>
              <div className="ap-taf-line-track">
                {groups.map((group, index) => (
                  <div key={index} className={`${rowIndex === 1 ? tafWeatherClass(group.first, 'ap-taf-seg', { includeSpecial: false }) : 'ap-taf-seg'}${rowClass ? ` ${rowClass}` : ''}`} style={{ width: group.width, ...styleFn(group.first) }} title={textFn(group.first)}>
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
        // CAVOK 구간은 시정·구름·날씨를 CAVOK 한 칸으로 합치므로, 세 열의 병합 구간이
        // 항상 CAVOK 경계에서 같이 끊기도록 같은 sentinel 키를 쓴다.
        const visSpans = computeColumnSpans(periods, (item) => (item.cavok ? 'CAVOK' : item.visibilityText))
        const cloudSpans = computeColumnSpans(periods, (item) => (item.cavok ? 'CAVOK' : item.cloudText))
        const windSpans = computeColumnSpans(periods, (item) => item.windText)
        const wxSpans = computeColumnSpans(periods, (item) => (item.cavok ? 'CAVOK' : item.weatherText))
        const etaMs = Date.parse(eta)
        // ETA 강조는 시간(첫) 칸에만 준다. 값 칸은 여러 시간대에 걸쳐 병합돼 있어서
        // 같이 칠하면 "그 값 전체가 ETA"인 것처럼 읽히고, 줄 전체에 테두리를 두르면
        // 앞줄에서 시작한 병합 칸을 가로지르는 잘린 선이 그어진다.
        const etaIndex = periods.findIndex((p) => p.slots.some((slot) => {
          const slotMs = Date.parse(slot.time)
          return slotMs <= etaMs && etaMs < slotMs + 3600000
        }))
        return (
          <div className="ap-taf-table-wrap">
            <table className="ap-taf-table">
            <thead><tr><th>시간 ({tz})</th><th>시정(m)</th><th>구름(ft)</th><th>날씨</th><th>바람</th></tr></thead>
            <tbody>
              {periods.map((p, index) => {
                const item = p.first
                const catColor = TAF_CATEGORY_COLOR[item.flight.category]
                const isEtaPeriod = index === etaIndex
                return (
                  <tr key={index} className={isEtaPeriod ? 'ap-taf-eta-period' : undefined}>
                    <td className={`ap-taf-tcol${isEtaPeriod ? ' is-eta' : ''}`} style={{ borderLeft: `4px solid ${catColor}` }}>
                      <span className="ap-taf-trange">{periodRange(p, tz)}</span>
                      <span className="ap-taf-tcat" style={{ color: catColor }}>
                        {item.flight.category}
                        {isEtaPeriod && <span className="ap-taf-eta-badge">ETA</span>}
                      </span>
                    </td>
                    {item.cavok
                      ? visSpans[index] > 0 && <td className="ap-taf-merged ap-taf-cavok" colSpan={3} rowSpan={visSpans[index]} style={{ color: item.visibilityCategory.valueColor }}>CAVOK</td>
                      : (
                        <>
                          {visSpans[index] > 0 && <td className="ap-taf-merged" rowSpan={visSpans[index]} style={{ color: item.visibilityCategory.valueColor }}>{item.visibilityText}</td>}
                          {cloudSpans[index] > 0 && <td className="ap-taf-merged" rowSpan={cloudSpans[index]} style={{ color: item.ceilingCategory.valueColor }}><CloudText value={item.cloudText} /></td>}
                          {wxSpans[index] > 0 && <td className={`ap-taf-merged ap-taf-wx${item.hasPrecipitation ? ' ap-taf-wx--precip' : ''}${item.isSpecialWeather ? ' ap-taf-wx--special' : ''}`} rowSpan={wxSpans[index]}>{item.weatherText}</td>}
                        </>
                      )}
                    {windSpans[index] > 0 && <td className={`ap-taf-merged${item.highWind ? ' is-alert' : ''}`} rowSpan={windSpans[index]}>{item.windText}</td>}
                  </tr>
                )
              })}
            </tbody>
            </table>
          </div>
        )
      })()}

      {/* ── 원문(TAC) — 접이식(기본 접힘). METAR TAC과 동일하게 큰 글자 + 임계값 색칠,
          줄(기본/TEMPO/BECMG/FM/PROB)마다 그 시점의 비행조건을 왼쪽 색 테두리로 표시한다. ── */}
      {tacLines.length > 0 && (
        <details className="ap-raw-fold">
          <summary className="ap-raw-fold-summary">원문 (TAC)</summary>
          <div className="ap-taf-tac-block">
            {tacLines.map((line, i) => (
              <div className={`ap-taf-tac-row${line.category ? ` ap-taf-tac-row--${line.category}` : ''}`} key={i} title={line.category || undefined} aria-label={line.category ? `${line.category} 구간` : undefined}>
                <code className="ap-metar-tac">
                  {line.segments.map((seg, j) => <span key={j} className={seg.className}>{seg.text}</span>)}
                </code>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
