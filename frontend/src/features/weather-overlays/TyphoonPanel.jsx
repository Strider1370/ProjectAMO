import { useState } from 'react'
import { ChevronRight, Eye, EyeOff, X } from 'lucide-react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import { buildTyphoonListItems, formatTrackTime } from './lib/typhoonListModel.js'
import './TyphoonPanel.css'

function TrackTable({ item, rows, selected, onSelect }) {
  return (
    <table className="typhoon-track">
      <thead>
        <tr>
          <th className="typhoon-track__time">시각</th>
          <th>강도</th>
          <th>풍속</th>
          <th>기압</th>
          <th className="typhoon-track__where">위치</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = selected?.number === item.number && selected?.validAt === row.validAt
          const payload = { number: item.number, validAt: row.validAt, row }
          return (
            <tr
              key={row.key}
              className={`typhoon-track__row is-${row.forecast ? 'forecast' : 'past'}${row.isCurrent ? ' is-current' : ''}${isSelected ? ' is-selected' : ''}`}
              onMouseEnter={() => onSelect?.(payload)}
              onFocus={() => onSelect?.(payload)}
              onClick={() => onSelect?.({ ...payload, pinned: true })}
              tabIndex={0}
            >
              <td className="typhoon-track__time">
                {row.timeLabel}
                {row.isCurrent && <span className="typhoon-track__now">현재</span>}
                {!row.isCurrent && <span className="typhoon-track__kind">{row.kindLabel}</span>}
              </td>
              <td data-label="강도">{row.intensity ?? '—'}</td>
              <td data-label="최대풍속">{row.maxWindMs !== null ? `${row.maxWindMs} m/s` : '—'}</td>
              <td data-label="중심기압">{row.pressureHpa !== null ? `${row.pressureHpa} hPa` : '—'}</td>
              <td className="typhoon-track__where">{row.location}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function TyphoonPanel({
  typhoons = [], status = 'ok', onFocus, onClose, selected = null, onSelect,
  hiddenKeys = [], onToggleTyphoon, timeZone = 'KST',
}) {
  const isMobile = useIsMobile()
  const items = buildTyphoonListItems(typhoons, timeZone)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [expanded, setExpanded] = useState(true)
  const item = items.find((entry) => entry.number === selectedNumber) ?? items[0]
  const hidden = item && hiddenKeys.includes(item.key)
  const selectedRow = selected?.number === item?.number ? item?.trackRows.find((row) => row.validAt === selected.validAt) : null
  const windRow = selectedRow ?? item?.trackRows.find((row) => row.isCurrent)
  const visibleCount = items.filter((entry) => !hiddenKeys.includes(entry.key)).length
  const countBadge = (
    <span className="typhoon-panel__count" aria-label={`태풍 ${items.length}개 중 ${visibleCount}개 지도 표시`}>
      {visibleCount === items.length ? `${items.length}개` : `${visibleCount}/${items.length}개 표시`}
    </span>
  )

  // 목록 본문은 데스크톱·모바일이 같다. 껍데기만 갈린다.
  const body = (
    <>
      {status === 'unavailable' && items.length === 0 && (
        <p className="typhoon-panel__empty">자료 없음 — 수집에 실패했습니다. 태풍이 없다는 뜻이 아닙니다.</p>
      )}
      {status !== 'unavailable' && items.length === 0 && (
        <p className="typhoon-panel__empty">현재 활동 중인 태풍 없음</p>
      )}
      {items.length > 0 && (
        <div className="typhoon-panel__tabs" aria-label="태풍 선택 및 지도 표시">
          {items.map((entry) => (
            <div key={entry.key} className={`typhoon-panel__tab${entry.number === item?.number ? ' is-active' : ''}${hiddenKeys.includes(entry.key) ? ' is-hidden' : ''}`}>
              <button type="button" aria-pressed={entry.number === item?.number} aria-label={`${entry.title} 상세정보`} onClick={() => setSelectedNumber(entry.number)}>
                <span className="typhoon-panel__tab-swatch" style={{ background: entry.color }} aria-hidden="true" />
                {entry.number}호 {entry.name}
              </button>
              <button type="button" className="typhoon-panel__visibility" aria-label={`${entry.title} 지도 표시`} aria-pressed={!hiddenKeys.includes(entry.key)} title={hiddenKeys.includes(entry.key) ? '지도에 표시' : '지도에서 숨기기'} onClick={() => onToggleTyphoon?.(entry.key)}>
                {hiddenKeys.includes(entry.key) ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          ))}
        </div>
      )}
      {item && (
        <section
          key={item.number}
          className="typhoon-panel__item"
          style={{ '--typhoon-color': item.color }}
          onMouseLeave={() => onSelect?.(null)}
        >
          <div className="typhoon-panel__head">
            <strong className="typhoon-panel__name">{item.title}</strong>
            {item.analyzedAt && (
              <span className="typhoon-panel__issued">{formatTrackTime(item.analyzedAt, timeZone)} 발표 · {timeZone}</span>
            )}
            <button type="button" className="typhoon-panel__focus" onClick={() => { if (hidden) onToggleTyphoon?.(item.key); onFocus?.(item) }}>
              지도에서 보기
            </button>
          </div>
          <div className="typhoon-panel__summary" aria-label={`${item.title} 현재 요약`}>
            <dl className="typhoon-panel__primary-metrics">
              <div><dt>강도</dt><dd><strong>{item.intensity ?? '—'}</strong></dd></div>
              <div><dt>최대풍속</dt><dd><strong>{item.maxWindMs ?? '—'}</strong>{item.maxWindMs !== null && <small>m/s</small>}</dd></div>
              <div><dt>중심기압</dt><dd><strong>{item.pressureHpa ?? '—'}</strong>{item.pressureHpa !== null && <small>hPa</small>}</dd></div>
            </dl>
            <p className="typhoon-panel__summary-location">{item.location || '위치 자료 없음'}</p>
          </div>
          <div className="typhoon-panel__legend" aria-label="태풍 지도 범례">
            <div className="typhoon-panel__legend-keys">
              <span><i className="typhoon-panel__legend-cone" />위치 70%</span>
              <span><i className="typhoon-panel__legend-gale" />강풍 ≥15 m/s</span>
              <span><i className="typhoon-panel__legend-storm" />폭풍 ≥25 m/s</span>
            </div>
            <small title="강풍·폭풍 영역은 통보문 반경을 원형으로 표시하며 방향별 차이는 생략합니다. 위치 70%는 태풍 중심의 위치 확률 영역입니다.">
              {hidden ? '지도에서 숨김' : `${selectedRow ? `${selectedRow.timeLabel} ${selectedRow.kindLabel} · ${timeZone}` : '현재'} 기준 · 반경 단순 표시${windRow && !windRow.geometry?.gale ? ' · 강풍반경 자료 없음' : ''}`}
            </small>
          </div>
          <div className="typhoon-panel__details">
            {/* 현재 요약 아래에는 앞으로의 예상만 둔다. 지나온 관측은 필요할 때만 펼친다. */}
            <TrackTable
              item={item}
              rows={item.trackRows.filter((row) => row.forecast)}
              selected={selected}
              onSelect={onSelect}
            />
            {item.pastRows.length > 0 && (
              <details className="typhoon-panel__past">
                <summary>지난 관측 {item.pastRows.length}개</summary>
                <TrackTable item={item} rows={item.pastRows} selected={selected} onSelect={onSelect} />
              </details>
            )}
          </div>
        </section>
      )}
    </>
  )

  const closeButton = (
    <button type="button" className="typhoon-panel__close" onClick={onClose} aria-label="태풍 목록 닫기">
      <X size={16} aria-hidden="true" />
    </button>
  )

  // 데스크톱 패널은 지도 위 드로어로, Pixel 5(393px)에서는
  // 화면 밖으로 나가므로 WeatherOverlayPanel과 같은 방식으로 시트로 전환한다.
  if (isMobile) {
    return (
      <MobileSheet
        open
        title="태풍정보"
        titleExtra={countBadge}
        onClose={onClose}
        headerExtra={closeButton}
      >
        <div aria-label="활성 태풍 목록">{body}</div>
      </MobileSheet>
    )
  }

  return (
    <div className={`dev-layer-panel layer-drawer typhoon-panel${expanded ? '' : ' is-collapsed'}`} aria-label="활성 태풍 목록">
      {expanded ? <>
        <div className="layer-drawer-header">
          <div>
            <div className="layer-drawer-title">태풍정보{countBadge}</div>
          </div>
          <div className="typhoon-panel__header-actions">
            {closeButton}
            <button
              type="button"
              className="typhoon-panel__collapse"
              aria-label="태풍 패널 접기"
              aria-expanded="true"
              onClick={() => setExpanded(false)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="layer-drawer-body">{body}</div>
      </> : (
        <button
          type="button"
          className="typhoon-panel__collapse typhoon-panel__collapse-handle"
          aria-label="태풍 패널 펼치기"
          aria-expanded="false"
          onClick={() => setExpanded(true)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
