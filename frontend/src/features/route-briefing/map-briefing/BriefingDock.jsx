import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import VerticalProfileViewer from '../VerticalProfileViewer.jsx'
import { useCrossSectionLayers } from '../crossSectionLayers.jsx'
import HazardRibbon from './HazardRibbon.jsx'
import { DOCUMENT_LABEL_WIDTH_PX, DOCUMENT_PROFILE_HEIGHT_PX, RIBBON_LABEL_WIDTH_PX, hazardSwatchStyle, profileHeightPx, profileOpenFor, readDockState, writeDockState } from './mapBriefingModel.js'

// 지도 아래 독: 위험 막대 + 기존 연직단면도(압축 모드). 둘은 따로 접고, 윗변 탭으로 독 전체를 접는다.
// 독 높이는 내용대로 — 위험 막대를 접으면 독이 줄 뿐 단면도가 커지지 않는다. 접힘·단면 높이는 브라우저에 기억.
// 단면도 그림의 가로축(0NM~끝)을 재서 위험 막대 가로축을 같은 세로선에 맞춘다.
// 줄 숨김(눈 아이콘)은 지도 색 띠에도 적용돼 MapBriefingView가 갖는다.
// variant="document": 문서형 브리핑 노선 섹션 안에 끼운 같은 부품. 패널 폭이 좁아 이름 칸을 고도 눈금 폭까지 줄이고
// 레이어 목록은 그림 위 한 줄로 둔다(MapBriefing.css .is-document). 독 전체 접기 탭·높이 알림·접힘 기억은 없다.
export default function BriefingDock({ ribbon, verticalProfile, crossSection, advisories, nwpTimeSelection, onSetWaypointNwpOffset, onSelectForecastHour, crossSectionHourLoading,
  selectedId, onSelect, onHover, highlightAdvisoryId = null, onHoverAdvisory, hiddenRows = [], onToggleRow, onHeightChange,
  variant = 'map', highlightRangeNm = null }) {
  const isDocument = variant === 'document'
  const [dock, setDock] = useState(() => isDocument ? { collapsed: false, ribbonOpen: true, profileOpen: true } : readDockState())
  const [profileRange, setProfileRange] = useState(null)
  const [trackInset, setTrackInset] = useState(null) // { left, right } px — 위험 막대 가로축이 단면도 그림과 맞도록
  const dockRef = useRef(null)
  const ribbonRef = useRef(null)
  const labelWidth = isDocument ? DOCUMENT_LABEL_WIDTH_PX : RIBBON_LABEL_WIDTH_PX
  // 기존 연직단면도와 같은 기본 레이어(브리핑 문서형 BriefingView와 동일).
  const [layers, toggleLayer] = useCrossSectionLayers({
    temp: true, wind: true, cloud: false, advisories: true,
    icing: true, tropopause: true, isotachs: true, moisture: true, turbulence: true,
  })

  useEffect(() => { if (!isDocument) writeDockState(dock) }, [dock, isDocument])
  useEffect(() => {
    const el = dockRef.current
    if (!onHeightChange) return undefined
    if (!el) { onHeightChange(0); return undefined }
    const observer = new ResizeObserver(() => onHeightChange(el.getBoundingClientRect().height))
    observer.observe(el)
    return () => { observer.disconnect(); onHeightChange(0) }
  }, [onHeightChange, dock.collapsed])

  const profileOpen = isDocument ? dock.profileOpen : profileOpenFor(dock, window.innerHeight)
  const heightPx = isDocument ? DOCUMENT_PROFILE_HEIGHT_PX : profileHeightPx(window.innerHeight)
  const total = verticalProfile?.axis?.totalDistanceNm
  const zoomed = Boolean(profileRange && total && (profileRange[0] > 0.5 || profileRange[1] < total - 0.5))

  // 확대하지 않은 단면도의 그림 영역(data-plot-left/right)을 재서 막대 축을 맞춘다. 확대 중에는 마지막 값 유지.
  const measure = useCallback(() => {
    const ribbonEl = ribbonRef.current
    const svg = dockRef.current?.querySelector('.mb-profile-body .vertical-profile-plot-svg')
    if (!ribbonEl || !svg || !profileOpen) { setTrackInset(null); return }
    if (zoomed) return
    const ribbonRect = ribbonEl.getBoundingClientRect()
    const svgRect = svg.getBoundingClientRect()
    const scale = svgRect.width / (Number(svg.getAttribute('width')) || svgRect.width)
    const left = svgRect.left + Number(svg.dataset.plotLeft) * scale - ribbonRect.left
    const right = ribbonRect.right - (svgRect.left + Number(svg.dataset.plotRight) * scale)
    if (Number.isFinite(left) && Number.isFinite(right) && left > 40) {
      setTrackInset((prev) => prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.right - right) < 0.5 ? prev : { left, right })
    }
  }, [profileOpen, zoomed])
  useLayoutEffect(() => {
    measure()
    const el = dockRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    const svg = el.querySelector('.mb-profile-body .vertical-profile-plot-svg')
    if (svg) observer.observe(svg)
    return () => observer.disconnect()
  }, [measure, verticalProfile, crossSection, dock.ribbonOpen])

  const toggle = (key) => setDock((d) => ({ ...d, [key]: key === 'profileOpen' && !isDocument ? !profileOpenFor(d, window.innerHeight) : !d[key] }))
  const fold = (open, onClick, label) => (
    <button type="button" className="mb-fold-btn" aria-expanded={open} onClick={onClick} aria-label={`${label} ${open ? '접기' : '펼치기'}`}>
      {open ? '접기' : '펼치기'} {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
    </button>
  )
  // 독 전체 접기 탭: 펼쳤을 때는 독 윗변 가운데, 접으면 시간 막대 바로 위에 남는다(문서형 접기 탭과 같은 역할).
  const collapseTab = (
    <button type="button" className={`mb-dock-tab${dock.collapsed ? ' is-collapsed' : ''}`} aria-expanded={!dock.collapsed}
      aria-label={dock.collapsed ? '경로상 위험·연직단면도 펼치기' : '경로상 위험·연직단면도 접기'}
      onClick={() => setDock((d) => ({ ...d, collapsed: !d.collapsed }))}>
      {dock.collapsed ? <><ChevronUp size={14} aria-hidden="true" /><span>경로상 위험 · 연직단면도</span></> : <ChevronDown size={14} aria-hidden="true" />}
    </button>
  )
  if (dock.collapsed && !isDocument) return collapseTab
  const profileTitle = <h3 className="mb-dock-title">연직단면도</h3>
  // 대류(실험)는 단면도 범례에 없어 위험 막대에 대류 줄이 있을 때만 같은 범례 줄에 덧붙인다.
  const legendExtra = ribbon?.rows?.some((row) => row.key === 'convection' && row.model.length)
    ? <span className="mb-legend-extra" title="KIM 대류영역(실험) 점수 0.5 이상 MOD, 0.75 이상 SEV">대류(실험){['MOD', 'SEV'].map((level) => <b key={level}><i style={hazardSwatchStyle('convection', level)} />{level}</b>)}</span>
    : null
  const profileFold = fold(profileOpen, () => toggle('profileOpen'), '연직단면도')

  return (
    <>
    {!isDocument && collapseTab}
    <section ref={dockRef} className={`mb-dock${profileOpen ? ' has-profile' : ''}${isDocument ? ' is-document' : ''}`} style={{ '--mb-label-w': `${labelWidth}px` }} aria-label="경로상 위험과 연직단면도">
      <div className="mb-dock-section is-ribbon">
        <header className="mb-ribbon-head">
          <h3 className="mb-dock-title">경로상 위험</h3>
          <span className="mb-info" tabIndex={0} role="img" aria-label="막대 = 수치예보(내 비행 고도 · MOD 이상), 틀 = 예보관 발표 SIGMET·태풍, 가로축 = 경로 전체. 걸리는 것이 없는 현상은 줄을 표시하지 않음"
            title="막대 = 수치예보(내 비행 고도 · MOD 이상) · 틀 = 예보관 발표 SIGMET·태풍 · 가로축 = 경로 전체 · 걸리는 것이 없는 현상은 줄을 표시하지 않음"><Info size={13} aria-hidden="true" /></span>
          {fold(dock.ribbonOpen, () => toggle('ribbonOpen'), '경로상 위험')}
        </header>
        {dock.ribbonOpen && (
          <div ref={ribbonRef}>
            <HazardRibbon ribbon={ribbon} profileRange={profileOpen ? profileRange : null} selectedId={selectedId} onSelect={onSelect} onHover={onHover} trackInset={trackInset}
              highlightAdvisoryId={highlightAdvisoryId} hiddenRows={hiddenRows} onToggleRow={onToggleRow} />
          </div>
        )}
      </div>
      <div className="mb-dock-section is-profile">
        {profileOpen && verticalProfile ? (
          <div className="mb-profile-body" style={{ height: heightPx }}>
            <VerticalProfileViewer embedded fillContainer compact compactTitle={profileTitle} compactActions={profileFold} compactLegendExtra={legendExtra} plotPaddingLeft={labelWidth}
              profile={verticalProfile} crossSection={crossSection} layers={layers} onToggleLayer={toggleLayer}
              advisories={advisories} nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset}
              onSelectForecastHour={onSelectForecastHour} crossSectionHourLoading={crossSectionHourLoading} onRangeChange={setProfileRange} highlightRangeNm={highlightRangeNm}
              highlightAdvisoryId={highlightAdvisoryId} onHoverAdvisory={onHoverAdvisory} />
          </div>
        ) : (
          <header className="mb-dock-head">
            {profileTitle}
            <span className="mb-dock-sub">{profileOpen ? '연직단면도 자료가 없습니다.' : '접힘 · 펼치면 기존 연직단면도'}</span>
            {profileFold}
          </header>
        )}
      </div>
    </section>
    </>
  )
}
