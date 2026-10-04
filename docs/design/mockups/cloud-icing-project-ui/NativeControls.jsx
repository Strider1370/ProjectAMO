export default function NativeControls({ visibility, onToggle, level }) {
  const icingUnsupported = Number.parseFloat(level) < 300
  return <div className="native-cloud-icing-controls" role="group" aria-label="구름·착빙 지도 표시">
    <button type="button" className={`map-legend-toggle${visibility.cloud ? ' is-open' : ''}`} aria-pressed={!!visibility.cloud} onClick={() => onToggle('cloud')}>구름</button>
    <button type="button" className={`map-legend-toggle${visibility.icing ? ' is-open' : ''}`} aria-pressed={!!visibility.icing && !icingUnsupported} disabled={icingUnsupported} title={icingUnsupported ? '착빙 지원층 밖 (300 hPa 이상 기압층에서 제공)' : undefined} onClick={() => onToggle('icing')}>착빙</button>
  </div>
}
