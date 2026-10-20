import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import VerticalProfileViewer from '../VerticalProfileViewer.jsx'
import { useCrossSectionLayers } from '../crossSectionLayers.jsx'
import HazardRibbon from './HazardRibbon.jsx'
import { dockHeightPx, profileOpenFor, readDockState, writeDockState } from './mapBriefingModel.js'

const MIN_HEIGHT = 220
const MAX_HEIGHT_RATIO = 0.7

// 지도 아래 독: 위험 막대 + 기존 연직단면도. 둘은 따로 접고, 위쪽 손잡이로 높이를 바꾼다.
// 접힘·높이는 다음 브리핑에도 그대로(브라우저 기억).
export default function BriefingDock({ ribbon, verticalProfile, crossSection, advisories, nwpTimeSelection, onSetWaypointNwpOffset, onSelectForecastHour, crossSectionHourLoading, selectedId, onSelect, onHeightChange }) {
  const [dock, setDock] = useState(readDockState)
  const [profileRange, setProfileRange] = useState(null)
  const [hiddenRows, setHiddenRows] = useState([])
  const dockRef = useRef(null)
  // 기존 연직단면도와 같은 기본 레이어(브리핑 문서형 BriefingView와 동일).
  const [layers, toggleLayer] = useCrossSectionLayers({
    temp: true, wind: true, cloud: false, advisories: true,
    icing: true, tropopause: true, isotachs: true, moisture: true, turbulence: true,
  })

  useEffect(() => { writeDockState(dock) }, [dock])
  useEffect(() => {
    const el = dockRef.current
    if (!el || !onHeightChange) return undefined
    const observer = new ResizeObserver(() => onHeightChange(el.getBoundingClientRect().height))
    observer.observe(el)
    return () => { observer.disconnect(); onHeightChange(0) }
  }, [onHeightChange])

  const startResize = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startY = event.clientY
    const startHeight = dockHeightPx(dock, window.innerHeight)
    const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO
    const move = (e) => setDock((d) => ({ ...d, heightPx: Math.round(Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + startY - e.clientY))) }))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const resizeByKey = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const step = event.key === 'ArrowUp' ? 20 : -20
    setDock((d) => ({ ...d, heightPx: Math.min(window.innerHeight * MAX_HEIGHT_RATIO, Math.max(MIN_HEIGHT, dockHeightPx(d, window.innerHeight) + step)) }))
  }
  const heightPx = dockHeightPx(dock, window.innerHeight)
  const profileOpen = profileOpenFor(dock, window.innerHeight)
  const toggle = (key) => setDock((d) => ({ ...d, [key]: key === 'profileOpen' ? !profileOpenFor(d, window.innerHeight) : !d[key] }))
  const fold = (open, onClick, label) => (
    <button type="button" className="mb-fold-btn" aria-expanded={open} onClick={onClick} aria-label={`${label} ${open ? '접기' : '펼치기'}`}>
      {open ? '접기' : '펼치기'} {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
    </button>
  )

  return (
    <section ref={dockRef} className={`mb-dock${profileOpen ? ' has-profile' : ''}`} style={profileOpen ? { height: heightPx } : undefined} aria-label="경로상 위험과 연직단면도">
      {profileOpen && (
        <div className="mb-dock-handle" role="separator" aria-orientation="horizontal" aria-label="독 높이 조절" tabIndex={0}
          aria-valuenow={heightPx} onPointerDown={startResize} onKeyDown={resizeByKey}><span /></div>
      )}
      <div className="mb-dock-section is-ribbon">
        <header className="mb-dock-head">
          <h3>경로상 위험</h3>
          <span className="mb-dock-sub">막대 = 수치예보(내 비행 고도 · MOD 이상) · 틀 = 예보관 발표 SIGMET/AIRMET · 경로 전체</span>
          {fold(dock.ribbonOpen, () => toggle('ribbonOpen'), '경로상 위험')}
        </header>
        {dock.ribbonOpen && (
          <HazardRibbon ribbon={ribbon} profileRange={profileOpen ? profileRange : null} selectedId={selectedId} onSelect={onSelect}
            hiddenRows={hiddenRows} onToggleRow={(key) => setHiddenRows((rows) => rows.includes(key) ? rows.filter((r) => r !== key) : [...rows, key])} />
        )}
      </div>
      <div className="mb-dock-section is-profile">
        <header className="mb-dock-head">
          <h3>연직단면도</h3>
          {!profileOpen && <span className="mb-dock-sub">접힘 · 펼치면 기존 연직단면도</span>}
          {fold(profileOpen, () => toggle('profileOpen'), '연직단면도')}
        </header>
        {profileOpen && (
          <div className="mb-profile-body">
            {verticalProfile
              ? <VerticalProfileViewer embedded fillContainer profile={verticalProfile} crossSection={crossSection} layers={layers} onToggleLayer={toggleLayer}
                  advisories={advisories} nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset}
                  onSelectForecastHour={onSelectForecastHour} crossSectionHourLoading={crossSectionHourLoading} onRangeChange={setProfileRange} />
              : <p className="mb-ribbon-empty">연직단면도 자료가 없습니다.</p>}
          </div>
        )}
      </div>
    </section>
  )
}
