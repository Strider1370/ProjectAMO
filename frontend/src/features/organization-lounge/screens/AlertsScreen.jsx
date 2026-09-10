import { useMemo, useState } from 'react'
import { BellRing, Check, Clock3, MapPin } from 'lucide-react'
import { organizationRequest } from '../api.js'
import { Badge, Button, EmptyState, PageHeading, formatTime } from '../components.jsx'

export default function AlertsScreen({ orgId, data, tz, reload, navigate }) {
  const [tab, setTab] = useState('new'); const [busyId, setBusyId] = useState(''); const [error, setError] = useState('')
  const visible = useMemo(() => {
    const now = Date.now()
    return data.alerts.filter((alert) => {
      const snoozed = Number.isFinite(Date.parse(alert.hiddenUntil)) && Date.parse(alert.hiddenUntil) > now
      return tab === 'all' || (tab === 'new' && !alert.acknowledgedAt && !snoozed)
        || (tab === 'ack' && Boolean(alert.acknowledgedAt)) || (tab === 'snooze' && snoozed)
    })
  }, [data.alerts, tab])
  async function update(alert, status) {
    setBusyId(alert.id); setError('')
    try { await organizationRequest(orgId, `/alerts/${encodeURIComponent(alert.id)}/state`, { method: 'POST', body: status === 'acknowledged' ? { expectedVersion: alert.version, acknowledged: true } : { expectedVersion: alert.version, snoozeMinutes: 30 } }); reload() }
    catch (reason) { setError(reason.message) } finally { setBusyId('') }
  }
  return <>
    <PageHeading title="기상 알림" description="관심 공항과 운항 구역의 기상 변화를 확인하세요." action={<Button secondary onClick={() => navigate('settings')}>관심대상 설정</Button>} />
    <div className="ol-toolbar"><div className="ol-segments">{[['new', '새 알림'], ['ack', '기관 확인'], ['snooze', '나중에 보기'], ['all', '전체']].map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div><span className="ol-caption">확인은 기상현상의 종료를 뜻하지 않습니다.</span></div>
    {error && <p className="ol-form-error" role="alert">{error}</p>}
    <section className="ol-panel ol-alert-list">{visible.length ? visible.map((alert) => { const detail = alert.payload || {}; const level = detail.severity || detail.level || 'amber'; return <article key={alert.id}>
      <BellRing className={level === 'red' ? 'ol-red' : 'ol-amber'} /><div><div><Badge level={level === 'red' ? 'red' : 'amber'}>{alert.kind || '기상 알림'}</Badge><h2>{detail.title || detail.summary || alert.eventKey}</h2></div><p>{detail.description || detail.message || '관심대상에 유효한 기상 현상이 있습니다.'}</p><small>{detail.targetName || detail.target || '기관 관심대상'} · 관측/발표 {formatTime(detail.observedAt || detail.issuedAt || alert.updatedAt, tz, true)}{detail.validTo && ` · ${formatTime(detail.validTo, tz)}까지`}</small></div>
      <div className="ol-alert-actions"><Button secondary onClick={() => navigate('home')}><MapPin size={17} /> 지도에서 보기</Button>{!alert.acknowledgedAt && <Button disabled={busyId === alert.id} onClick={() => update(alert, 'acknowledged')}><Check size={17} /> 기관 확인</Button>}<Button secondary disabled={busyId === alert.id} onClick={() => update(alert, 'snoozed')}><Clock3 size={17} /> 30분 숨김</Button></div>
    </article> }) : <EmptyState title="이 상태의 알림이 없습니다." />}</section>
  </>
}
