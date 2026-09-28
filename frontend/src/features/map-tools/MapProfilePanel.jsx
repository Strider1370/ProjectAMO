import { useState } from 'react'
import { ChartSpline } from 'lucide-react'
import { DistanceBody } from './MapToolsPanel.jsx'
import { toolStyles } from './toolStyles.js'
import { Input } from '../../shared/ui/fluent.js'

export default function MapProfilePanel({ measure, onClose, onOpenProfile, loading, error, warning }) {
  const s = toolStyles()
  const [altitudeInput, setAltitudeInput] = useState('10000')
  const altitudeFt = Number(altitudeInput)
  const altitudeValid = altitudeInput !== '' && Number.isInteger(altitudeFt) && altitudeFt >= 500 && altitudeFt <= 50000
  return (
    <div className={`${s.panel} map-profile-panel`} aria-label="연직단면도 선 지정">
      <div className={s.header}>
        <span><ChartSpline size={18} aria-hidden="true" /> 연직단면도</span>
        <button type="button" className={s.closeBtn} onClick={onClose} aria-label="연직단면도 도구 닫기">×</button>
      </div>
      <label className={s.coordRow}>
        <span className={s.coordLabel}>설정 고도 (ft)</span>
        <Input className={s.coordInput} type="number" min="500" max="50000" step="100"
          value={altitudeInput} onChange={(event) => setAltitudeInput(event.target.value)} />
      </label>
      {!altitudeValid && <span className={s.coordError} role="alert">500~50,000 ft 사이의 고도를 입력해 주세요.</span>}
      <DistanceBody s={s} distance={measure.distance} distanceDone={measure.distanceDone}
        undoVertex={measure.undoVertex} finishDistance={measure.finishDistance} clear={measure.clear}
        profileMode onOpenProfile={() => onOpenProfile(altitudeFt)} profileAltitudeValid={altitudeValid}
        profileLoading={loading} profileError={error} profileWarning={warning} />
    </div>
  )
}
