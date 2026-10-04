import './CloudIcingMapControls.css'

const STATUS = { loading: '불러오는 중', refreshing: '갱신 중', error: '자료 오류', unavailable: '자료 없음', unsupported: '고정 자료 없음' }
export default function CloudIcingMapControls({ visibility, onToggle, level, statuses = {} }) {
  const unsupported = Number.parseFloat(level) < 300
  return <div className="cloud-icing-map-controls" role="group" aria-label="구름·착빙 지도 표시">
    {['cloud', 'icing'].map(id => {
      const unavailable = id === 'icing' && unsupported
      const label = id === 'cloud' ? '구름' : '착빙'
      const status = unavailable ? '지원층 밖' : STATUS[statuses[id]]
      return <button key={id} type="button" className={`map-legend-toggle${visibility[id] && !unavailable ? ' is-open' : ''}`}
        aria-pressed={!!visibility[id] && !unavailable} disabled={unavailable}
        title={status ? `${label} · ${status}` : label} onClick={() => onToggle(id)}>
        {label}{visibility[id] && status && <span className="cloud-icing-map-status" role="status">{status}</span>}
      </button>
    })}
  </div>
}
