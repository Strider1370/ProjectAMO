import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CircleCheck, Map as MapIcon, MousePointerClick, Route, TriangleAlert } from 'lucide-react'
import { AIRPORT_CATEGORY_COLORS, AIRPORT_CATEGORY_UNKNOWN_COLOR } from '../map/lib/airportStationModel.js'
import { resolveTargetRect, isRevealed } from './targetRect.js'
import './Tour.css'

// 첫 화면 카드의 기능 소개 아이콘(tourSteps의 features[].icon).
const FEATURE_ICONS = { map: MapIcon, route: Route }

// 공항 단계의 비행등급 색 견본 — 지도 마커와 같은 색.
const FLIGHT_CATEGORY_LEGEND = [
  ...Object.entries(AIRPORT_CATEGORY_COLORS).map(([label, color]) => ({ label, color })),
  { label: '자료 없음', color: AIRPORT_CATEGORY_UNKNOWN_COLOR },
]

const TT_W = 340  // 툴팁 폭(placeTooltip 계산용, CSS와 일치)
const PAD = 6     // 스포트라이트 구멍 여백

// rect 기준 여백 큰 쪽에 툴팁 배치(아래→오른쪽→왼쪽→위). 뷰포트 안으로 클램프.
// 왼쪽 배치를 넣어 오른쪽 도킹 패널(공항)이 툴팁을 안 가리게 — 열린 패널 반대편 빈 공간에.
function placeTooltip(rect, vw, vh, ttH) {
  const clampX = (x) => Math.max(8, Math.min(x, vw - TT_W - 8))
  const clampY = (y) => Math.max(8, Math.min(y, vh - ttH - 8))
  if (vh - rect.bottom > ttH + 16) return { x: clampX(rect.left), y: rect.bottom + 12 }       // 아래
  if (vw - rect.right > TT_W + 16) return { x: rect.right + 12, y: clampY(rect.top) }          // 오른쪽
  if (rect.left > TT_W + 16) return { x: rect.left - TT_W - 12, y: clampY(rect.top) }          // 왼쪽(오른쪽 패널)
  if (rect.top > ttH + 16) return { x: clampX(rect.left), y: rect.top - ttH - 12 }             // 위
  return { x: clampX((vw - TT_W) / 2), y: clampY(vh - ttH - 24) }                              // 폴백: 하단 중앙
}

const sameRect = (a, b) => Math.round(a.left) === Math.round(b.left) && Math.round(a.top) === Math.round(b.top)
  && Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height)

