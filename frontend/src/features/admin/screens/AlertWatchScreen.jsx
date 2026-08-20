import { useCallback, useEffect, useState } from 'react'

import { getAlertWatches } from '../adminApi.js'

// 알림 감시 — 지금 누가 무엇을 감시받고 있는지. 감시중만 보면 "왜 안 오지?"에 답할 수 없어
// 대기중·종료까지 함께 낸다. 조용한 이유가 이상없음인지 아직 안 봄인지가 여기서 갈린다.
const STATUS_KO = { watching: '감시중', pending: '대기중', ended: '종료', unknown: '시각없음' }
const STATUS_TONE = { watching: 'ok', pending: 'warn', ended: 'quiet', unknown: 'bad' }

// 항공 표기 관례: Zulu 시각을 콜론 없이 HHMMZ.
const hhmmZ = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}
const startLabel = (min) => (min % 60 === 0 ? `${min / 60}h 전` : `${min}분 전`)
const routeLabel = (w) => (w.departureAirport && w.arrivalAirport
  ? `${w.departureAirport} → ${w.arrivalAirport}`
  : w.name || '—')

export default function AlertWatchScreen() {
  const [watches, setWatches] = useState([])
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    getAlertWatches().then((d) => { setWatches(d.watches || []); setError(false) }).catch(() => setError(true))
  }, [])
  useEffect(() => { load() }, [load])

  const count = (status) => watches.filter((w) => w.status === status).length

  return (
    <section className="ac-sec ac-flush">
      <h2>
        알림 감시<em>{watches.length}건</em>
        <button type="button" className="ac-btn" style={{ marginLeft: 12 }} onClick={load}>새로고침</button>
      </h2>

      {error && <p className="ac-sub" style={{ padding: '0 22px 16px' }}>목록을 불러오지 못했습니다.</p>}

      {!error && watches.length === 0 ? (
        <p className="ac-sub" style={{ padding: '0 22px 16px' }}>등록된 비행 알림이 없습니다.</p>
      ) : (
        <>
          <table className="ac-t">
            <thead>
              <tr>
                <th>상태</th>
                <th>조종사</th>
                <th>비행</th>
                <th>ETD</th>
                <th>감시 시작</th>
                <th>발생</th>
                <th>푸시</th>
              </tr>
            </thead>
            <tbody>
              {watches.map((w) => (
                <tr key={w.id}>
                  <td><span className={`ac-chip ac-${STATUS_TONE[w.status] || 'quiet'}`}>{STATUS_KO[w.status] || w.status}</span></td>
                  <td className="ac-nm">{w.username}</td>
                  <td>{routeLabel(w)}</td>
                  <td className="n">{hhmmZ(w.etd)}</td>
                  <td className="ac-muted n">{startLabel(w.startMinBeforeEtd)}</td>
                  <td className="ac-r n">{w.alertCount}</td>
                  {/* 구독이 없으면 알림 행은 쌓여도 폰은 조용하다 — 원인을 여기서 짚는다. */}
                  <td className={w.pushSubscribed ? '' : 'ac-muted'}>
                    {w.pushSubscribed ? '✓' : '✗ 구독없음'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ac-sub" style={{ padding: '8px 22px 16px' }}>
            감시중 {count('watching')} · 대기중 {count('pending')} · 종료 {count('ended')}
          </p>
        </>
      )}
    </section>
  )
}
