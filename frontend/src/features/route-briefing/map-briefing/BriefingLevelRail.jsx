import PressureLevelSlider from '../../weather-overlays/PressureLevelSlider.jsx'
import { KIM_PRESSURE_LEVELS } from '../../weather-overlays/lib/pressureLevelModel.js'

// 지도형 브리핑 중 KIM 레이어가 하나도 켜져 있지 않을 때의 고도 슬라이더(설계 §2.1: 브리핑 중에는 레이어가 꺼져 있어도 보인다).
// 위험 고도·비행 범위를 보고 고도를 미리 고를 수 있다 — 고른 기압면은 KIM 레이어를 켜면 그대로 쓰인다.
// 레이어가 켜지면 MapView의 기존 KIM 슬라이더(같은 표시 포함)로 바뀐다.
export default function BriefingLevelRail({ selection, onSelectionChange }) {
  const activeValue = selection?.level ?? KIM_PRESSURE_LEVELS[0].id
  return (
    <div className="vertical-level-rail-item">
      <span className="vertical-level-rail-label">KIM</span>
      <PressureLevelSlider levels={KIM_PRESSURE_LEVELS} activeValue={activeValue}
        onSelect={(level) => onSelectionChange?.((previous) => previous?.level === level ? previous : { ...(previous ?? {}), level })} />
    </div>
  )
}
