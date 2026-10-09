import { ACI_BANDS } from './lib/aciExperimentModel.js'
import './AciExperiment.css'

export default function AciExperimentLegend({ overlay }) {
  if (!overlay.enabled) return null
  const { selected, problem } = overlay
  return (
    <section className="aci-experiment" aria-label="대류영역 범례">
      <strong>대류영역 · 실험 점수</strong>
      <div className="aci-experiment__bands">
        {ACI_BANDS.map((band, index) => (
          <span key={band.min}>
            <i className={index === 0 ? 'aci-experiment__transparent' : undefined}
              style={index === 0 ? undefined : { backgroundColor: band.color }} aria-hidden="true" />
            {index === 0 ? '<0.25 (투명)' : `${band.min.toFixed(2)}–${index === 3 ? '1.00' : ACI_BANDS[index + 1].min.toFixed(2)}`}
          </span>
        ))}
      </div>
      <p>지도 클릭으로 지점 값 확인</p>
      {problem && <p role="alert">{problem}</p>}
      {selected && (
        <p role="status">
          {Number(selected.lat).toFixed(2)}°N, {Number(selected.lon).toFixed(2)}°E · 점수 {Number(selected.score).toFixed(3)}
          <br />CAPE {Number(selected.cape).toFixed(0)} J/kg · 강수 {Number(selected.rainRate).toFixed(2)} mm/h · OLR {Number(selected.olr).toFixed(1)} W/m²
        </p>
      )}
    </section>
  )
}
