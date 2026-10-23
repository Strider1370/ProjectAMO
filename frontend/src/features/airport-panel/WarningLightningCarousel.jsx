import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Zap } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { buildCurrentWarningModel } from './lib/currentWeatherViewModel.js'
import { fmtKstShort } from './lib/formatters.js'

const ROTATION_MS = 6000

export default function WarningLightningCarousel({ warning, lightning, airportKey }) {
  const { tz } = useTimeZone()
  const warnings = useMemo(() => buildCurrentWarningModel(warning, tz).items, [warning, tz])
  const slides = warnings.length
    ? warnings.flatMap((item, index) => [
      { kind: 'warning', key: `warning-${index}-${item.key}`, item },
      { kind: 'lightning', key: `lightning-${index}` },
    ])
    : [{ kind: 'lightning', key: 'lightning' }]
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const signature = `${airportKey}|${warnings.map((item) => `${item.key}:${item.timeText}`).join('|')}|${lightning.latestTime}|${lightning.count}`

  useEffect(() => { setIndex(0) }, [signature])
  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return undefined
    const updateMotion = () => setReducedMotion(media.matches)
    media.addEventListener?.('change', updateMotion)
    return () => media.removeEventListener?.('change', updateMotion)
  }, [])
  useEffect(() => {
    if (slides.length <= 1 || hovered || focused || !visible || reducedMotion) return undefined
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), ROTATION_MS)
    return () => window.clearInterval(timer)
  }, [slides.length, hovered, focused, visible, reducedMotion])

  const slide = slides[Math.min(index, slides.length - 1)]
  const isWarning = slide.kind === 'warning'
  const title = lightning.recent ? '최근 15분 낙뢰 관측' : '최근 30분 낙뢰 관측'
  const nearest = Number.isInteger(lightning.nearestKm) ? lightning.nearestKm : lightning.nearestKm.toFixed(1)

  return (
    <section
      className={`ap-observation-carousel${isWarning ? ' ap-observation-carousel--warning' : ' ap-observation-carousel--lightning'}`}
      aria-label="공항경보 및 낙뢰관측"
      aria-roledescription="캐러셀"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <div className="ap-observation-content" aria-live={hovered || focused ? 'polite' : 'off'}>
        {isWarning ? (
          <>
            <AlertTriangle size={22} aria-hidden="true" />
            <div className="ap-observation-copy">
              <strong className="ap-observation-heading">공항경보 · {slide.item.name}</strong>
              <span className="ap-observation-detail">{slide.item.timeText}</span>
            </div>
          </>
        ) : (
          <>
            <Zap size={22} aria-hidden="true" />
            <div className="ap-observation-copy">
              <strong className="ap-observation-heading">{title}</strong>
              <span className="ap-observation-detail"><span className={lightning.near ? 'ap-observation-near' : undefined}>공항에서 최단 {nearest}km</span> · {lightning.count}건 · 마지막 {fmtKstShort(lightning.latestTime, tz)} 관측</span>
              {lightning.dataStatus && <span className="ap-observation-source-status">{lightning.dataStatus}</span>}
            </div>
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="ap-observation-controls" role="group" aria-label="관측 안내 선택">
          {slides.map((option, optionIndex) => (
            <button
              key={option.key}
              type="button"
              className={`ap-observation-dot${optionIndex === index ? ' is-active' : ''}`}
              onClick={() => setIndex(optionIndex)}
              aria-label={`${optionIndex + 1}번째 안내: ${option.kind === 'warning' ? option.item.name : '낙뢰 관측'}`}
              aria-current={optionIndex === index ? 'true' : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}
