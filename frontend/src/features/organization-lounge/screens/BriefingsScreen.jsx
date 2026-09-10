import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarPlus, Play, Save } from 'lucide-react'
import { organizationRequest } from '../api.js'
import { localInputToIso } from '../flightDraft.js'
import { Badge, Button, Dialog, EmptyState, PageHeading, Panel, formatTime, routeLabel } from '../components.jsx'

export default function BriefingsScreen({ orgId, route, data, tz, navigate, reload }) {
  const selected = data.briefings.find((item) => String(item.id) === route.itemId)
  const [createOpen, setCreateOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const canPlan = ['admin', 'planner'].includes(data.organization?.role)
  async function create(event) {
    event.preventDefault(); setBusy(true); setError(''); const values = new FormData(event.currentTarget)
    try {
      const result = await organizationRequest(orgId, '/briefings', { method: 'POST', body: { name: values.get('name'), scheduledAt: localInputToIso(values.get('scheduledAt'), tz), flightIds: data.flights.map((flight) => flight.id), materialRefs: [], blocks: [] } })
      setCreateOpen(false); reload(); navigate('briefings', (result.briefing || result).id)
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  if (selected) return <BriefingPrepare key={selected.id} {...{ orgId, briefing: selected, data, tz, navigate, reload }} />
  return <>
    <PageHeading title="합동 브리핑" description="비행별 계획과 자료를 모아 함께 브리핑합니다." action={canPlan && <Button onClick={() => setCreateOpen(true)}><CalendarPlus size={18} /> 새 브리핑</Button>} />
    <section className="ol-panel ol-session-list">{data.briefings.length ? data.briefings.map((briefing) => <article key={briefing.id}>
      <div className="ol-session-date"><small>{(briefing.scheduledAt || briefing.createdAt || '').slice(5, 7)}월</small><strong>{(briefing.scheduledAt || briefing.createdAt || '').slice(8, 10)}</strong></div>
      <div><div><h2>{briefing.name}</h2><Badge level={briefing.status === 'ended' ? 'gray' : 'green'}>{briefing.status === 'ended' ? '종료' : '준비 중'}</Badge></div><p>{formatTime(briefing.scheduledAt || briefing.createdAt, tz, true)} · 예정비행 {(briefing.flightIds || []).length}개</p></div>
      <Button secondary onClick={() => navigate('briefings', briefing.id)}>{briefing.status === 'ended' ? '기록 보기' : '준비 화면'}</Button>
    </article>) : <EmptyState title="합동 브리핑 회차가 없습니다.">예정비행을 묶어 첫 회차를 만드세요.</EmptyState>}</section>
    {createOpen && canPlan && <Dialog title="합동 브리핑 만들기" onClose={() => setCreateOpen(false)}><form className="ol-form" onSubmit={create}><label className="ol-full">회차 제목<input name="name" required /></label><label className="ol-full">브리핑 시각 · {tz}<input name="scheduledAt" type="datetime-local" required /></label><p className="ol-caption ol-full">현재 예정비행 {data.flights.length}개를 발표 순서에 추가합니다.</p>{error && <p className="ol-form-error ol-full">{error}</p>}<Button type="submit" className="ol-full" disabled={busy}>{busy ? '생성 중…' : '준비 화면 열기'}</Button></form></Dialog>}
  </>
}

function BriefingPrepare({ orgId, briefing, data, tz, navigate, reload }) {
  const canPlan = ['admin', 'planner'].includes(data.organization?.role)
  const [version, setVersion] = useState(briefing.version)
  const [materialRefs, setMaterialRefs] = useState(() => briefing.materialRefs || [])
  const [order, setOrder] = useState(() => briefing.flightIds || [])
  const [selectedId, setSelectedId] = useState(() => (briefing.flightIds || [])[0])
  const [notes, setNotes] = useState(() => Object.fromEntries((briefing.flightIds || []).map((flightId) => [flightId, briefing.blocks?.find((block) => block.kind === 'speaker-notes' && String(block.flightId) === String(flightId))?.body || ''])))
  useEffect(() => { if (!order.some(id => String(id) === String(selectedId))) setSelectedId(order[0] ?? null) }, [order, selectedId])
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  const flight = useMemo(() => data.flights.find((item) => String(item.id) === String(selectedId)), [data.flights, selectedId])
  function move(offset) { const index = order.findIndex((id) => String(id) === String(selectedId)); const next = index + offset; if (index < 0 || next < 0 || next >= order.length) return; const copy = [...order]; [copy[index], copy[next]] = [copy[next], copy[index]]; setOrder(copy) }
  async function save() {
    setBusy(true); setMessage('')
    try { const result = await organizationRequest(orgId, `/briefings/${encodeURIComponent(briefing.id)}`, { method: 'PATCH', body: { expectedVersion: version, flightIds: order, materialRefs, blocks: [...(briefing.blocks || []).filter(block => block.kind !== 'speaker-notes'), ...order.map((flightId) => ({ kind: 'speaker-notes', flightId, body: notes[flightId] || '' }))] } }); setVersion(result.briefing.version); setMessage('발표 순서와 작성 내용을 저장했습니다.'); reload(); return true }
    catch (reason) { setMessage(reason.message); return false } finally { setBusy(false) }
  }
  async function present() {
    setBusy(true); setMessage('')
    try { if (await save()) navigate('briefings', briefing.id, 'present') }
    catch (reason) { setMessage(reason.message) } finally { setBusy(false) }
  }
  return <>
    <button className="ol-back" type="button" onClick={() => navigate('briefings')}>← 합동 브리핑</button>
    <PageHeading title={briefing.name} description={`${formatTime(briefing.scheduledAt || briefing.createdAt, tz, true)} · ${order.length}개 비행`} action={canPlan && <><Button secondary disabled={busy} onClick={save}><Save size={17} /> 저장</Button><Button disabled={busy || !order.length} onClick={present}><Play size={17} /> 발표 시작</Button></>} />
    {message && <p className={message.includes('저장했습니다') ? 'ol-success' : 'ol-form-error'} role="status">{message}</p>}
    <div className="ol-prepare-grid"><Panel title="발표 순서" action={<Badge>{order.length}개</Badge>}>
      <div className="ol-prepare-list">{order.map((flightId, index) => { const item = data.flights.find((candidate) => String(candidate.id) === String(flightId)); return item && <button key={flightId} type="button" aria-pressed={String(selectedId) === String(flightId)} onClick={() => setSelectedId(flightId)}><span>{index + 1}</span><strong>{item.name}</strong><small>{formatTime(item.etd, tz)} · {routeLabel(item)}</small></button> })}</div>
      {canPlan && <><div className="ol-panel-actions"><Button secondary aria-label="선택 비행 위로" onClick={() => move(-1)}><ArrowUp /></Button><Button secondary aria-label="선택 비행 아래로" onClick={() => move(1)}><ArrowDown /></Button></div>
      <details><summary>발표할 예정비행 선택</summary>{data.flights.map(item => <label className="ol-setting-row" key={item.id}><span>{item.name}</span><input type="checkbox" checked={order.some(id => String(id) === String(item.id))} onChange={event => { setOrder(current => event.target.checked ? [...current, item.id] : current.filter(id => String(id) !== String(item.id))); if (event.target.checked && !selectedId) setSelectedId(item.id) }} /></label>)}</details></>}
    </Panel><Panel title={flight?.name || '비행을 선택하세요'} action={flight && <button className="ol-text-button" type="button" onClick={() => navigate('flights', flight.id)}>비행 상세</button>}>
      {flight ? <div className="ol-editor"><p className="ol-caption">자동 연결 · 평면 지도 · 연직단면도 · 주요 위험기상</p><label>운항 참고사항<textarea readOnly={!canPlan} value={notes[selectedId] || ''} onChange={(event) => setNotes((value) => ({ ...value, [selectedId]: event.target.value }))} /></label><div><strong>참고자료</strong><p className="ol-caption">비행에 연결된 기관 자료 {(flight.materialRefs || []).length}건</p></div></div> : <EmptyState title="발표할 비행이 없습니다." />}
    </Panel></div>
    <Panel title="공통 참고자료"><p className="ol-caption">선택한 자료 버전을 모든 비행에 함께 표시합니다.</p>{data.materials.map(material => { const ref = materialRefs.find(item => String(item.id ?? item.materialId) === String(material.id)); return <label key={material.id} className="ol-setting-row"><span><strong>{material.title}</strong><small>v{ref?.version ?? ref?.materialVersion ?? material.version}</small></span><input type="checkbox" disabled={!canPlan} checked={Boolean(ref)} onChange={event => setMaterialRefs(current => event.target.checked ? [...current, { id: material.id, version: material.version }] : current.filter(item => String(item.id ?? item.materialId) !== String(material.id)))} /></label> })}{!data.materials.length && <EmptyState title="공유자료를 먼저 등록하세요." />}</Panel>
  </>
}
