import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react'

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
  buildAvailabilitySegments,
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
  availableFrameEntries = [],
  // 지도형 브리핑: ETD~ETA 창(양끝 세로선) + 각 선 위 "ETD 20:30"·"ETA 21:14". { startMs, endMs, label, etdLabel, etaLabel }
  flightWindow = null,
}) {
  const { tz } = useTimeZone()
  // 모바일은 좁은 폭에 12h가 빡빡 → 6h만 노출해 시간당 간격을 2배로(드래그로 더 볼 수 있음).
  const isMobile = useIsMobile()
  const visibleSpanMs = isMobile ? VISIBLE_SPAN_MS / 2 : VISIBLE_SPAN_MS
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now())
  const nowMs = Number.isFinite(referenceNowMs) ? referenceNowMs : liveNowMs
  const viewportRef = useRef(null)
  const dragRef = useRef(null)
  // 끄는 동안 띠는 손가락·마우스를 그대로 따라가고(dragViewMs), 지도 시각은 가장 가까운 자료 시각에 붙는다.
  // 자료 간격이 1시간 이상이면 띠까지 자료 시각에 묶을 때 수십 px 동안 아무것도 안 움직여 끄는 느낌이 없었다.
  const [dragViewMs, setDragViewMs] = useState(null)
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
  // Exact forecast times (SIGWX HIGH) are selectable only on an exact match, so they must be reachable ticks —
  // by keyboard and by drag — not just times the playback loop happens to step onto.
  const forecastMs = (Array.isArray(forecastTicksMs) ? forecastTicksMs : []).filter(Number.isFinite)
  const keyboardTicks = [...new Set([...pastTicksMs, ...forecastMs, ...futureMs])].sort((a, b) => a - b)
  const domain = buildTimelineDomain({ pastTicksMs, nwpTimesMs: futureMs, forecastTimesMs: forecastMs, nowMs })
  const selected = Number.isFinite(selectedMs)
    ? clampMs(domain, selectedMs)
    : (pastTicksMs.length ? pastTicksMs[pastTicksMs.length - 1] : nowMs)

  const view = Number.isFinite(dragViewMs) ? dragViewMs : selected
  const pct = (ms) => tapePercent({ ms, selectedMs: view, visibleSpanMs })
  const nowPct = Math.max(0, Math.min(100, pct(nowMs)))

  // Fill the whole visible window with tiered ruler ticks so the ruler is never empty.
  const visibleStart = view - visibleSpanMs * PLAYHEAD_RATIO
  const visibleEnd = view + visibleSpanMs * (1 - PLAYHEAD_RATIO)
  const tapeTicks = buildTapeTicks({ startMs: visibleStart, endMs: visibleEnd })
  const availabilitySegments = buildAvailabilitySegments(availableFrameEntries, visibleStart, visibleEnd)

  const windowPct = flightWindow && Number.isFinite(flightWindow.startMs) && Number.isFinite(flightWindow.endMs)
    && pct(flightWindow.endMs) >= 0 && pct(flightWindow.startMs) <= 100
    ? { start: pct(flightWindow.startMs), end: pct(flightWindow.endMs) } : null

  const commit = (ms) => onScrub?.(clampMs(domain, ms))
  // 끌기·터치는 실제 자료가 있는 시각에만 멈춘다. 자료 시각이 없으면(레이어가 모두 꺼짐) 자유롭게 움직인다.
  const snapToTick = (ms) => {
    if (!keyboardTicks.length) return ms
    let best = keyboardTicks[0]
    for (const tick of keyboardTicks) if (Math.abs(tick - ms) < Math.abs(best - ms)) best = tick
    return best
  }
  const firstTick = keyboardTicks[0]
  const lastTick = keyboardTicks.at(-1)
  const step = (direction) => { commit(pickAdjacentTimelineTick(keyboardTicks, selected, direction)); flashReadout() }

  const handlePointerDown = (event) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    dragRef.current = { startX: event.clientX, startSelected: selected, width: rect.width, committed: selected, raw: null, pending: null, frame: 0, timer: 0 }
    viewportRef.current.setPointerCapture?.(event.pointerId)
    setActive(true)
  }
  // 끄는 동안 띠 그리기는 화면 갱신(requestAnimationFrame)에 한 번만, 지도 자료 바꾸기는 120 ms에 한 번만 한다.
  // 포인터 이벤트마다 지도 전체를 다시 그리면 10분 간격 자료에서 프레임이 떨어진다. 손을 떼면 마지막 값을 바로 반영한다.
  const scheduleDrag = (raw) => {
    const drag = dragRef.current
    if (!drag) return
    drag.raw = raw
    if (!drag.frame) drag.frame = window.requestAnimationFrame(() => { drag.frame = 0; setDragViewMs(drag.raw) })
    const snapped = snapToTick(raw)
    if (snapped === drag.committed) return
    drag.pending = snapped
    if (drag.timer) return
    drag.timer = window.setTimeout(() => {
      drag.timer = 0
      if (Number.isFinite(drag.pending) && drag.pending !== drag.committed) { drag.committed = drag.pending; commit(drag.pending) }
    }, 120)
  }
  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const dxFraction = (event.clientX - drag.startX) / drag.width
    scheduleDrag(clampMs(domain, drag.startSelected + dragToTimeDelta(dxFraction, visibleSpanMs)))
  }
  const handlePointerEnd = (event) => {
    setActive(false)
    setDragViewMs(null)
    const drag = dragRef.current
    if (!drag) return
    window.cancelAnimationFrame(drag.frame)
    window.clearTimeout(drag.timer)
    if (Number.isFinite(drag.raw)) { const snapped = snapToTick(drag.raw); if (snapped !== drag.committed) commit(snapped) }
    dragRef.current = null
    viewportRef.current?.releasePointerCapture?.(event.pointerId)
  }
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') { step(-1); event.preventDefault() }
    else if (event.key === 'ArrowRight') { step(1); event.preventDefault() }
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
        {availabilitySegments.map(({ startMs, endMs }) => {
          const startPct = pct(startMs)
          const endPct = pct(endMs)
          return (
            <span
              key={`${startMs}-${endMs}`}
              className="timeline-rail__availability-segment"
              style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
              aria-hidden="true"
            />
          )
        })}
        {windowPct && (
          <span className="timeline-rail__flight-window" style={{ left: `${windowPct.start}%`, width: `${Math.max(0.4, windowPct.end - windowPct.start)}%` }}
            title={flightWindow.label} aria-hidden="true" />
        )}
        {pastTicksMs.map((ms) => (
          <span key={`p-${ms}`} className={`timeline-rail__frame${ms === selected ? ' is-selected' : ''}`} style={{ left: `${pct(ms)}%` }} aria-hidden="true" />
        ))}
        {futureMs.map((ms) => (
          <span key={`f-${ms}`} className={`timeline-rail__frame timeline-rail__frame--future${ms === selected ? ' is-selected' : ''}`} style={{ left: `${pct(ms)}%` }} aria-hidden="true" />
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

      {/* 재생 양옆: 자료가 있는 이전·다음 시각으로 한 칸씩(화살표키와 같다). */}
      <button type="button" className="timeline-rail__step is-prev" style={{ left: `${PLAYHEAD_RATIO * 100}%` }}
        onClick={() => step(-1)} disabled={!keyboardTicks.length || selected <= firstTick} aria-label="이전 자료 시각">
        <StepBack size={18} />
      </button>
      <button
        type="button"
        className="timeline-rail__play"
        style={{ left: `${PLAYHEAD_RATIO * 100}%` }}
        onClick={onPlayPause}
        aria-label={isPlaying ? '재생 일시정지' : '재생'}
      >
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <button type="button" className="timeline-rail__step is-next" style={{ left: `${PLAYHEAD_RATIO * 100}%` }}
        onClick={() => step(1)} disabled={!keyboardTicks.length || selected >= lastTick} aria-label="다음 자료 시각">
        <StepForward size={18} />
      </button>

      {/* ETD·ETA 글은 각 선 바로 위(시간 띠 밖)에 — 띠 안은 눈금 글자와 겹치고, 한쪽에 몰면 어느 선이 무엇인지 읽기 어렵다. */}
      {windowPct && [['etd', windowPct.start, flightWindow.etdLabel], ['eta', windowPct.end, flightWindow.etaLabel]]
        .filter(([, at, text]) => text && at >= 0 && at <= 100)
        .map(([key, at, text]) => (
          <span key={key} className={`timeline-rail__flight-mark is-${key}`} style={{ left: `${at}%` }} aria-hidden="true">{text}</span>
        ))}
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
