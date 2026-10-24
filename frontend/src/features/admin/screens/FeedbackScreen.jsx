import { useCallback, useEffect, useState } from 'react'
import { getFeedback, setFeedbackStatus } from '../adminApi.js'

const FILTERS = [
  { id: 'new', label: '새 의견' },
  { id: 'all', label: '전체' },
  { id: 'done', label: '반영함' },
  { id: 'hidden', label: '숨김' },
]
const KIND = { error: '오류', inconvenience: '불편', suggestion: '제안' }
const PANEL = { 'route-check': '비행 전 브리핑', aviation: '항공정보', met: '기상정보', 'map-profile': '연직단면도', 'my-map': '내 지도', traffic: 'ADS-B', notam: 'NOTAM' }
const format = (iso) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '—'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(iso))
}

function screenText(context) {
  const route = context.route
  const parts = [
    context.briefing ? '지도형 브리핑' : PANEL[context.panel] ?? context.panel,
    route?.departure && route?.arrival ? `${route.departure}→${route.arrival}${route.cruiseAltitudeFt ? ` · ${route.cruiseAltitudeFt.toLocaleString()} ft` : ''}` : null,
    context.airport ? `공항 ${context.airport}` : null,
  ].filter(Boolean)
  return parts.join(' · ') || '지도'
}

function deviceText(context) {
  const agent = context.userAgent || ''
  const kind = /iPhone|Android.+Mobile/i.test(agent) ? '휴대폰' : /iPad|Android/i.test(agent) ? '태블릿' : 'PC'
  const browser = /Edg\//.test(agent) ? 'Edge' : /SamsungBrowser/.test(agent) ? '삼성 인터넷' : /Chrome\//.test(agent) ? 'Chrome'
    : /Safari\//.test(agent) ? 'Safari' : /Firefox\//.test(agent) ? 'Firefox' : '기타'
  const size = context.viewport ? ` · ${context.viewport.width}×${context.viewport.height}` : ''
  return `${kind} · ${browser}${size}`
}

export default function FeedbackScreen() {
  const [filter, setFilter] = useState('new')
  const [data, setData] = useState({ items: [], counts: {} })
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    getFeedback(filter).then((result) => { setData(result); setError(false) }).catch(() => setError(true))
  }, [filter])
  useEffect(() => { load() }, [load])

  const selected = data.items.find((item) => item.id === selectedId) ?? null

  async function open(item) {
    setSelectedId(item.id)
    if (item.status === 'new') {
      await setFeedbackStatus(item.id, 'read').catch(() => {})
      setData((current) => ({ ...current, items: current.items.map((row) => row.id === item.id ? { ...row, status: 'read' } : row) }))
    }
  }

  async function mark(status) {
    if (!selected) return
    await setFeedbackStatus(selected.id, status)
    load()
  }

  return <section className="ac-sec ac-flush ac-feedback">
    <h2>받은 의견<button type="button" className="ac-btn" style={{ marginLeft: 12 }} onClick={load}>새로고침</button></h2>
    <div className="ac-feedback-filters">
      <div className="ac-seg" role="group" aria-label="의견 분류">
        {FILTERS.map((item) => <button type="button" key={item.id} className={filter === item.id ? 'ac-on' : ''}
          aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setSelectedId(null) }}>
          {item.label}{data.counts?.[item.id] ? ` ${data.counts[item.id]}` : ''}
        </button>)}
      </div>
      <span className="ac-sub">사진은 받은 날부터 90일 뒤 지워집니다.</span>
    </div>
    {error && <p className="ac-sub" role="alert" style={{ padding: '0 22px 16px' }}>목록을 불러오지 못했습니다.</p>}
    <div className="ac-feedback-grid">
      <div className="ac-feedback-list">
        {!error && !data.items.length ? <p className="ac-sub" style={{ padding: '16px 22px' }}>의견이 없습니다.</p>
          : <table className="ac-t"><thead><tr><th>종류</th><th>내용</th><th>사진</th><th>받은 때</th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id} className={`${item.id === selectedId ? 'is-selected' : ''}${item.status === 'new' ? ' is-new' : ''}`}
              onClick={() => open(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') open(item) }}>
              <td className="ac-nm">{KIND[item.kind] ?? item.kind}</td>
              <td className="ac-feedback-msg">{item.message}</td>
              <td className="ac-muted">{item.images.length ? `${item.images.length}장` : '—'}</td>
              <td className="ac-muted">{format(item.createdAt)}</td>
            </tr>)}</tbody></table>}
      </div>
      <aside className="ac-feedback-detail">
        {!selected ? <p className="ac-sub">의견을 고르면 내용과 사진이 여기에 나옵니다.</p> : <>
          <p className="ac-sub">{KIND[selected.kind]} · {format(selected.createdAt)} KST</p>
          <p className="ac-feedback-body">{selected.message}</p>
          {selected.images.length > 0 && <div className="ac-feedback-photos">
            {selected.images.map((key, index) => <a key={key} href={`/api/admin/feedback/${selected.id}/images/${key}`} target="_blank" rel="noreferrer">
              <img src={`/api/admin/feedback/${selected.id}/images/${key}`} alt={`첨부 사진 ${index + 1}`} />
            </a>)}
          </div>}
          <dl className="ac-feedback-context">
            <dt>보던 화면</dt><dd>{screenText(selected.context)}</dd>
            <dt>켠 레이어</dt><dd>{selected.context.layers?.length ? selected.context.layers.join(' · ') : '—'}</dd>
            <dt>기기</dt><dd>{deviceText(selected.context)}</dd>
            <dt>버전</dt><dd>{selected.context.version ? `v${selected.context.version}` : '—'}</dd>
            <dt>계정</dt><dd>{selected.username ?? '로그인 안 함'}</dd>
          </dl>
          <div className="ac-feedback-actions">
            {selected.status === 'done' ? <button type="button" className="ac-btn ac-btn-quiet" onClick={() => mark('read')}>반영 표시 해제</button>
              : <button type="button" className="ac-btn ac-btn-quiet" onClick={() => mark('done')}>반영함으로 표시</button>}
            {selected.status === 'hidden' ? <button type="button" className="ac-btn ac-btn-quiet" onClick={() => mark('read')}>숨김 해제</button>
              : <button type="button" className="ac-btn ac-btn-quiet" onClick={() => mark('hidden')}>숨기기</button>}
          </div>
        </>}
      </aside>
    </div>
  </section>
}
