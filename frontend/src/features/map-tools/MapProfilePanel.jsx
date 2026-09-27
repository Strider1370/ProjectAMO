import { ChartSpline } from 'lucide-react'
import { DistanceBody } from './MapToolsPanel.jsx'
import { toolStyles } from './toolStyles.js'

export default function MapProfilePanel({ measure, onClose, onOpenProfile, loading, error, warning }) {
  const s = toolStyles()
  return (
    <div className={`${s.panel} map-profile-panel`} aria-label="연직단면도 선 지정">
      <div className={s.header}>
        <span><ChartSpline size={18} aria-hidden="true" /> 연직단면도</span>
        <button type="button" className={s.closeBtn} onClick={onClose} aria-label="연직단면도 도구 닫기">×</button>
      </div>
      <DistanceBody s={s} distance={measure.distance} distanceDone={measure.distanceDone}
        undoVertex={measure.undoVertex} finishDistance={measure.finishDistance} clear={measure.clear}
        profileMode onOpenProfile={onOpenProfile} profileLoading={loading} profileError={error} profileWarning={warning} />
    </div>
  )
}
