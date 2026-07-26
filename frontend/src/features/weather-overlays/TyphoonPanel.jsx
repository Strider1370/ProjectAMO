import { Fragment, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import { buildTyphoonListItems, formatTrackTime } from './lib/typhoonListModel.js'
import './TyphoonPanel.css'

function TrackTable({ item, rows, selected, pinned, onSelect, onPin }) {
  return (
    <table className="typhoon-track">
      <thead>
        <tr>
          <th className="typhoon-track__time">시각</th>
          <th>강도</th>
          <th>풍속</th>
          <th>기압</th>
          <th className="typhoon-track__where">위치</th>
          <th className="typhoon-track__toggle" aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = selected?.number === item.number && selected?.validAt === row.validAt
          const isPinned = pinned?.number === item.number && pinned?.validAt === row.validAt
          const payload = { number: item.number, validAt: row.validAt, row }
          return (
            <Fragment key={row.key}>
              <tr
                className={`typhoon-track__row is-${row.forecast ? 'forecast' : 'past'}${row.isCurrent ? ' is-current' : ''}${isSelected ? ' is-selected' : ''}${isPinned ? ' is-pinned' : ''}`}
                onMouseEnter={() => onSelect?.(payload)}
                onFocus={() => onSelect?.(payload)}
                onClick={() => {
                  onSelect?.({ ...payload, pinned: true })
                  onPin?.(payload)
                }}
                tabIndex={0}
                aria-expanded={isPinned}
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
                <td className="typhoon-track__toggle">
                  <ChevronDown size={14} className={`typhoon-track__chevron${isPinned ? ' is-open' : ''}`} aria-hidden="true" />
                </td>
              </tr>
              {isPinned && (
                <tr className="typhoon-track__detail-row">
                  <td colSpan={6}><SelectedDetail row={row} /></td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function SelectedDetail({ row }) {
  if (!row) return null
  return (
    <dl className="typhoon-detail">
      <div><dt>위치</dt><dd>{row.location || `${row.lat}N ${row.lon}E`}</dd></div>
      <div><dt>중심</dt><dd>{row.lat}N {row.lon}E</dd></div>
      {row.dir && <div><dt>진행</dt><dd>{row.dir} {row.speedKmh ?? '—'} km/h</dd></div>}
      {row.maxWindKmh !== null && <div><dt>최대풍속</dt><dd>{row.maxWindMs} m/s · {row.maxWindKmh} km/h</dd></div>}
      {row.gale && <div><dt>강풍반경</dt><dd>{row.gale}</dd></div>}
      {row.storm && <div><dt>폭풍반경</dt><dd>{row.storm}</dd></div>}
      {row.errorRadiusKm !== null && <div><dt>70% 확률반경</dt><dd>{row.errorRadiusKm} km</dd></div>}
    </dl>
  )
}

export default function TyphoonPanel({
  typhoons = [], status = 'ok', onFocus, onClose, selected = null, onSelect,
}) {
  const isMobile = useIsMobile()
  const items = buildTyphoonListItems(typhoons)
  const [pinned, setPinned] = useState(null)
  const togglePin = (payload) => {
    setPinned((prev) => (prev?.number === payload.number && prev?.validAt === payload.validAt ? null : payload))
  }

  // 목록 본문은 데스크톱·모바일이 같다. 껍데기만 갈린다.
  const body = (
    <>
      {status === 'unavailable' && items.length === 0 && (
        <p className="typhoon-panel__empty">자료 없음 — 수집에 실패했습니다. 태풍이 없다는 뜻이 아닙니다.</p>
      )}
      {status !== 'unavailable' && items.length === 0 && (
        <p className="typhoon-panel__empty">현재 활동 중인 태풍 없음</p>
      )}
      {items.map((item) => (
        <section
          key={item.number}
          className="typhoon-panel__item"
          onMouseLeave={() => onSelect?.(null)}
        >
          <div className="typhoon-panel__head">
            <span className="typhoon-panel__swatch" style={{ background: item.color }} aria-hidden="true" />
            <strong className="typhoon-panel__name">{item.title}</strong>
            {item.analyzedAt && (
              <span className="typhoon-panel__issued">{formatTrackTime(item.analyzedAt)} 발표</span>
            )}
            <button type="button" className="typhoon-panel__focus" onClick={() => onFocus?.(item)}>
              바로가기
            </button>
          </div>
          {/* 통보문과 같은 구성: 현재 + 예상만 편다. 지나온 관측은 수십 줄이라
              펼쳐두면 정작 중요한 현재·예보가 화면 밖으로 밀린다 — 지도에는 그대로 그려진다. */}
          <TrackTable
            item={item}
            rows={item.trackRows.filter((row) => row.isCurrent || row.forecast)}
            selected={selected}
            pinned={pinned}
            onSelect={onSelect}
            onPin={togglePin}
          />
          {item.pastRows.length > 0 && (
            <details className="typhoon-panel__past">
              <summary>지난 관측 {item.pastRows.length}개</summary>
              <TrackTable item={item} rows={item.pastRows} selected={selected} pinned={pinned} onSelect={onSelect} onPin={togglePin} />
            </details>
          )}
        </section>
      ))}
    </>
  )

  const closeButton = (
    <button type="button" className="typhoon-panel__close" onClick={onClose} aria-label="태풍 목록 닫기">
      <X size={16} aria-hidden="true" />
    </button>
  )

  // 데스크톱 패널은 레이어 드로어 오른쪽에 폭 300px로 붙는다. Pixel 5(393px)에서는
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
    <div className="dev-layer-panel layer-drawer typhoon-panel" aria-label="활성 태풍 목록">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-title">태풍정보</div>
        </div>
        <div className="typhoon-panel__header-actions">
          <span className="layer-drawer-status">{items.length}개</span>
          {closeButton}
        </div>
      </div>
      <div className="layer-drawer-body">{body}</div>
    </div>
  )
}
