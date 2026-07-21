import { useEffect, useMemo, useState } from 'react'
import { NOTAM_CATEGORIES, deriveNotamTime, formatAltitude, formatValidPeriod, sortOperationalFirst } from '../../notam/lib/notamViewModel.js'
import NotamCell from '../../notam/NotamCell.jsx'

const catLabelOf = (id) => (NOTAM_CATEGORIES.find((c) => c.id === id) || { label: '기타' }).label

function NotamTab({ notam, icao, nowMs = Date.now() }) {
  const [expanded, setExpanded] = useState(false)
  const items = useMemo(() => Array.isArray(notam?.items) ? notam.items : [], [notam])
  const airportItems = useMemo(() => sortOperationalFirst(items.filter((it) => it.scope !== 'fir' && it.location === icao), nowMs), [items, icao, nowMs])
  useEffect(() => { setExpanded(false) }, [icao])
  if (airportItems.length === 0) return <div className="ap-empty">유효한 NOTAM이 없습니다.</div>

  const criticalItems = airportItems.filter((it) => it.operational?.priority === 'critical')
  const otherItems = airportItems.filter((it) => it.operational?.priority !== 'critical')
  const initialItems = criticalItems.length > 0 ? criticalItems : airportItems
  const cell = (it) => {
    const time = deriveNotamTime(it, nowMs)
    const metaText = [catLabelOf(it.category), it.id, it.operational?.confidence === 'review' && '검토 필요'].filter(Boolean).join(' · ')
    return <NotamCell key={it.id} category={it.category} timeState={time.state} summary={it.summary || it.id} metaText={metaText} altitude={formatAltitude(it.altitude)} rawText={it.rawText || it.summary} validText={formatValidPeriod(it.valid_from, it.valid_to)} priority={it.operational?.priority} />
  }

  return <div className="ap-notam-tab">
    <div className="ap-notam-group-title">{criticalItems.length > 0 ? '필수 확인' : icao + ' 직접 해당'} · {initialItems.length}건</div>
    <div className="notam-cellgrid">{initialItems.map(cell)}</div>
    {expanded && otherItems.length > 0 && <><div className="ap-notam-group-title">기타 직접 해당 · {otherItems.length}건</div><div className="notam-cellgrid">{otherItems.map(cell)}</div></>}
    {criticalItems.length > 0 && otherItems.length > 0 && <button type="button" className="notam-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>{expanded ? '필수 항목만 보기' : '기타 ' + otherItems.length + '건 보기'}</button>}
  </div>
}
export default NotamTab
