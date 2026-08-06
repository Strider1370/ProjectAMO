import { useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
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
              <td>{row.intensity ?? '—'}</td>
              <td>{row.maxWindMs !== null ? `${row.maxWindMs} m/s` : '—'}</td>
              <td>{row.pressureHpa !== null ? `${row.pressureHpa} hPa` : '—'}</td>
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
}) {
  const isMobile = useIsMobile()
  const items = buildTyphoonListItems(typhoons)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [expanded, setExpanded] = useState(true)
  const item = items.find((entry) => entry.number === selectedNumber) ?? items[0]

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
        <div className="typhoon-panel__tabs" role="tablist" aria-label="태풍 선택">
          {items.map((entry) => (
            <button type="button" key={entry.number} role="tab" aria-selected={entry.number === item?.number} className={entry.number === item?.number ? 'is-active' : ''} onClick={() => setSelectedNumber(entry.number)}>
              <span className="typhoon-panel__tab-swatch" style={{ background: entry.color }} aria-hidden="true" />
              {entry.title}
            </button>
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
              <span className="typhoon-panel__issued">{formatTrackTime(item.analyzedAt)} 발표</span>
            )}
            <button type="button" className="typhoon-panel__focus" onClick={() => onFocus?.(item)}>
              바로가기
            </button>
          </div>
          <div className="typhoon-panel__summary" aria-label={`${item.title} 현재 요약`}>
            <span><b>강도</b>{item.intensity ?? '—'}</span>
            <span><b>풍속</b>{item.maxWindMs !== null ? `${item.maxWindMs} m/s` : '—'}</span>
            <span><b>기압</b>{item.pressureHpa !== null ? `${item.pressureHpa} hPa` : '—'}</span>
            <span className="typhoon-panel__summary-location"><b>위치</b>{item.location || '—'}</span>
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
        onClose={onClose}
        headerExtra={<><span className="layer-drawer-status">{items.length}개</span>{closeButton}</>}
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
            <div className="layer-drawer-title">태풍정보</div>
          </div>
          <div className="typhoon-panel__header-actions">
            <span className="layer-drawer-status">{items.length}개</span>
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
