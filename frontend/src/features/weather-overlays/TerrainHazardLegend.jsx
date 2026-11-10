import { LegendKeyRow } from './MapLegend.jsx'
import { TERRAIN_HAZARD_ALT_FT, TERRAIN_HAZARD_RED, TERRAIN_HAZARD_YELLOW } from './lib/terrainHazardLayer.js'

// 지형 근접: 기준 고도를 범례 안에서 고른다(따로 연직 레일을 두지 않는다).
export default function TerrainHazardLegend({ altitudeFt, onAltitudeChange }) {
  return (
    <section className="hlegend terrain-hazard-legend" aria-label="지형 근접 범례">
      <span className="hlegend-unit">기준 고도</span>
      <div className="hlegend-title">지형 근접 · 기준 고도</div>
      <label className="hlegend-select">
        <select aria-label="지형 근접 기준 고도" value={altitudeFt} onChange={(event) => onAltitudeChange?.(Number(event.target.value))}>
          {TERRAIN_HAZARD_ALT_FT.map((ft) => <option key={ft} value={ft}>{ft.toLocaleString()} ft MSL</option>)}
        </select>
      </label>
      <LegendKeyRow items={[
        { key: 'red', label: '100 ft 이내·위', style: { backgroundColor: TERRAIN_HAZARD_RED } },
        { key: 'yellow', label: '1,000 ft 이내', style: { backgroundColor: TERRAIN_HAZARD_YELLOW } },
      ]} />
      <div className="hlegend-note">인천 FIR 지형 표고(MSL) 기준 · 송전선·철탑 등 장애물 미포함</div>
    </section>
  )
}
