import { ACIM_DISPLAY_BANDS } from '../../../../shared/acim.js'
import { LegendScale } from './MapLegend.jsx'
import { MAP_LAYER_OPACITY } from './lib/mapLayerOpacity.js'
import './AciExperiment.css'

// 원본 일기도 색 중 표시 기준(FL250 이상) 다섯 단계만 쓴다. ACIM 운정고도는 25 FL 간격 값이라 칸마다 그 값을 단다.
export default function AciExperimentLegend({ overlay }) {
  if (!overlay.enabled) return null
  const { problem } = overlay
  return (
    <LegendScale title="대류영역 · ACIM 운정 FL" unit="운정 FL" ariaLabel="대류영역 범례" opacity={MAP_LAYER_OPACITY.acim}
      entries={ACIM_DISPLAY_BANDS.map(band => ({ color: band.color, label: String(band.minFl) }))}
      note="강한 대류(운정 FL250 이상)만 표시"
      hint="국립기상과학원 ACIM 검증 기준(레이더 에코 정상고도 FL250 이상). FL350은 변환표의 최상위 등급입니다.">
      {problem && <p className="aci-experiment__problem" role="alert">{problem}</p>}
    </LegendScale>
  )
}
