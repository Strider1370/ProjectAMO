import { useState } from 'react'
import { Radio, X } from 'lucide-react'

import {
  ALTITUDE_MAX_FT, ALTITUDE_MIN_FT, ALTITUDE_STEP_FT,
  CLASS_LABELS, GROUP_LABELS, OPERATOR_GROUPS, hasActiveFilters,
} from './trafficFilter.js'
import './TrafficPanel.css'

const CLASS_IDS = Object.keys(CLASS_LABELS)

function toggleInList(list = [], value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function OperatorGroup({ group, counts, filters, onChangeFilters, disabled }) {
  const [open, setOpen] = useState(false)
  const items = counts.items.filter((i) => i.group === group)
  const checked = filters.groups.includes(group)
  return (
    <div className="traffic-group">
      <div className="traffic-group-head">
        <label className="traffic-check">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={() => onChangeFilters({ groups: toggleInList(filters.groups, group) })}
          />
          <span>{GROUP_LABELS[group]}</span>
        </label>
        <span className="traffic-count">{counts.groups[group] ?? 0}</span>
        {items.length > 0 && (
          <button type="button" className="traffic-group-fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'}
          </button>
        )}
      </div>
      {open && items.map((item) => (
        <label className="traffic-check traffic-check--child" key={item.code}>
          <input
            type="checkbox"
            checked={filters.codes.includes(item.code)}
            disabled={disabled || checked}
            onChange={() => onChangeFilters({ codes: toggleInList(filters.codes, item.code) })}
          />
          <span>{item.name}</span>
          <span className="traffic-count">{item.count}</span>
        </label>
      ))}
    </div>
  )
}

export default function TrafficPanel({
  visible, onToggleVisible,
  filters, onChangeFilters, onResetFilters,
  counts, visibleCount, receiving, onClose,
}) {
  const [lo, hi] = filters.altitudeFt
  // 선택한 소속이 지금 하늘에 없으면 목록에 안 뜬다 → 조건이 살아 있다는 걸 따로 보여준다.
  const missingCodes = filters.codes.filter((code) => !counts.items.some((i) => i.code === code))
  const filtered = hasActiveFilters(filters)

  return (
    <div className="dev-layer-panel layer-drawer traffic-panel" aria-label="항적 필터">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">교통</div>
          <div className="layer-drawer-title">항적 (ADS-B)</div>
        </div>
        <button type="button" className="layer-drawer-close" aria-label="닫기" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="layer-drawer-body">
        <label className="traffic-switch">
          <input type="checkbox" checked={visible} onChange={onToggleVisible} />
          <Radio size={18} aria-hidden="true" />
          <span>ADS-B 표시</span>
        </label>

        {!visible && <p className="traffic-hint">ADS-B를 켜면 지금 떠 있는 소속이 표시됩니다.</p>}
        {visible && receiving && <p className="traffic-hint">수신 중…</p>}

        <section className="traffic-section">
          <h3 className="traffic-section-title">소속</h3>
          {OPERATOR_GROUPS.map((group) => (
            <OperatorGroup
              key={group}
              group={group}
              counts={counts}
              filters={filters}
              onChangeFilters={onChangeFilters}
              disabled={!visible}
            />
          ))}
          {missingCodes.length > 0 && (
            <p className="traffic-hint">선택했지만 지금 안 떠 있음: {missingCodes.join(', ')}</p>
          )}
        </section>

        <section className="traffic-section">
          <h3 className="traffic-section-title">고도</h3>
          <div className="traffic-alt-value">{lo.toLocaleString()} – {hi.toLocaleString()} ft</div>
          <div className="traffic-alt-slider">
            <input
              type="range"
              aria-label="고도 하한"
              min={ALTITUDE_MIN_FT} max={ALTITUDE_MAX_FT} step={ALTITUDE_STEP_FT}
              value={lo}
              disabled={!visible}
              onChange={(e) => onChangeFilters({ altitudeFt: [Math.min(Number(e.target.value), hi), hi] })}
            />
            <input
              type="range"
              aria-label="고도 상한"
              min={ALTITUDE_MIN_FT} max={ALTITUDE_MAX_FT} step={ALTITUDE_STEP_FT}
              value={hi}
              disabled={!visible}
              onChange={(e) => onChangeFilters({ altitudeFt: [lo, Math.max(Number(e.target.value), lo)] })}
            />
          </div>
          <p className="traffic-note">고도를 보내지 않는 기체는 구간을 좁히면 숨겨집니다.</p>
        </section>

        <section className="traffic-section">
          <h3 className="traffic-section-title">기종</h3>
          <div className="traffic-chips">
            {CLASS_IDS.map((id) => (
              <button
                type="button"
                key={id}
                className={`traffic-chip${filters.classes.includes(id) ? ' is-on' : ''}`}
                aria-pressed={filters.classes.includes(id)}
                disabled={!visible}
                onClick={() => onChangeFilters({ classes: toggleInList(filters.classes, id) })}
              >
                {CLASS_LABELS[id]}
              </button>
            ))}
          </div>
        </section>

        <section className="traffic-section">
          <h3 className="traffic-section-title">검색</h3>
          <input
            type="search"
            className="traffic-search"
            placeholder="편명 또는 등록기호 (KAL123, HL1234)"
            value={filters.search}
            disabled={!visible}
            onChange={(e) => onChangeFilters({ search: e.target.value })}
          />
          <p className="traffic-note">검색 중에는 위 조건을 무시하고 찾습니다.</p>
        </section>
      </div>

      <div className="layer-drawer-footer traffic-footer">
        <button type="button" className="layer-sheet-clear" disabled={!filtered} onClick={onResetFilters}>
          필터 초기화
        </button>
        <span className="layer-drawer-status">
          보이는 항공기 {visibleCount} / 전체 {counts.total}
        </span>
      </div>

      {visible && !receiving && counts.total > 0 && visibleCount === 0 && (
        <p className="traffic-hint traffic-hint--empty">조건에 맞는 항공기 없음</p>
      )}
    </div>
  )
}
