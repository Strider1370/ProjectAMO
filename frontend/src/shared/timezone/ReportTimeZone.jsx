import { useState } from 'react'
import { useTimeZone } from './TimeZoneContext.jsx'
import './ReportTimeZone.css'

// Temporary display override: never updates the global setting or localStorage.
// A different airport/report view or global setting starts from the default again.
export function useReportTimeZone(resetKey) {
  const { tz: defaultTz } = useTimeZone()
  const [selection, setSelection] = useState(null)
  if (selection && (selection.key !== resetKey || selection.defaultTz !== defaultTz)) {
    setSelection(null)
  }
  const tz = selection && selection.key === resetKey && selection.defaultTz === defaultTz ? selection.tz : defaultTz
  return [tz, (value) => setSelection({ key: resetKey, defaultTz, tz: value })]
}

export default function ReportTimeZone({ tz, onChange, label }) {
  return (
    <select className="report-timezone" aria-label={`${label} 표시 시간대`} title="이 영역만 임시 변경 · 전체 설정 유지"
      value={tz} onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <option value="KST">KST</option>
      <option value="UTC">UTC</option>
    </select>
  )
}
