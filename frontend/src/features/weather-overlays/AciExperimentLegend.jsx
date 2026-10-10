import { ACI_BANDS } from './lib/aciExperimentModel.js'
import './AciExperiment.css'

export default function AciExperimentLegend({ overlay }) {
  if (!overlay.enabled) return null
  const { problem } = overlay
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
      {problem && <p role="alert">{problem}</p>}
    </section>
  )
}
