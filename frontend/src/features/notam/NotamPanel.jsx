import { useMemo, useState } from 'react'
import { Ban, Crosshair, AlertTriangle, ShieldHalf, Swords, RadioTower, Radio, MoreHorizontal, ChevronDown, MapPin } from 'lucide-react'
import { NOTAM_CATEGORIES, TIME_STATE, deriveTimeState, formatAltitude, formatValidPeriod, sortOperationalFirst } from './lib/notamViewModel.js'
import './NotamPanel.css'

const CAT_ICON = {
  prohibited: Ban,
  firing: Crosshair,
  danger: AlertTriangle,
  restricted: ShieldHalf,
  moa: Swords,
  obstacle: RadioTower,
  facility: Radio,
  other: MoreHorizontal,
}
const CHUNK = 15

function CatIcon({ id, size = 15 }) {
  const Icon = CAT_ICON[id] || MoreHorizontal
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />
}

function catLabelOf(id) {
  return (NOTAM_CATEGORIES.find((c) => c.id === id) || { label: '기타' }).label
}

function TimeBadge({ state }) {
  const ts = TIME_STATE[state] || TIME_STATE.upcoming
  return (
    <span className={`notam-ts ts-${ts.key}`}>
      <span className="notam-ts-glyph" aria-hidden="true">{ts.glyph}</span>{ts.label}
    </span>
  )
}

function fmtCollected(iso, tz = 'KST') {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms + (tz === 'KST' ? 9 * 3600000 : 0))
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function NotamRow({ item, nowMs, tz, expanded, onToggle, onLocate }) {
  const state = deriveTimeState(item.valid_from, item.valid_to, nowMs)
  const where = item.scope === 'fir' ? '전역' : item.location
  return (
    <>
      <tr
        className="notam-row"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        <td className="notam-td-cat"><CatIcon id={item.category} /><span>{catLabelOf(item.category)}</span></td>
        <td className="notam-td-loc">
          {where}
          {item.geometry && (
            <button
              type="button"
              className="notam-locate"
              aria-label={`${item.id} 지도에서 보기`}
              title="지도에서 보기"
              onClick={(e) => { e.stopPropagation(); onLocate?.(item) }}
            >
              <MapPin size={13} aria-hidden="true" />
            </button>
          )}
        </td>
        <td className="notam-td-sum">
          <div className="notam-sum-text">{item.summary || item.id}</div>
          <div className="notam-sum-valid">{formatValidPeriod(item.valid_from, item.valid_to, tz)}</div>
        </td>
        <td className="notam-td-alt">{formatAltitude(item.altitude) || '—'}</td>
        <td className="notam-td-state">
          <TimeBadge state={state} />
          <ChevronDown size={13} className={`notam-chev${expanded ? ' is-open' : ''}`} aria-hidden="true" />
        </td>
      </tr>
      {expanded && (
        <tr className="notam-raw-row">
          <td colSpan={5}>
            <div className="notam-full-sum"><b>E)</b> {item.summary || item.id}</div>
            <details className="notam-raw-details">
              <summary>TAC 원문 보기</summary>
              <pre className="notam-raw">{item.rawText || item.summary}</pre>
            </details>
          </td>
        </tr>
      )}
    </>
  )
}

