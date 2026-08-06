import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'

import { formatKstMinute } from './lib/weatherTimeline.js'
import {
  PLAYHEAD_RATIO,
  VISIBLE_SPAN_MS,
  buildTapeTicks,
  buildTimelineDomain,
  clampMs,
  dragToTimeDelta,
  normalizeNwpTimes,
  pickAdjacentTimelineTick,
  tapePercent,
} from './lib/timelineRailModel.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useIsMobile from '../../shared/ui/useIsMobile.js'

function majorLabel(ms, tz) {
  // formatKstMinute -> "MM/DD HH:MM KST". Show the date at midnight (date crossing), else just the clock.
  const [date, clock] = formatKstMinute(ms, tz).split(' ')
  if (clock === '00:00') {
    const [, dd] = date.split('/')
    const mm = Number(date.split('/')[0])
    return `${mm}/${Number(dd)} 00:00`
  }
  return clock || ''
}

// Full-width scrolling time tape: a fixed playhead with the selected time under it; drag the tape to scrub,
// press play to scroll right -> left. Past observations (solid) -> 지금 -> future forecast (dashed).
function TimelineRail({
  pastTicksMs = [],
  nwpTimes = [],
  forecastTicksMs = [],
  selectedMs = null,
  isPlaying = false,
  onScrub,
  onPlayPause,
  referenceNowMs = null,
}) {
  const { tz } = useTimeZone()
  // 모바일은 좁은 폭에 12h가 빡빡 → 6h만 노출해 시간당 간격을 2배로(드래그로 더 볼 수 있음).
  const isMobile = useIsMobile()
  const visibleSpanMs = isMobile ? VISIBLE_SPAN_MS / 2 : VISIBLE_SPAN_MS
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now())
  const nowMs = Number.isFinite(referenceNowMs) ? referenceNowMs : liveNowMs
  const viewportRef = useRef(null)
  const dragRef = useRef(null)
  const [active, setActive] = useState(false) // scrubbing or focused -> show time readout
  const readoutTimerRef = useRef(null)
  useEffect(() => () => window.clearTimeout(readoutTimerRef.current), [])

  // 화살표키 스크럽은 레일에 포커스를 주지 않는다 — MapView가 창 전체에서 키를 받아 이 노드로
  // 이벤트만 흘려보내기 때문이다(포커스는 지도나 패널에 그대로 있다). 그래서 눌린 동안만
  // 시각을 띄웠다가 손을 떼면 지운다. 진짜로 포커스가 와 있으면 onBlur가 지울 때까지 남긴다.
  const flashReadout = () => {
    setActive(true)
    window.clearTimeout(readoutTimerRef.current)
    readoutTimerRef.current = window.setTimeout(() => {
      if (document.activeElement !== viewportRef.current) setActive(false)
    }, 1500)
  }
  const isLive = !Number.isFinite(selectedMs)

  useEffect(() => {
    if (Number.isFinite(referenceNowMs)) return undefined
    const timer = window.setInterval(() => setLiveNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [referenceNowMs])

  const futureMs = normalizeNwpTimes(nwpTimes).map((time) => time.ms)
  // QPF valid times are selectable only on an exact match, so they must be reachable ticks —
  // by keyboard and by drag — not just times the playback loop happens to step onto.
  const forecastMs = (Array.isArray(forecastTicksMs) ? forecastTicksMs : []).filter(Number.isFinite)
  const keyboardTicks = [...new Set([...pastTicksMs, ...forecastMs, ...futureMs])].sort((a, b) => a - b)
  const domain = buildTimelineDomain({ pastTicksMs, nwpTimesMs: futureMs, qpfTimesMs: forecastMs, nowMs })
  const selected = Number.isFinite(selectedMs)
    ? clampMs(domain, selectedMs)
    : (pastTicksMs.length ? pastTicksMs[pastTicksMs.length - 1] : nowMs)

  const pct = (ms) => tapePercent({ ms, selectedMs: selected, visibleSpanMs })
  const nowPct = Math.max(0, Math.min(100, pct(nowMs)))

  // Fill the whole visible window with tiered ruler ticks so the ruler is never empty.
  const visibleStart = selected - visibleSpanMs * PLAYHEAD_RATIO
  const visibleEnd = selected + visibleSpanMs * (1 - PLAYHEAD_RATIO)
  const tapeTicks = buildTapeTicks({ startMs: visibleStart, endMs: visibleEnd })

  const commit = (ms) => onScrub?.(clampMs(domain, ms))

  const handlePointerDown = (event) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    dragRef.current = { startX: event.clientX, startSelected: selected, width: rect.width }
    viewportRef.current.setPointerCapture?.(event.pointerId)
    setActive(true)
  }
  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const dxFraction = (event.clientX - drag.startX) / drag.width
    commit(drag.startSelected + dragToTimeDelta(dxFraction, visibleSpanMs))
  }
  const handlePointerEnd = (event) => {
    setActive(false)
    if (!dragRef.current) return
    dragRef.current = null
    viewportRef.current?.releasePointerCapture?.(event.pointerId)
  }
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') { commit(pickAdjacentTimelineTick(keyboardTicks, selected, -1)); flashReadout(); event.preventDefault() }
    else if (event.key === 'ArrowRight') { commit(pickAdjacentTimelineTick(keyboardTicks, selected, 1)); flashReadout(); event.preventDefault() }
  }

  return (
    <section className="timeline-rail" aria-label="시간 슬라이더">
      <div
        ref={viewportRef}
        className="timeline-rail__viewport"
        role="slider"
        tabIndex={0}
        aria-valuemin={Math.round(domain.startMs)}
        aria-valuemax={Math.round(domain.endMs)}
        aria-valuenow={Math.round(selected)}
        aria-valuetext={formatKstMinute(selected, tz)}
        aria-label="기상 자료 시각 (드래그하여 이동)"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
      >
        <div className="timeline-rail__playhead" aria-hidden="true" style={{ left: `${PLAYHEAD_RATIO * 100}%` }} />
        <div className="timeline-rail__baseline timeline-rail__baseline--past" style={{ right: `${100 - nowPct}%` }} />
        <div className="timeline-rail__baseline timeline-rail__baseline--future" style={{ left: `${nowPct}%` }} />
        {pastTicksMs.map((ms) => (
          <span key={`p-${ms}`} className="timeline-rail__frame" style={{ left: `${pct(ms)}%` }} aria-hidden="true" />
        ))}
        {futureMs.map((ms) => (
          <span key={`f-${ms}`} className="timeline-rail__frame timeline-rail__frame--future" style={{ left: `${pct(ms)}%` }} aria-hidden="true" />
        ))}
        {tapeTicks.map(({ ms, tier }) => (
          <div
            key={ms}
            className={`timeline-rail__tick timeline-rail__tick--${tier}${ms > nowMs ? ' timeline-rail__tick--future' : ''}`}
            style={{ left: `${pct(ms)}%` }}
            aria-hidden="true"
          >
            <span className="timeline-rail__tick-mark" />
            {tier === 'major' && <span className="timeline-rail__tick-label">{majorLabel(ms, tz)}</span>}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="timeline-rail__play"
        style={{ left: `${PLAYHEAD_RATIO * 100}%` }}
        onClick={onPlayPause}
        aria-label={isPlaying ? '재생 일시정지' : '재생'}
      >
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>

      {active && (
        <div className="timeline-rail__readout" style={{ left: `${PLAYHEAD_RATIO * 100}%` }} aria-hidden="true">
          {formatKstMinute(selected, tz)}
        </div>
      )}

      {!isLive && !isPlaying && (
        <button type="button" className="timeline-rail__live" onClick={() => onScrub?.(null)} aria-label="실시간(지금)으로 이동">
          <RotateCcw size={17} />
        </button>
      )}
    </section>
  )
}

export default TimelineRail
