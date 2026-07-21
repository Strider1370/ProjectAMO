import { AlertTriangle, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Popover, PopoverTrigger, PopoverSurface,
  Button, CounterBadge, Text, Tooltip,
} from '../../shared/ui/fluent.js'
import './AdvisoryBadges.css'

const PANEL_TITLE = { sigwxLow: 'SIGWX_LOW', sigmet: 'SIGMET', airmet: 'AIRMET', warning: '공항경보' }
// Fluent CounterBadge 색(헌법 의미색 대응): SIGMET/공항경보=danger(red). AIRMET은 CSS로 솔리드 앰버 보정.
const TONE_COLOR = { sigwx: 'important', sigmet: 'danger', airmet: 'warning', warning: 'danger' }
const TONE_HEX = { sigwx: '#6d28d9', sigmet: 'var(--level-red)', airmet: 'var(--level-amber)', warning: 'var(--level-red)' }

// 상시 위험 요약 바: SIGMET/AIRMET(활성 시 상시) + 공항경보. 칩=소프트 톤 Fluent Button(삼각형+건수+펼침 caret).
// 클릭 → Fluent Popover(arrow로 칩에 연결) 알림형 리스트. 행 전체가 버튼: SIGMET/AIRMET=지도 표시 토글(눈),
// 공항경보=공항 열기(▸). 행 패턴 통일.
function AdvisoryBadges({
  badgeItems,
  warnedAirports = [],
  warningLabels = {},
  openPanel,
  panelItems,
  hiddenKeys,
  onOpenPanel,
  onToggleVisibility,
  onSelectAirport,
}) {
  const chips = [
    ...badgeItems,
    warnedAirports.length > 0
      ? { key: 'warning', label: '공항경보', count: warnedAirports.length, tone: 'warning' }
      : null,
  ].filter(Boolean)

  if (chips.length === 0) return null

  function advisoryRow(kind, mapKey, color, label, time) {
    const visible = !(hiddenKeys[kind] || []).includes(mapKey)
    return (
      <Tooltip key={mapKey} relationship="description" withArrow
        content={visible ? '클릭하면 지도에서 숨김' : '클릭하면 지도에 표시'}>
        <Button
          appearance="subtle"
          className="advisory-pop-row"
          aria-pressed={visible}
          onClick={() => onToggleVisibility(kind, mapKey)}
        >
          <span className="advisory-pop-acc" style={{ background: color }} />
          <span className="advisory-pop-body">
            <span className="advisory-pop-name">{label}</span>
            {time && <span className="advisory-pop-time">{time}</span>}
          </span>
          {visible
            ? <Eye size={18} className="advisory-pop-trail" aria-hidden="true" />
            : <EyeOff size={18} className="advisory-pop-trail advisory-pop-trail--off" aria-hidden="true" />}
        </Button>
      </Tooltip>
    )
  }

  function panelList(item) {
    return (
      <div className="advisory-pop-list">
        {item.key === 'warning' && (
          warnedAirports.length === 0
            ? <Text size={200} className="advisory-pop-empty">활성 경보 없음</Text>
            : warnedAirports.map((icao) => (
              <Tooltip key={icao} relationship="description" withArrow content="공항 정보 열기">
                <Button
                  appearance="subtle"
                  className="advisory-pop-row"
                  onClick={() => { onSelectAirport?.(icao); onOpenPanel(item.key, false) }}
                >
                  <span className="advisory-pop-acc" style={{ background: TONE_HEX.warning }} />
                  <span className="advisory-pop-body">
                    <span className="advisory-pop-name">{icao}</span>
                    {warningLabels[icao]?.length > 0 && (
                      <span className="advisory-pop-time">{warningLabels[icao].join(', ')}</span>
                    )}
                  </span>
                  <ChevronRight size={18} className="advisory-pop-trail" aria-hidden="true" />
                </Button>
              </Tooltip>
            ))
        )}

        {item.key !== 'warning' && panelItems.length === 0 && (
          <Text size={200} className="advisory-pop-empty">활성 항목 없음</Text>
        )}

        {item.key === 'sigwxLow' && panelItems.map((g) =>
          advisoryRow('sigwxLow', g.mapKey, g.lineColor || '#6d28d9', g.label))}
        {item.key === 'sigmet' && panelItems.map((it) =>
          advisoryRow('sigmet', it.mapKey, 'var(--level-red)', it.panelLabel, it.validLabel))}
        {item.key === 'airmet' && panelItems.map((it) =>
          advisoryRow('airmet', it.mapKey, 'var(--level-amber)', it.panelLabel, it.validLabel))}
      </div>
    )
  }

  function chipButton(item, isOpen) {
    return (
      <Button
        appearance="subtle"
        size="medium"
        shape="circular"
        className={`advisory-chip advisory-chip--${item.tone}${isOpen ? ' is-open' : ''}`}
      >
        <AlertTriangle size={15} aria-hidden="true" />
        {item.label}
        <CounterBadge className="advisory-ct" appearance="filled" color={TONE_COLOR[item.tone]} count={item.count} size="small" />
        <ChevronDown size={14} className="advisory-chip-caret" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <div className="advisory-badge-bar" aria-label="위험 요약" data-tour="advisory">
      {chips.map((item) => {
        const isOpen = openPanel === item.key
        return (
          <Popover
            key={item.key}
            positioning={{ position: 'below', offset: 8 }}
            withArrow
            trapFocus
            open={isOpen}
            onOpenChange={(_, data) => onOpenPanel(item.key, data.open)}
          >
            <PopoverTrigger disableButtonEnhancement>
              {chipButton(item, isOpen)}
            </PopoverTrigger>
            <PopoverSurface>
              <div className={`advisory-pop advisory-pop--${item.tone}`}>
                <div className="advisory-pop-head">
                  <AlertTriangle size={16} style={{ color: TONE_HEX[item.tone] }} aria-hidden="true" />
                  <Text weight="semibold" className="advisory-pop-title" role="heading" aria-level={2}>{PANEL_TITLE[item.key]}</Text>
                  <CounterBadge className="advisory-ct" appearance="filled" color={TONE_COLOR[item.tone]} count={item.count} size="small" />
                </div>
                {panelList(item)}
              </div>
            </PopoverSurface>
          </Popover>
        )
      })}
    </div>
  )
}

export default AdvisoryBadges
