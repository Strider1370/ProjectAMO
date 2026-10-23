import { useCallback, useEffect, useState } from 'react'
import { getAlertWatches } from '../adminApi.js'

const STATUS = { watching: '감시 중', paused: '일시정지', paused_demo: '시연 중 중지', ended: '비행 종료' }
const TONE = { watching: 'ok', paused: 'quiet', paused_demo: 'warn', ended: 'quiet' }
const format = (iso) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '—'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

export default function AlertWatchScreen({ adminQuery }) {
  const [data, setData] = useState({ watches: [], summary: null })
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    getAlertWatches(adminQuery).then((result) => {
      if (!result.query.current) return
      setData({ watches: result.data.watches ?? [], summary: result.data.summary ?? null })
      setError(false)
    }).catch(() => setError(true))
  }, [adminQuery])
  useEffect(() => { load() }, [load])
  return <section className="ac-sec ac-flush">
    <h2>알림 감시<em>{data.watches.length}건</em><button type="button" className="ac-btn" style={{ marginLeft: 12 }} onClick={load}>새로고침</button></h2>
    {error && <p className="ac-sub" role="alert" style={{ padding: '0 22px 16px' }}>목록을 불러오지 못했습니다.</p>}
    {data.summary && <p className="ac-sub" style={{ padding: '0 22px 12px' }}>
      공항·경로 감시 중 {data.summary.watching}건 · 일시정지 {data.summary.paused}건 · 비행 종료 {data.summary.ended}건
    </p>}
    {!error && !data.watches.length ? <p className="ac-sub" style={{ padding: '0 22px 16px' }}>등록된 공항·경로 감시가 없습니다.</p>
      : <table className="ac-t"><thead><tr><th>상태</th><th>종류</th><th>사용자</th><th>감시 대상</th><th>마지막 평가</th><th>발생</th><th>푸시 구독</th></tr></thead>
        <tbody>{data.watches.map((watch) => <tr key={watch.id}>
          <td><span className={`ac-chip ac-${TONE[watch.status] ?? 'quiet'}`}>{STATUS[watch.status] ?? watch.status}</span></td>
          <td>{watch.kind === 'airport' ? '공항' : '경로 SIGMET'}</td>
          <td className="ac-nm">{watch.username}</td>
          <td>{watch.target}{watch.kind === 'route' && watch.eta && <small> · 도착 {format(watch.eta)} KST</small>}</td>
          <td className="ac-muted">{format(watch.lastEvaluatedAt)}{watch.lastEvaluatedAt && ' KST'}</td>
          <td className="ac-r n">{watch.eventCount}</td>
          <td className={watch.pushSubscribed ? '' : 'ac-muted'}>{watch.pushSubscribed ? '등록됨' : '없음'}</td>
        </tr>)}</tbody></table>}
  </section>
}
