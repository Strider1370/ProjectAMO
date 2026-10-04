import './WeatherPointInfoControl.css'

export default function WeatherPointInfoControl({ enabled, onToggle }) {
  return <button type="button" className={`map-legend-toggle weather-point-info-toggle${enabled ? ' is-open' : ''}`}
    aria-pressed={enabled} title={enabled ? '지도 클릭으로 지점 값 조회 · 켜짐' : '지도 클릭으로 지점 값 조회 · 꺼짐'}
    onClick={onToggle}>
    지점 정보
  </button>
}
