import { useTimeZone } from '../timezone/TimeZoneContext.jsx'
import './DataProvenance.css'

// #1 출처·발표·유효·수신 신뢰 스트립. source = header.source({identifier,publish_time,valid_from,valid_to,fetch_time}).
// METAR는 valid_* 없음(관측 스냅샷) → '유효' 생략. 결측 필드는 조용히 건너뜀.
// 날짜(DD) 포함 — TAF 유효기간이 날짜를 넘겨도 모호하지 않게. 예 '05 07:30Z' / '05 16:30 KST'.
function fmtProv(iso, tz) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const disp = tz === 'KST' ? new Date(d.getTime() + 9 * 3600 * 1000) : d
  const dd = String(disp.getUTCDate()).padStart(2, '0')
  const hh = String(disp.getUTCHours()).padStart(2, '0')
  const mm = String(disp.getUTCMinutes()).padStart(2, '0')
  return tz === 'KST' ? `${dd} ${hh}:${mm} KST` : `${dd} ${hh}:${mm}Z`
}

export default function DataProvenance({ source, className = '', displayTimeZone }) {
  const { tz: defaultTz } = useTimeZone()
  const tz = displayTimeZone || defaultTz
  if (!source) return null

  const publish = fmtProv(source.publish_time, tz)
  const from = fmtProv(source.valid_from, tz)
  const to = fmtProv(source.valid_to, tz)
  const received = fmtProv(source.fetch_time, tz)

  const parts = []
  if (source.identifier) parts.push(source.identifier)
  if (publish) parts.push(`발표 ${publish}`)
  if (from && to) parts.push(`유효 ${from}–${to}`)
  if (received) parts.push(`수신 ${received}`)
  if (parts.length === 0) return null

  return (
    <div className={`data-provenance ${className}`.trim()} title="자료 출처 · 발표/유효/수신 시각">
      {parts.join(' · ')}
    </div>
  )
}
