import { useMemo, useState } from 'react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { belowHorizonRanges, moonNight, moonMonth, moonPhaseLabel } from '../../../shared/astro/moon-info.js'
import './MoonSection.css'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const KST_OFFSET_H = 9 // 국내 공항 전용 섹션. 날짜 앵커를 브라우저 시간대에 맡기지 않는다.

// 표시 시각. tz='KST'면 UTC+9. formatters.fmtKstShort와 같은 규약.
function hhmm(ms, tz) {
  if (ms == null) return '–'
  const d = new Date(tz === 'KST' ? ms + 9 * 3600 * 1000 : ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// 옛 천문력 관례: 채워진 원 = 보름, 빈 원 = 삭. 빛나는 면만 --moon-lit.
function MoonDisc({ fraction, phase, r, onDark }) {
  const k = 2 * fraction - 1
  const rx = Math.abs(k) * r
  const sweep = fraction > 0.5 ? 1 : 0
  const lit = `M 0,${-r} A ${r},${r} 0 0,1 0,${r} A ${rx.toFixed(2)},${r} 0 0,${sweep} 0,${-r} Z`
  const waxing = phase < 0.5 // 차오름이면 오른쪽이 밝다
  const size = 2 * r + 2
  return (
    <svg className={`moon-disc${onDark ? ' moon-disc--on-dark' : ''}`} width={size} height={size}
      viewBox={`${-r - 1} ${-r - 1} ${size} ${size}`} aria-hidden="true">
      <circle className="moon-disc-edge" r={r} />
      {fraction > 0.02 && (
        <path className="moon-disc-lit" d={lit} transform={waxing ? undefined : 'scale(-1,1)'} />
      )}
    </svg>
  )
}

const W = 656
const H = 210
const PAD = { l: 46, r: 12, t: 24, b: 32 }
const ALTITUDES = [-90, -60, -30, 0, 30, 60, 90]

function NightChart({ night, tz }) {
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const x = (t) => PAD.l + ((t - night.chartStart) / (night.chartEnd - night.chartStart)) * iw
  const y = (alt) => PAD.t + ((90 - Math.max(-90, Math.min(90, alt))) / 180) * ih
  const points = night.chartSamples.map((s) => `${x(s.t).toFixed(1)},${y(s.altitude).toFixed(1)}`).join(' ')
  const phaseLabel = moonPhaseLabel(night.peakIllumination.phase)
  const phaseX = x(night.peak.t)
  const phaseTextRight = phaseX < W / 2
  const hours = []
  for (let t = Math.ceil(night.chartStart / (3 * 3600e3)) * 3 * 3600e3; t < night.chartEnd; t += 3 * 3600e3) {
    if (t > night.chartStart) hours.push(t)
  }

  return (
    <svg className="moon-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`시간별 달의 고도. 0도 아래 영역과 달이 지평선 아래인 시간을 어둡게 표시. 밤중 최고 ${Math.round(night.peak.altitude)}도`}>
      <rect className="moon-below-horizon" x={PAD.l} y={y(0)} width={iw} height={y(-90) - y(0)} />
      {belowHorizonRanges(night.chartSamples).map(([start, end]) => (
        <rect key={start} className="moon-night-shade" x={x(start)} y={PAD.t} width={x(end) - x(start)} height={ih} />
      ))}
      {ALTITUDES.map((alt) => (
        <g key={alt}>
          <line className={alt === 0 ? 'moon-horizon' : 'moon-grid'} x1={PAD.l} y1={y(alt)} x2={PAD.l + iw} y2={y(alt)} />
          <text className="moon-axis" x={PAD.l - 8} y={y(alt) + 3.5} textAnchor="end">{alt}°</text>
        </g>
      ))}
      <text className="moon-horizon-label" x={PAD.l + iw - 3} y={y(0) - 5} textAnchor="end">지평선</text>
      <polyline className="moon-line-moon" points={points} />
      <g transform={`translate(${x(night.peak.t) - 9}, ${y(night.peak.altitude) - 9})`}>
        <title>밤중 최고 고도 {Math.round(night.peak.altitude)}° · {phaseLabel} · 달의 밝은 면 {Math.round(night.peakIllumination.fraction * 100)}%</title>
        <MoonDisc fraction={night.peakIllumination.fraction} phase={night.peakIllumination.phase} r={8} />
      </g>
      <text className="moon-phase-label" x={phaseX + (phaseTextRight ? 13 : -13)} y={y(night.peak.altitude) + 4} textAnchor={phaseTextRight ? 'start' : 'end'}>{phaseLabel}</text>
      {[[night.sunset, '일몰'], [night.sunrise, '일출']].map(([t, label]) => (
        <g key={label}>
          <line className="moon-sun-boundary" x1={x(t)} y1={PAD.t} x2={x(t)} y2={PAD.t + ih} />
          <text className="moon-sun-label" x={x(t)} y={PAD.t - 8} textAnchor="middle">{label} {hhmm(t, tz)}</text>
        </g>
      ))}
      <line className="moon-axis-line" x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} />
      {hours.map((t) => (
        <text key={t} className="moon-axis" x={x(t)} y={H - 13} textAnchor="middle">{hhmm(t, tz)}</text>
      ))}
      {[[night.moonrise, '월출'], [night.moonset, '월몰']].map(([t, label]) =>
        t != null ? (
          <g key={label}>
            <line className="moon-tick" x1={x(t)} y1={PAD.t + ih} x2={x(t)} y2={PAD.t + ih + 4} />
            <text className="moon-tick-label" x={x(t)} y={H - 1} textAnchor="middle">{label} {hhmm(t, tz)}</text>
          </g>
        ) : null,
      )}
    </svg>
  )
}

function MoonSection({ airport }) {
  const { tz } = useTimeZone()
  const lat = airport?.lat
  const lon = airport?.lon

  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }))
  const [selectedDay, setSelectedDay] = useState(() => today.getDate())
  const [calOpen, setCalOpen] = useState(false)

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon)

  // 선택된 하룻밤 하나 (~60회 계산). 요약·곡선이 쓴다.
  const night = useMemo(() => {
    if (!hasCoords) return null
    const localNoon = new Date(Date.UTC(cursor.year, cursor.month, selectedDay, 12 - KST_OFFSET_H))
    const s = moonNight(localNoon, lat, lon)
    return s ? { ...s, day: selectedDay } : null
  }, [hasCoords, cursor.year, cursor.month, selectedDay, lat, lon])

  // 한 달치는 31일 × ~60표본 ≈ 1,900회. 달력이 접혀 있으면 계산하지 않는다.
  const month = useMemo(() => {
    if (!hasCoords || !calOpen) return []
    return moonMonth(cursor.year, cursor.month, lat, lon)
  }, [hasCoords, calOpen, cursor.year, cursor.month, lat, lon])

  if (!hasCoords) return <p className="moon-empty">이 공항의 좌표가 없어 달 정보를 계산할 수 없습니다.</p>
  if (!night) return <p className="moon-empty">이 위도에서는 밤이 성립하지 않습니다(백야/극야).</p>

  const leading = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay()
  const isThisMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth()

  const step = (delta) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1))
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
    setSelectedDay(1)
  }

  return (
    <div className="moon-sec">
      <div className="moon-hero">
        <div className="moon-hero-chip">
          <MoonDisc fraction={night.fraction} phase={night.phase} r={16} onDark />
        </div>
        <div className="moon-hero-main">
          <div className="moon-hero-grade">{cursor.month + 1}월 {night.day}일 밤 · {moonPhaseLabel(night.phase)}</div>
          <div className="moon-hero-sub">
            월출 {hhmm(night.calendarMoonrise, tz)} · 월몰 {hhmm(night.calendarMoonset, tz)} · 밤 최고 {Math.round(night.peak.altitude)}° {hhmm(night.peak.t, tz)}
          </div>
        </div>
        <div className="moon-hero-num"><b>{Math.round(night.fraction * 100)}%</b><span>밝은 면</span></div>
      </div>

      <details className="moon-chart-fold">
        <summary className="moon-chart-summary">시간별 달의 고도</summary>
        <div className="moon-head">
          <b>{cursor.month + 1}월 {night.day}일 밤 — 달의 고도</b>
          <span>일몰 {hhmm(night.sunset, tz)} → 일출 {hhmm(night.sunrise, tz)}</span>
        </div>
        <div className="moon-card">
          <NightChart night={night} tz={tz} />
          <p className="moon-sub"><span className="moon-night-key" />달이 지평선 아래인 시간 · 0° 아래는 지평선 아래 · 달 표시는 밤중 최고 고도</p>
        </div>
      </details>

      {/* 기본 접힘. 펼칠 때까지 한 달치(≈1,900회)를 계산하지 않는다. */}
      <details className="moon-cal-fold" onToggle={(e) => setCalOpen(e.currentTarget.open)}>
        <summary className="moon-cal-summary">
          <span className="moon-cal-summary-title">월간 달력</span>
          <span className="moon-cal-summary-hint">
            {calOpen ? '날짜를 누르면 그 밤의 달 정보를 볼 수 있습니다' : '날짜별 달의 밝은 면을 확인합니다'}
          </span>
        </summary>

        <div className="moon-head moon-head--cal">
          <b>
            <button type="button" className="moon-nav" onClick={() => step(-1)} aria-label="이전 달">‹</button>
            {cursor.year}년 {cursor.month + 1}월
            <button type="button" className="moon-nav" onClick={() => step(1)} aria-label="다음 달">›</button>
          </b>

        </div>

        <div className="moon-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
        <div className="moon-cal">
        {Array.from({ length: leading }, (_, i) => <div key={`pad-${i}`} className="moon-cell moon-cell--pad" />)}
        {month.map((m) => {
          const isToday = isThisMonth && m.day === today.getDate()
          return (
            <button
              type="button"
              key={m.day}
              className={`moon-cell${m.moonless ? ' moon-cell--dark' : ''}${m.day === night.day ? ' is-selected' : ''}`}
              onClick={() => setSelectedDay(m.day)}
              aria-pressed={m.day === night.day}
              aria-label={`${m.day}일${m.phaseEvents.length ? `, ${m.phaseEvents.map(event => `${event.name} ${hhmm(event.time, tz)}`).join(', ')}` : ''} 밤, ${m.moonless ? '무월광, ' : ''}달의 밝은 면 ${Math.round(m.fraction * 100)}%`}
            >
              <span className="moon-cell-top">
                <span className="moon-cell-day">{m.day}{isToday && <i className="moon-cell-dot" />}{m.phaseEvents.map(event => <span key={event.name} className="moon-phase-name" title={`${event.name} ${hhmm(event.time, tz)} ${tz}`}>{event.name}</span>)}</span>
                <MoonDisc fraction={m.fraction} phase={m.phase} r={6.5} onDark={m.moonless} />
              </span>
              <span className="moon-cell-val">{Math.round(m.fraction * 100)}%</span>
              <span className="moon-cell-bar"><i style={{ width: `${(m.fraction * 100).toFixed(0)}%` }} /></span>
            </button>
          )
        })}
        </div>

        <div className="moon-legend"><span className="moon-legend-dark"><i />무월광</span><span>밝은 면: 밤 중간 기준 · 달 모양 이름: KST 날짜 기준</span></div>
      </details>

    </div>
  )
}

export default MoonSection