function NotamPanel({ payload, selectedAirport, categoryFilter, onCategoryToggle, locationFilter = 'all', onLocationChange, masterOn, onMasterToggle, onLocate, nowMs = Date.now(), tz = 'KST' }) {
  const [limit, setLimit] = useState(CHUNK)
  const [openId, setOpenId] = useState(null)

  const items = useMemo(() => Array.isArray(payload?.items) ? payload.items : [], [payload])
  const activeFilter = categoryFilter || NOTAM_CATEGORIES.map((c) => c.id)
  // 위치(공항/공역) 목록 — 건수 많은 순, 필터 드롭다운용
  const locations = useMemo(() => {
    const counts = new Map()
    for (const it of items) counts.set(it.location, (counts.get(it.location) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [items])
  const filtered = useMemo(
    () => sortOperationalFirst(items.filter((it) =>
      activeFilter.includes(it.category) && (locationFilter === 'all' || it.location === locationFilter),
    ), nowMs),
    [items, activeFilter, locationFilter, nowMs],
  )
  const priority = useMemo(
    () => selectedAirport ? filtered.filter((it) => it.location === selectedAirport) : [],
    [filtered, selectedAirport],
  )
  const activeCount = activeFilter.length

  return (
    <div className="dev-layer-panel layer-drawer notam-panel" aria-label="NOTAM 패널">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">항공정보</div>
          <div className="layer-drawer-title">NOTAM</div>
        </div>
        <div className="notam-master">
          <span className="notam-master-label">지도 표시</span>
          <button
            type="button"
            role="switch"
            aria-checked={!!masterOn}
            aria-label="지도에 NOTAM 표시"
            className={`notam-switch${masterOn ? ' is-on' : ''}`}
            onClick={onMasterToggle}
          >
            <span className="notam-switch-knob" />
          </button>
        </div>
      </div>

      <div className="layer-drawer-body">
        <div className="notam-horizon">
          향후 {payload?.horizon_hours ?? 24}시간 기준 · {fmtCollected(payload?.fetched_at, tz)} {tz} 수집
        </div>

        <div className="notam-legend" aria-hidden="true">
          <span className="notam-legend-lbl">색+형태 = 발효 시각</span>
          <TimeBadge state="active" /><TimeBadge state="soon" /><TimeBadge state="upcoming" />
        </div>

        <div className="notam-filter">
          <div className="notam-filter-title">카테고리 필터 <span className="notam-filter-count">· {activeCount}개 켜짐</span></div>
          <div className="layer-tile-grid notam-tile-grid">
            {NOTAM_CATEGORIES.map((c) => {
              const on = activeFilter.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`layer-tile${on ? ' is-active' : ''}`}
                  aria-pressed={on}
                  onClick={() => onCategoryToggle?.(c.id)}
                >
                  <span className="layer-tile-visual"><CatIcon id={c.id} size={18} /></span>
                  <span className="layer-tile-label">{c.label}</span>
                  {on && <span className="layer-tile-check" aria-hidden="true">✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="notam-locfilter">
          <label className="notam-locfilter-label" htmlFor="notam-loc">위치</label>
          <select
            id="notam-loc"
            className="notam-locfilter-select"
            value={locationFilter}
            onChange={(e) => { onLocationChange?.(e.target.value); setLimit(CHUNK) }}
          >
            <option value="all">전체 ({items.length})</option>
            {locations.map(([loc, n]) => (
              <option key={loc} value={loc}>{loc === 'RKRR' ? 'RKRR (인천FIR)' : loc} ({n})</option>
            ))}
          </select>
        </div>

        {priority.length > 0 && locationFilter === 'all' && (
          <div className="notam-priority">
            <div className="notam-priority-title">{selectedAirport} 관련 · {priority.length}건</div>
            {priority.map((it) => (
              <div key={`p-${it.id}`} className="notam-priority-row">
                <CatIcon id={it.category} />
                <span className="notam-priority-cat">{catLabelOf(it.category)}</span>
                <span className="notam-priority-sum">{it.summary || it.id}</span>
                <TimeBadge state={deriveTimeState(it.valid_from, it.valid_to, nowMs)} />
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="ap-empty">표시할 NOTAM이 없습니다.</div>
        ) : (
          <>
            <table className="notam-table">
              <thead>
                <tr>
                  <th>구분</th><th>공항</th><th>원문(E)</th><th>고도</th><th className="notam-th-state">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((it) => (
                  <NotamRow
                    key={it.id}
                    item={it}
                    nowMs={nowMs}
                    tz={tz}
                    expanded={openId === it.id}
                    onToggle={() => setOpenId((cur) => cur === it.id ? null : it.id)}
                    onLocate={onLocate}
                  />
                ))}
              </tbody>
            </table>
            <div className="notam-foot">
              발효 중 먼저 정렬 · 행 클릭 시 원문 · {filtered.length}건 중 {Math.min(limit, filtered.length)}건
              {limit < filtered.length && (
                <button type="button" className="notam-more" onClick={() => setLimit((l) => l + CHUNK)}> 더 보기</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default NotamPanel
