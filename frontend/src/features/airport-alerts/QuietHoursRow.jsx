import { useEffect, useState } from 'react'

// 밤 시간 휴대폰 푸시 끄기. 계정 하나에 한 번 정하고 모든 감시에 같이 적용한다(서버 user-alerts/quiet-hours.js).
// 야간 근무자도 있어 기본은 꺼짐이고, 시간은 30분 단위로 직접 고른다.
const TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)

export default function QuietHoursRow({ Switch }) {
  const [quiet, setQuiet] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    fetch('/api/me/push/quiet-hours', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (alive && data) setQuiet(data) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  if (!quiet) return null

  async function save(next) {
    const before = quiet
    setQuiet(next); setError('')
    try {
      const response = await fetch('/api/me/push/quiet-hours', {
        method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next),
      })
      if (!response.ok) throw new Error()
    } catch {
      setQuiet(before); setError('저장하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  return <div className="aa-quiet">
    <div className="aa-setting-row">
      <span>밤 시간 푸시 끄기<small>{quiet.enabled ? `${quiet.start}–${quiet.end} KST에는 휴대폰 푸시를 보내지 않습니다 · 알림 목록에는 남습니다` : '꺼짐 · 시간과 상관없이 푸시를 보냅니다'}</small></span>
      <Switch checked={quiet.enabled} label="밤 시간 푸시 끄기" onChange={(enabled) => save({ ...quiet, enabled })} />
    </div>
    {quiet.enabled && <div className="aa-quiet-times">
      <label>시작<select value={quiet.start} onChange={(event) => save({ ...quiet, start: event.target.value })}>
        {TIMES.map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
      <span aria-hidden="true">–</span>
      <label>끝<select value={quiet.end} onChange={(event) => save({ ...quiet, end: event.target.value })}>
        {TIMES.map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
      <span className="aa-quiet-tz">KST</span>
    </div>}
    {error && <p className="aa-box-note" role="alert">{error}</p>}
  </div>
}