export default function TourOverlay({ tour, getAirportPoint, onFocusAirport, onSelectAirport }) {
  const { active, step, stepNumber, total, isLast, isFirst, next, back, skip } = tour
  const [rect, setRect] = useState(null)
  const [pos, setPos] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [demoShown, setDemoShown] = useState(false)
  const tipRef = useRef(null)
  const nextBtnRef = useRef(null)
  const focusedStepRef = useRef(null)

  // 대상 rect 지속 측정 — 지도 pan/zoom·사이드바 트랜지션에도 구멍이 따라붙게.
  // ponytail: rAF 재측정, 계산 1회/프레임이라 저렴. 프로파일에 걸리면 ResizeObserver+moveend로 교체.
  // mapAirport 스텝은 공항 좌표가 처음 확보된 순간(rect 최초 잡힘 = 데이터·지도 준비 완료)에 flyTo 1회 —
  // 진입 즉시 쏘면 데이터 로드 전이라 no-op되므로. flyTo가 마커를 화면 중앙·확대로 옮겨 클릭도 정확해짐.
  useEffect(() => {
    if (!active || !step) return
    focusedStepRef.current = null
    let raf
    const measure = () => {
      // 예시가 있는 스텝은 실제 대상(예: 발표 중인 위험 요약 막대)이 없을 때만 예시를 띄운다.
      setDemoShown(Boolean(step.demo && step.target && !document.querySelector(step.target)))
      const rev = isRevealed(step)
      setRevealed(rev) // 값 같으면 React가 리렌더 생략
      const r = resolveTargetRect(step, getAirportPoint)
      if (r) {
        // 값이 바뀔 때만 갱신 — 매 프레임 새 객체를 넣으면 멈춰 있어도 초당 60번 다시 그린다.
        setRect((prev) => (prev && sameRect(prev, r) ? prev : r))
        // 마커 단계(패널 열리기 전)에만 flyTo. 패널이 열리면(rev) 카메라 안 건드림.
        if (step.mapAirport && !rev && focusedStepRef.current !== step.id) {
          focusedStepRef.current = step.id
          onFocusAirport?.(step.mapAirport)
        }
      }
      raf = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(raf)
  }, [active, step, getAirportPoint, onFocusAirport])

  // 툴팁 위치 = rect + 실제 툴팁 높이로 계산.
  useLayoutEffect(() => {
    if (!rect) return
    const ttH = tipRef.current?.offsetHeight || 132
    const next = placeTooltip(rect, window.innerWidth, window.innerHeight, ttH)
    setPos((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next))
  }, [rect, step])

  // 스텝 전환 시 [다음]에 포커스(키보드 접근).
  useEffect(() => {
    if (active && step) nextBtnRef.current?.focus()
  }, [active, step])

  if (!active || !step) return null

  // 첫 화면 등 대상 없는 스텝: 화면 전체를 어둡게 하고 가운데 카드.
  if (step.center) {
    return (
      <div className="tour-root" role="presentation">
        <div className="tour-scrim" />
        <div className="tour-tip tour-tip--center" role="dialog" aria-modal="true" aria-label="사용 안내">
          {step.hero && (
            <div className="tour-welcome-hero" style={{ backgroundImage: `url(${step.hero})` }}>
              {step.badge && <span className="tour-welcome-badge">{step.badge}</span>}
              {step.title && <h2 className="tour-welcome-title">{step.title}</h2>}
            </div>
          )}
          <div className="tour-welcome-body">
            {!step.hero && step.title && <h2 className="tour-tip-title">{step.title}</h2>}
            <p className="tour-welcome-lead" aria-live="polite">{step.text}</p>
            {step.features?.length > 0 && (
              <ul className="tour-welcome-features">
                {step.features.map((feature) => {
                  const Icon = FEATURE_ICONS[feature.icon] ?? MapIcon
                  return (
                    <li key={feature.title}>
                      <span className="tour-welcome-icon" aria-hidden="true"><Icon size={18} /></span>
                      <div><strong>{feature.title}</strong><p>{feature.text}</p></div>
                    </li>
                  )
                })}
              </ul>
            )}
            {step.caution && (
              <div className="tour-tip-caution" role="note">
                <TriangleAlert size={16} aria-hidden="true" />
                <div><span className="tour-tip-caution-label">주의</span><p>{step.caution}{step.cautionEmphasis && <> <strong>{step.cautionEmphasis}</strong></>}</p></div>
              </div>
            )}
            {step.note && <p className="tour-welcome-note">{step.note}</p>}
            <div className="tour-tip-actions">
              <button type="button" className="tour-btn tour-btn-ghost" onClick={skip}>건너뛰기</button>
              <div className="tour-tip-spacer" />
              <button type="button" className="tour-btn tour-btn-primary" ref={nextBtnRef} onClick={next}>{step.nextLabel ?? '다음'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 예시 배지(발표된 SIGMET·AIRMET이 없을 때): 실제 위험 요약 막대와 같은 자리(지도 위 가운데)에 띄워 강조한다.
  const demo = demoShown && step.demo === 'advisory' && (
    <div className="tour-demo-advisory" data-tour-demo="advisory" aria-hidden="true">
      <span className="is-sigmet">SIGMET <b>2</b></span>
      <span className="is-airmet">AIRMET <b>1</b></span>
      <em>예시</em>
    </div>
  )
  if (!rect) return demo ? <div className="tour-root" role="presentation">{demo}</div> : null

  // 마커 단계(패널 열리기 전)에만 원형·클릭형 구멍. 패널 열리면 일반 하이라이트(패널 그대로 조작 가능).
  const showMarker = step.mapAirport && !revealed

  return (
    <div className="tour-root" role="presentation">
      {/* 스포트라이트 구멍: box-shadow가 바깥 전체를 딤. 사이드바/지도 스텝은 pointer-events:none로
          밑 대상 클릭 통과. mapAirport 스텝은 구멍 자체를 버튼으로 — canvas 마커 히트테스트에 의존하지 않고
          클릭 시 해당 공항 선택(실제 패널 열림)→watch 진행. 하이라이트 밖(딤 영역)의 다른 마커는 여전히 직접 클릭 가능. */}
      {demo}
      <div
        className={`tour-hole${showMarker ? ' tour-hole--round tour-hole--clickable' : ''}`}
        style={{
          top: rect.top - PAD, left: rect.left - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        }}
        role={showMarker ? 'button' : undefined}
        aria-label={showMarker ? `${step.mapAirport} 선택` : undefined}
        onClick={showMarker ? () => onSelectAirport?.(step.mapAirport) : undefined}
      />
      {pos && (
        <div
          ref={tipRef}
          className="tour-tip"
          style={{ top: pos.y, left: pos.x }}
          role="dialog"
          aria-modal="true"
          aria-label="사용 안내"
        >
          <div className="tour-tip-head">
            {step.title && <h2 className="tour-tip-title">{step.title}</h2>}
            <span className="tour-tip-progress">{stepNumber} / {total}</span>
          </div>
          <p className="tour-tip-text" aria-live="polite">{step.text}</p>
          {step.legend === 'flightCategory' && (
            <ul className="tour-tip-legend" aria-label="비행등급 색">
              {FLIGHT_CATEGORY_LEGEND.map(({ label, color }) => (
                <li key={label}><span style={{ background: color }} aria-hidden="true" />{label}</li>
              ))}
            </ul>
          )}
          {demoShown && step.demoText && <p className="tour-tip-note">{step.demoText}</p>}
          {revealed && step.revealedText
            ? <p className="tour-tip-action is-done"><CircleCheck size={15} aria-hidden="true" />{step.revealedText}</p>
            : step.action && <p className="tour-tip-action"><MousePointerClick size={15} aria-hidden="true" />{step.action}</p>}
          <div className="tour-tip-actions">
            <button type="button" className="tour-btn tour-btn-ghost" onClick={skip}>건너뛰기</button>
            <div className="tour-tip-spacer" />
            {!isFirst && (
              <button type="button" className="tour-btn tour-btn-ghost" onClick={back}>이전</button>
            )}
            <button type="button" className="tour-btn tour-btn-primary" ref={nextBtnRef} onClick={next}>
              {isLast ? '완료' : '다음'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
