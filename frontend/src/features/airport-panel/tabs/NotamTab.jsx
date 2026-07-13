import { useEffect, useMemo, useState } from 'react'
import { NOTAM_CATEGORIES, deriveTimeState, formatAltitude, formatValidPeriod, notamSummary, sortActiveFirst } from '../../notam/lib/notamViewModel.js'
import NotamCell from '../../notam/NotamCell.jsx'

const catLabelOf = (id) => (NOTAM_CATEGORIES.find((c) => c.id === id) || { label: '기타' }).label

const NOTAM_LIMIT = 6 // 기본 표시 개수. 초과분은 "더보기"로 접어둠

function NotamTab({ notam, icao, nowMs = Date.now() }) {
  const [expanded, setExpanded] = useState(false)
  const items = useMemo(() => (Array.isArray(notam?.items) ? notam.items : []), [notam])
  const airportItems = useMemo(
    () => sortActiveFirst(items.filter((it) => it.scope !== 'fir' && it.location === icao), nowMs),
    [items, icao, nowMs],
  )

  // 공항 바뀌면 접힘 상태 초기화
  useEffect(() => { setExpanded(false) }, [icao])

  if (airportItems.length === 0) {
    return <div className="ap-empty">유효한 NOTAM이 없습니다.</div>
  }

  const overflow = airportItems.length - NOTAM_LIMIT
  const shown = expanded ? airportItems : airportItems.slice(0, NOTAM_LIMIT)

  return (
    <>
      <div className="notam-cellgrid">
        {shown.map((it) => (
          <NotamCell
            key={it.id}
            category={it.category}
            timeState={deriveTimeState(it.valid_from, it.valid_to, nowMs)}
            summary={notamSummary(it) || it.summary || it.id}
            metaText={`${catLabelOf(it.category)} · ${it.id}`}
            altitude={formatAltitude(it.altitude)}
            rawText={it.rawText || it.summary}
            validText={formatValidPeriod(it.valid_from, it.valid_to)}
          />
        ))}
      </div>
      {overflow > 0 && (
        <button
          type="button"
          className="notam-more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? '접기' : `더보기 ${overflow}건`}
        </button>
      )}
    </>
  )
}

export default NotamTab
