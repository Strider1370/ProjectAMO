import { formatReferenceTimeLabel } from './lib/weatherOverlayModel.js'

export default function QpfStatusCard({ status, tz = 'KST' }) {
  if (!status
    || !status.source
    || !status.unit
    || !Number.isFinite(status.analysisTimeMs)
    || !Number.isFinite(status.validTimeMs)
    || !Number.isFinite(status.leadMinutes)) return null

  const timeZone = tz === 'UTC' ? 'UTC' : 'KST'
  const analysisTime = formatReferenceTimeLabel(status.analysisTimeMs, timeZone)
  const validTime = formatReferenceTimeLabel(status.validTimeMs, timeZone)

  return (
    <section className="qpf-status-card" aria-label="초단기 강수예측 상태">
      <strong>초단기 강수예측</strong>
      <span>{status.source} · 기준 {analysisTime} {timeZone}</span>
      <span>선택 {validTime} {timeZone} · +{status.leadMinutes}분 · {status.unit}</span>
    </section>
  )
}
