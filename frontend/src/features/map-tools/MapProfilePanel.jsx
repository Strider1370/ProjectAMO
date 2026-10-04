import { useState } from 'react'
import { ChartSpline, ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react'
import './MapProfilePanel.css'

const formatNm = (nm) => `${nm.toFixed(nm < 10 ? 2 : 1)} nm`

function routeSteps(count, done) {
  if (count === 0) return [{ label: '시작', selected: false }, { label: '끝', selected: false }]
  if (count === 1) return [{ label: '시작', selected: true }, { label: '다음 점', selected: false }]
  const indices = count > 4 ? [0, 1, null, count - 1] : Array.from({ length: count }, (_, index) => index)
  return indices.map((index) => ({
    label: index === null ? '···' : index === 0 ? '시작' : done && index === count - 1 ? '끝' : `WP${index}`,
    selected: index !== null,
  }))
}

export default function MapProfilePanel({ measure, onClose, onOpenProfile, loading, error, warning }) {
  const [altitudeInput, setAltitudeInput] = useState('10000')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const altitudeFt = Number(altitudeInput)
  const altitudeValid = altitudeInput !== '' && Number.isInteger(altitudeFt) && altitudeFt >= 500 && altitudeFt <= 60000
  const count = measure.distance?.count ?? 0
  const done = measure.distanceDone
  const steps = routeSteps(count, done)
  const state = done ? '완료' : count ? '그리는 중' : '시작 전'
  const hint = done
    ? '경로가 준비됐습니다. 고도를 확인하고 단면도를 여세요.'
    : count ? '지도를 계속 클릭해 지점을 추가하세요.' : '지도에서 출발점을 클릭해 경로를 시작하세요.'

  return (
    <section className="map-profile-panel" aria-label="연직단면도 선 지정">
      <header className="map-profile-header">
        <span className="map-profile-header-icon"><ChartSpline size={18} aria-hidden="true" /></span>
        <span className="map-profile-header-copy">
          <strong>연직단면도 만들기</strong>
          <small>지도 위에 경로를 그립니다</small>
        </span>
        <button type="button" className="map-profile-close" onClick={onClose} aria-label="연직단면도 도구 닫기"><X size={18} /></button>
      </header>

      <div className="map-profile-altitude">
        <div className="map-profile-field-heading">
          <label htmlFor="map-profile-altitude-input">설정 고도</label>
          <span>500~60,000 ft</span>
        </div>
        <div className={`map-profile-altitude-control${altitudeValid ? '' : ' is-invalid'}`}>
          <input id="map-profile-altitude-input" type="number" min="500" max="60000" step="100"
            inputMode="numeric" value={altitudeInput} aria-label="설정 고도 (ft)"
            aria-invalid={!altitudeValid} aria-describedby={altitudeValid ? undefined : 'map-profile-altitude-error'}
            onChange={(event) => setAltitudeInput(event.target.value)} />
          <span aria-hidden="true">ft</span>
        </div>
        {!altitudeValid && <p className="map-profile-error" id="map-profile-altitude-error" role="alert">500~60,000 ft 사이의 고도를 입력해 주세요.</p>}
      </div>

      <div className="map-profile-route">
        <div className="map-profile-route-heading">
          <strong>경로</strong>
          <span className={`map-profile-state${done ? ' is-done' : ''}`}>{state}</span>
        </div>
        <p className="map-profile-hint">{hint}</p>
        <div className="map-profile-progress" aria-label={`경로: ${steps.map((step) => step.label).join(', ')}`}>
          {steps.map((step, index) => (
            <div className={`map-profile-progress-step${step.selected ? ' is-selected' : ''}`} key={`${step.label}-${index}`}>
              <span className={`map-profile-progress-dot${step.selected ? ' is-selected' : ''}`} aria-hidden="true" />
              <span className="map-profile-progress-label">{step.label}</span>
            </div>
          ))}
        </div>

        {count >= 2 && (
          <div className="map-profile-distance">
            <div className="map-profile-distance-summary">
              <span>{count}개 지점 · 총 거리</span>
              <strong>{formatNm(measure.distance.totalNm)}</strong>
            </div>
            {measure.distance.segsNm.length > 1 && (
              <>
                <button type="button" className="map-profile-details-toggle" aria-expanded={detailsOpen}
                  aria-controls="map-profile-segments" onClick={() => setDetailsOpen((value) => !value)}>
                  구간 거리 {detailsOpen ? '접기' : '보기'}
                  {detailsOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                </button>
                {detailsOpen && (
                  <div className="map-profile-segments" id="map-profile-segments">
                    {measure.distance.segsNm.map((nm, index) => (
                      <div key={index}><span>구간 {index + 1}</span><strong>{formatNm(nm)}</strong></div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {(error || warning) && <p className={`map-profile-status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || warning}</p>}
      <div className="map-profile-actions">
        {count > 0 && (
          <button type="button" className="map-profile-secondary" onClick={done ? measure.clear : count === 1 ? measure.clear : measure.undoVertex}>
            <RotateCcw size={14} aria-hidden="true" />
            {done ? '새로 그리기' : count === 1 ? '처음부터' : '마지막 점'}
          </button>
        )}
        <button type="button" className="map-profile-primary" disabled={count < 2 || !altitudeValid || loading}
          onClick={() => onOpenProfile(altitudeFt)}>
          {loading ? '단면도 불러오는 중…' : count < 2 ? '점을 더 선택하세요' : '이 경로로 단면도 열기'}
          {!loading && count >= 2 && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </section>
  )
}
