import {
  Radar, Satellite, Zap, Wind, Thermometer, Droplets,
  Snowflake, Activity, Eye, AlertTriangle, AlertOctagon, CloudFog, Globe, Cloud, CloudLightning, Mountain,
  Tornado,
} from 'lucide-react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'

// Representative icon per weather layer for the tile grid (legend-like).
const WEATHER_TILE_ICON = {
  radar: Radar,
  radarOverseas: Globe, // 해외 = Globe (SIGMET(해외)와 동일 규칙)
  echoTop: Mountain,
  satellite: Satellite,
  ci: CloudLightning,
  ctps: Cloud,
  lightning: Zap,
  wind: Wind,
  temp: Thermometer,
  cloud: Droplets,
  icing: Snowflake,
  turbulence: Activity,
  visibility: Eye,
  ceiling: CloudFog,
  sigmet: AlertTriangle,
  sigmet_intl: Globe,
  airmet: AlertOctagon,
  sigwx: CloudFog,
  typhoon: Tornado,
  terrainHazard: Mountain,
}

function WeatherOverlayPanel({
  layers,
  visibility,
  onToggle,
  onClose,
  onClearAll,
  isLayerDisabled,
  getLayerBadge,
  showWind = true,
  radarWindAvailable = false,
  radarWindRequested = false,
  radarWindHeightM = 1524,
  onRadarWindRequestedChange,
  onRadarWindHeightChange,
  terrainAltitudeFt = 3000,
}) {
  const isMobile = useIsMobile()
  void onRadarWindHeightChange
  const TEMP_HIDDEN_LAYER_IDS = []
  // 순서는 조종사가 보는 급한 순서 — 발효 중인 위험기상이 먼저, 그다음 실제 관측(레이더·위성),
  // 마지막이 예보(수치모델). 항적(ADS-B)은 기상이 아니라 교통이라 별도 '항적' 패널에 있다.
  const groups = [
    { id: 'hazards', title: '위험기상', ids: ['sigmet', 'sigmet_intl', 'airmet', 'sigwx', 'typhoon'] },
    {
      id: 'observation',
      title: '레이더/위성',
      ids: ['radar', 'radarOverseas', 'echoTop', 'lightning', 'satellite', 'ci', 'ctps'],
    },
    { id: 'nwp', title: '수치모델', ids: showWind ? ['wind', 'temp', 'cloud', 'icing', 'turbulence', 'visibility', 'ceiling'] : [] },
    { id: 'terrain', title: '지형', ids: ['terrainHazard'] },
  ]
  const layerLabels = {
    radar: '레이더',
    radarOverseas: '해외 레이더',
    echoTop: '에코탑(재산출)',
    satellite: '위성',
    ci: '대류 가능성',
    ctps: '운정고도',
    lightning: '낙뢰',
    wind: '바람',
    temp: '기온',
    cloud: '습도',
    icing: '착빙',
    turbulence: '난류',
    sigmet: 'SIGMET(국내)',
    sigmet_intl: 'SIGMET(해외)',
    airmet: 'AIRMET',
    sigwx: 'SIGWX',
    typhoon: '태풍',
    visibility: '시정',
    ceiling: '운고',
    terrainHazard: '지형 근접',
  }
  const visibleLayers = layers.filter((layer) => showWind || !['wind', 'temp', 'cloud', 'icing'].includes(layer.id))
  const activeCount = visibleLayers.filter((layer) => visibility[layer.id] && !isLayerDisabled(layer.id)).length
  const layerById = new Map(visibleLayers.map((layer) => [layer.id, layer]))

  // 데스크톱·모바일 공통 타일 그리드 (버튼식 토글).
  const tileGroups = (
    <div className="layer-tile-groups">
      {groups.filter((group) => group.ids.some((id) => layerById.has(id) && !TEMP_HIDDEN_LAYER_IDS.includes(id))).map((group) => (
        <section key={group.title} className="layer-tile-group">
          <div className="layer-tile-group-title">
            {group.title}
            {group.id === 'observation' && visibility.radar && (
              <button
                type="button"
                className="layer-tile-group-title-action"
                onClick={() => onRadarWindRequestedChange?.((prev) => !prev)}
                aria-label={`레이더 바람장 (WISSDOM) · ${radarWindHeightM.toLocaleString()} m`}
                aria-pressed={radarWindRequested}
                disabled={!radarWindAvailable}
                aria-describedby={!radarWindAvailable ? 'radar-wind-unavailable' : undefined}
              >
                레이더 바람장 (WISSDOM) · {radarWindHeightM.toLocaleString()} m
              </button>
              {!radarWindAvailable && <span id="radar-wind-unavailable">표시 시각의 WISSDOM 자료 없음</span>}
            )}
          </div>
          <div className="layer-tile-grid">
            {group.ids.map((id) => {
              if (TEMP_HIDDEN_LAYER_IDS.includes(id)) return null
              if (!layerById.has(id)) return null
              const Icon = WEATHER_TILE_ICON[id]
              const active = !!visibility[id] && !isLayerDisabled(id)
              const disabled = isLayerDisabled(id)
              const badge = getLayerBadge(id)
              return (
                <button
                  key={id}
                  type="button"
                  className={`layer-tile${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                  onClick={() => onToggle(id)}
                  disabled={disabled}
                  aria-pressed={active}
                >
                  <span className="layer-tile-visual">{Icon && <Icon size={22} strokeWidth={2} />}</span>
                  <span className="layer-tile-label">{layerLabels[id]}</span>
                  {badge > 0 && <span className="layer-tile-badge">{badge}</span>}
                  {active && <span className="layer-tile-check" aria-hidden="true">✓</span>}
                </button>
              )
            })}
          </div>
          {group.id === 'terrain' && visibility.terrainHazard && (
            <p className="terrain-hazard-note">
              기준 고도는 오른쪽 고도 레일에서 고릅니다 (지금 <strong>{terrainAltitudeFt.toLocaleString()} ft</strong>).<br />
              <span style={{ color: '#dc2626' }}>■</span> 100ft 이내·위{'  '}
              <span style={{ color: '#eab308' }}>■</span> 1,000ft 이내 — 인천 FIR 안쪽 지형 표고(MSL)
              기준이며, 송전선·철탑 등 장애물은 포함하지 않습니다.
            </p>
          )}
        </section>
      ))}
    </div>
  )

  if (isMobile) {
    return (
      <MobileSheet
        open
        eyebrow="기상정보"
        title="기상 레이어"
        onClose={onClose}
        headerExtra={(
          <>
            <button
              type="button"
              className="layer-sheet-clear"
              onClick={onClearAll}
              disabled={activeCount === 0}
            >
              전체 끄기
            </button>
            <span className="layer-drawer-status">{activeCount}개 켜짐</span>
          </>
        )}
      >
        {tileGroups}
      </MobileSheet>
    )
  }

  return (
    <div className="dev-layer-panel layer-drawer" aria-label="기상 레이어 토글">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">기상정보</div>
          <div className="layer-drawer-title">기상 레이어</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="layer-sheet-clear"
            onClick={onClearAll}
            disabled={activeCount === 0}
          >
            전체 끄기
          </button>
          <span className="layer-drawer-status">{activeCount}개 켜짐</span>
        </div>
      </div>
      <div className="layer-drawer-body">
        {tileGroups}
      </div>
    </div>
  )
}

export default WeatherOverlayPanel
