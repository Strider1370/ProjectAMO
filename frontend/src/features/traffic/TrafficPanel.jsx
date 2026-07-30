import { useState } from 'react'
import { ChevronDown, ChevronRight, Radio, X } from 'lucide-react'

import {
  ALTITUDE_MAX_FT, ALTITUDE_MIN_FT, ALTITUDE_STEP_FT,
  CLASS_LABELS, GROUP_LABELS, OPERATOR_GROUPS, hasActiveFilters,
} from './trafficFilter.js'
import './TrafficPanel.css'

const CLASS_IDS = Object.keys(CLASS_LABELS)

function toggleInList(list = [], value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

// 슬라이더 트랙에서 고도값이 놓이는 위치(%). 선택 구간을 색으로 채우는 데만 쓴다.
function altitudePercent(ft) {
  return ((ft - ALTITUDE_MIN_FT) / (ALTITUDE_MAX_FT - ALTITUDE_MIN_FT)) * 100
}

function OperatorGroup({ group, counts, filters, onChangeFilters, disabled }) {
  const [open, setOpen] = useState(false)
  const items = counts.items.filter((i) => i.group === group)
  const checked = filters.groups.includes(group)
  return (
    <div className="traffic-group">
      <div className="traffic-group-head">
        <label className={`traffic-row traffic-check${checked ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={() => onChangeFilters({ groups: toggleInList(filters.groups, group) })}
          />
          <span className="traffic-row-name">{GROUP_LABELS[group]}</span>
          <span className="traffic-count">{counts.groups[group] ?? 0}</span>
        </label>
        {items.length > 0 && (
          <button
            type="button"
            className="traffic-group-fold"
            aria-expanded={open}
            aria-label={`${GROUP_LABELS[group]} 개별 소속 ${open ? '접기' : '펼치기'}`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
      </div>
      {open && items.map((item) => (
        <label
          className={`traffic-row traffic-check traffic-check--child${filters.codes.includes(item.code) ? ' is-on' : ''}`}
          key={item.code}
        >
          <input
            type="checkbox"
            checked={filters.codes.includes(item.code)}
            disabled={disabled || checked}
            onChange={() => onChangeFilters({ codes: toggleInList(filters.codes, item.code) })}
          />
          <span className="traffic-row-name">{item.name}</span>
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
        {/* 기상 레이어 패널의 타일 버튼과 같은 껍데기를 쓴다 — 같은 지도 레이어를 켜고 끄는 일이라 생김새도 같아야 한다. */}
        <div className="layer-tile-grid traffic-toggle-grid">
          <button
            type="button"
            className={`layer-tile traffic-toggle${visible ? ' is-active' : ''}`}
            aria-pressed={visible}
            onClick={onToggleVisible}
          >
            <span className="layer-tile-visual"><Radio size={22} aria-hidden="true" /></span>
            <span className="layer-tile-label">ADS-B 표시</span>
            {visible && <span className="layer-tile-check" aria-hidden="true">✓</span>}
          </button>
        </div>

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
          <div className="traffic-alt-value">
            {lo.toLocaleString()} – {hi.toLocaleString()} <span className="traffic-alt-unit">ft</span>
          </div>
          <div className="traffic-alt-slider">
            <span className="traffic-alt-track" aria-hidden="true" />
            <span
              className="traffic-alt-fill"
              aria-hidden="true"
              style={{ left: `${altitudePercent(lo)}%`, right: `${100 - altitudePercent(hi)}%` }}
            />
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
          <div className="traffic-classes">
            {CLASS_IDS.map((id) => (
              <button
                type="button"
                key={id}
                className={`traffic-class${filters.classes.includes(id) ? ' is-on' : ''}`}
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
        <span className="layer-drawer-status traffic-status">
          보이는 항공기 <b>{visibleCount}</b> / 전체 <b>{counts.total}</b>
        </span>
        <button type="button" className="traffic-reset" disabled={!filtered} onClick={onResetFilters}>
          필터 초기화
        </button>
      </div>

      {visible && !receiving && counts.total > 0 && visibleCount === 0 && (
        <p className="traffic-hint traffic-hint--empty">조건에 맞는 항공기 없음</p>
      )}
    </div>
  )
}
