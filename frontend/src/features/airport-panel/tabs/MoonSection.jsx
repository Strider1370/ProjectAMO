import { useMemo, useState } from 'react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { nightSummary, monthSummaries, GRADE_LABEL } from '../../../shared/astro/illuminance.js'
import './MoonSection.css'

// 야간 지면 조도. 설계: docs/superpowers/specs/2026-07-14-moonlight-illuminance.md
// 계산은 shared/astro/illuminance.js (USNO Circular 171). 여기는 표시만 한다.

const MLX = (lux) => lux * 1000
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
const LO_MLX = 0.3
const HI_MLX = 1e6
const NIGHT_SKY_MLX = 0.5
const AXIS = [
  [1, '1'],
  [100, '100'],
  [10000, '1만'],
  [1000000, '100만'],
]

function NightChart({ night, tz }) {
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const span = night.sunrise - night.sunset
  const x = (t) => PAD.l + ((t - night.sunset) / span) * iw
  const lgRange = Math.log10(HI_MLX) - Math.log10(LO_MLX)
  const y = (mlx) => PAD.t + ih - ((Math.log10(Math.max(mlx, LO_MLX)) - Math.log10(LO_MLX)) / lgRange) * ih
  const clamp = (v) => Math.max(PAD.l, Math.min(PAD.l + iw, v))

  // 박명 밴드. 해가 지고도 한동안은 태양이 하늘을 지배한다.
  // 고위도에서는 night/nightEnd가 null → 해당 밴드만 생략된다.
  const bands = [
    [night.sunset, night.dusk, 'civil'],
    [night.dusk, night.nauticalDusk, 'nautical'],
    [night.nauticalDusk, night.night, 'astro'],
    [night.night, night.nightEnd, 'dark'],
    [night.nightEnd, night.nauticalDawn, 'astro'],
    [night.nauticalDawn, night.dawn, 'nautical'],
    [night.dawn, night.sunrise, 'civil'],
  ].filter(([a, b]) => a != null && b != null && b > a)

  const totalPts = night.samples.map((s) => `${x(s.t).toFixed(1)},${y(MLX(s.total)).toFixed(1)}`).join(' ')
  const moonPts = night.samples.map((s) => `${x(s.t).toFixed(1)},${y(MLX(s.moon)).toFixed(1)}`).join(' ')

  const hours = []
  const first = new Date(night.sunset)
  first.setUTCMinutes(0, 0, 0)
  for (let t = first.getTime() + 3600e3; t < night.sunrise; t += 2 * 3600e3) {
    if (t > night.sunset) hours.push(t)
  }

  const peakMlx = night.peakMoonMlx
  const darkMid = night.night != null && night.nightEnd != null
    ? (clamp(x(night.night)) + clamp(x(night.nightEnd))) / 2
    : null

  return (
    <svg className="moon-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`지면 조도. 달빛 최대 ${Math.round(peakMlx)} 밀리럭스`}>
      {bands.map(([a, b, kind]) => (
        <rect key={`${a}-${kind}`} className={`moon-band moon-band--${kind}`}
          x={clamp(x(a))} y={PAD.t} width={clamp(x(b)) - clamp(x(a))} height={ih} />
      ))}

      {AXIS.map(([v, label]) => (
        <g key={v}>
          <line className="moon-grid" x1={PAD.l} y1={y(v)} x2={PAD.l + iw} y2={y(v)} />
          <text className="moon-axis" x={PAD.l - 8} y={y(v) + 3.5} textAnchor="end">{label}</text>
        </g>
      ))}

      {darkMid != null && (
        <text className="moon-dark-label" x={darkMid} y={PAD.t - 8} textAnchor="middle">
          완전한 어둠 {hhmm(night.night, tz)}–{hhmm(night.nightEnd, tz)}
        </text>
      )}

      <polyline className="moon-line-moon" points={moonPts} />
      <polyline className="moon-line-total" points={totalPts} />

      <line className="moon-floor" x1={PAD.l} y1={y(NIGHT_SKY_MLX)} x2={PAD.l + iw} y2={y(NIGHT_SKY_MLX)} />
      <text className="moon-floor-label" x={PAD.l + iw - 2} y={y(NIGHT_SKY_MLX) - 4} textAnchor="end">
        별빛 배경 {NIGHT_SKY_MLX}
      </text>

      {peakMlx >= 1 && night.peakAt != null && (
        <>
          <circle className="moon-peak" cx={x(night.peakAt)} cy={y(peakMlx)} r={3} />
          <text className="moon-peak-label" x={x(night.peakAt)} y={y(peakMlx) - 10} textAnchor="middle">
            {Math.round(peakMlx)} mlx
          </text>
        </>
      )}

      <line className="moon-axis-line" x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} />
      {hours.map((t) => (
        <text key={t} className="moon-axis" x={x(t)} y={H - 13} textAnchor="middle">{hhmm(t, tz)}</text>
      ))}
      {[[night.moonrise, '월출'], [night.moonset, '월몰']].map(([t, label]) =>
        t != null && t > night.sunset && t < night.sunrise ? (
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
    const s = nightSummary(localNoon, lat, lon)
    return s ? { ...s, day: selectedDay } : null
  }, [hasCoords, cursor.year, cursor.month, selectedDay, lat, lon])

  // 한 달치는 31일 × ~60표본 ≈ 1,900회. 달력이 접혀 있으면 계산하지 않는다.
  const month = useMemo(() => {
    if (!hasCoords || !calOpen) return []
    return monthSummaries(cursor.year, cursor.month, lat, lon)
  }, [hasCoords, calOpen, cursor.year, cursor.month, lat, lon])

  if (!hasCoords) return <p className="moon-empty">이 공항의 좌표가 없어 달빛을 계산할 수 없습니다.</p>
  if (!night) return <p className="moon-empty">이 위도에서는 밤이 성립하지 않습니다(백야/극야).</p>

  const leading = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay()
  const isThisMonth = cursor.year === today.getFullYear() && cursor.month === today.getMonth()

  const step = (delta) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1))
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() })
    setSelectedDay(1)
  }

  const moonlessDays = month.filter((m) => m.grade === 'moonless').map((m) => m.day)

  return (
    <div className="moon-sec">
      <div className="moon-hero">
        <div className="moon-hero-chip">
          <MoonDisc fraction={night.fraction} phase={night.phase} r={16} onDark />
        </div>
        <div className="moon-hero-main">
          <div className="moon-hero-grade">
            {GRADE_LABEL[night.grade]} · 조명률 {Math.round(night.fraction * 100)}%
          </div>
          <div className="moon-hero-sub">
            월출 {hhmm(night.moonrise, tz)} · 월몰 {hhmm(night.moonset, tz)} · 최대 {hhmm(night.peakAt, tz)}
          </div>
        </div>
        <div className="moon-hero-num">
          <b>{Math.round(night.peakMoonMlx)}</b>
          <span>mlx</span>
        </div>
      </div>

      <div className="moon-head">
        <b>{cursor.month + 1}월 {night.day}일 밤 — 지면 조도</b>
        <span>일몰 {hhmm(night.sunset, tz)} → 일출 {hhmm(night.sunrise, tz)}</span>
      </div>
      <div className="moon-card">
        <NightChart night={night} tz={tz} />
        <p className="moon-sub">
          <span className="moon-key"><i className="moon-key-total" />총 조도 (태양+달+별빛)</span>
          <span className="moon-key"><i className="moon-key-moon" />달빛 기여분</span>
          <br />
          배경 음영 = 박명 단계. 해가 지고도 한동안은 <b>태양빛이 달빛보다 수천 배 밝습니다.</b>{' '}
          달빛이 지면을 지배하는 건 두 선이 겹치는 구간부터입니다.
        </p>
      </div>

      {/* 기본 접힘. 펼칠 때까지 한 달치(≈1,900회)를 계산하지 않는다. */}
      <details className="moon-cal-fold" onToggle={(e) => setCalOpen(e.currentTarget.open)}>
        <summary className="moon-cal-summary">
          <span className="moon-cal-summary-title">월간 달력</span>
          <span className="moon-cal-summary-hint">
            {calOpen ? '칸을 누르면 그 밤의 곡선이 위에 표시됩니다' : '무월광 기간을 한눈에 봅니다'}
          </span>
        </summary>

        <div className="moon-head moon-head--cal">
          <b>
            <button type="button" className="moon-nav" onClick={() => step(-1)} aria-label="이전 달">‹</button>
            {cursor.year}년 {cursor.month + 1}월
            <button type="button" className="moon-nav" onClick={() => step(1)} aria-label="다음 달">›</button>
          </b>
          {moonlessDays.length > 0 && (
            <span>무월광 {Math.min(...moonlessDays)}–{Math.max(...moonlessDays)}일</span>
          )}
        </div>

        <div className="moon-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
        <div className="moon-cal">
        {Array.from({ length: leading }, (_, i) => <div key={`pad-${i}`} className="moon-cell moon-cell--pad" />)}
        {month.map((m) => {
          const mlx = m.peakMoonMlx
          const dark = m.grade === 'moonless'
          const bar = mlx <= 0.5 ? 0 : Math.min(1, Math.log10(2 * mlx) / Math.log10(500))
          const isToday = isThisMonth && m.day === today.getDate()
          return (
            <button
              type="button"
              key={m.day}
              className={`moon-cell${dark ? ' moon-cell--dark' : ''}${m.day === night.day ? ' is-selected' : ''}`}
              onClick={() => setSelectedDay(m.day)}
              aria-pressed={m.day === night.day}
              aria-label={`${m.day}일 밤, ${GRADE_LABEL[m.grade]}, 달빛 최대 ${Math.round(mlx)} 밀리럭스, 조명률 ${Math.round(m.fraction * 100)}%`}
            >
              <span className="moon-cell-top">
                <span className="moon-cell-day">{m.day}{isToday && <i className="moon-cell-dot" />}</span>
                <MoonDisc fraction={m.fraction} phase={m.phase} r={6.5} onDark={dark} />
              </span>
              <span className="moon-cell-val">
                {mlx >= 0.5 ? Math.round(mlx) : '–'}
                <em>{Math.round(m.fraction * 100)}%</em>
              </span>
              <span className="moon-cell-bar"><i style={{ width: `${(bar * 100).toFixed(0)}%` }} /></span>
            </button>
          )
        })}
        </div>

        <div className="moon-legend">
          <span className="moon-legend-dark"><i />무월광 <b>&lt; 2 mlx</b></span>
          <span className="moon-legend-bar"><i><u style={{ width: '42%' }} /></i>막대 = 달빛 밝기 (로그)</span>
          <span className="moon-legend-note">숫자 = 달빛 최대 mlx · 옆의 작은 값 = 조명률</span>
        </div>
      </details>

      <p className="moon-cap">
        USNO Circular 171 (Janiczek &amp; DeYoung, 1987) 모델. 맑은 하늘 기준이며 구름은 반영되지 않습니다.
        한 칸 = 그날 저녁 일몰부터 다음날 일출까지의 한 밤.
      </p>
    </div>
  )
}

export default MoonSection
