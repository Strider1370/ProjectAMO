import { useEffect, useMemo, useState } from 'react'
import { Edit3, FilePlus2, Plane, Plus, Save, StickyNote } from 'lucide-react'
import { listSavedRoutes } from '../../route-briefing/lib/routeStore.js'
import { briefingTimeFields } from '../../route-briefing/lib/briefingTime.js'
import { organizationRequest } from '../api.js'
import { buildOrganizationFlightDraft, localInputToIso } from '../flightDraft.js'
import ShareFlightDialog from '../ShareFlightDialog.jsx'
import OrganizationMap from '../OrganizationMap.jsx'
import { MaterialDialog } from './MaterialsScreen.jsx'
import { Badge, Button, Dialog, EmptyState, PageHeading, Panel, formatTime, routeLabel } from '../components.jsx'

export default function FlightsScreen({ orgId, route, data, tz, user, navigate, reload }) {
  const selected = data.flights.find((flight) => String(flight.id) === route.itemId)
  const [formOpen, setFormOpen] = useState(route.itemId === 'new')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const today = briefingTimeFields(new Date().toISOString(), tz)
  const [date, setDate] = useState(`${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`)
  const [mine, setMine] = useState(false)
  const canPlan = ['admin', 'planner'].includes(data.organization?.role)
  const visibleFlights = data.flights.filter((flight) => {
    const fields = briefingTimeFields(flight.etd, tz)
    const key = `${fields.year}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}`
    return key === date && (!mine || String(flight.assignedUserId) === String(user.id))
  })
  useEffect(() => setFormOpen(route.itemId === 'new'), [route.itemId])
  if (selected) return <FlightDetail flight={selected} {...{ orgId, data, tz, user, navigate, reload, busy, setBusy, message, setMessage }} />
  return <>
    <PageHeading title="예정비행" description="구성원이 공유한 비행을 함께 조회하고 기상 브리핑을 확인합니다." action={<><Button onClick={() => setShareOpen(true)}><Plane size={18} /> 내 비행 공유</Button>{canPlan && <Button secondary onClick={() => { navigate('flights', 'new'); setFormOpen(true) }}><Plus size={18} /> 관리자 직접 등록</Button>}</>} />
    {message && <p className="ol-success" role="status">{message}</p>}
    <div className="ol-toolbar"><label>운항 날짜<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="ol-check"><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} /> 내 담당 비행</label></div>
    <section className="ol-panel ol-flight-list">
      {visibleFlights.length ? visibleFlights.map((flight) => <article key={flight.id}>
        <time>{formatTime(flight.etd, tz)}</time><div><strong>{flight.name}</strong><small>{routeLabel(flight)} · {Number(flight.snapshot?.cruiseAltitudeFt || flight.cruiseAltitudeFt || 0).toLocaleString()} ft</small></div>
        <span>{flight.assignedDisplayName || data.members.find((member) => String(member.userId || member.user_id) === String(flight.assignedUserId))?.displayName || '미배정'}</span>
        <Badge>{flight.status || 'scheduled'}</Badge>
        <div><Button secondary onClick={() => navigate('flights', flight.id)}>상세</Button><a className="ol-button" href={`/?orgId=${encodeURIComponent(orgId)}&orgFlightId=${encodeURIComponent(flight.id)}`}>기상 브리핑</a></div>
      </article>) : <EmptyState title="등록된 예정비행이 없습니다.">개인 저장 경로를 복사해 기관 비행으로 등록할 수 있습니다.</EmptyState>}
    </section>
    {shareOpen && <ShareFlightDialog orgId={orgId} tz={tz} onClose={() => setShareOpen(false)} onShared={() => { setMessage('내 비행을 기관에 공유했습니다.'); reload() }} />}
    {formOpen && canPlan && <FlightForm {...{ orgId, data, user, busy, setBusy, tz }} onClose={() => { setFormOpen(false); navigate('flights') }} onSaved={(flight) => { setFormOpen(false); setMessage('예정비행을 저장했습니다.'); reload(); navigate('flights', flight.id) }} />}
  </>
}

function FlightForm({ orgId, data, user, busy, setBusy, tz, onClose, onSaved }) {
  const [routes, setRoutes] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { listSavedRoutes({ kind: 'route' }).then(setRoutes).catch((reason) => setError(reason.message)) }, [])
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget)
    const source = routes.find((item) => String(item.id) === values.get('routeId'))
    if (!source) { setBusy(false); setError('저장 경로를 선택하세요.'); return }
    try {
      const body = buildOrganizationFlightDraft({ source, name: values.get('name'), assignedUserId: values.get('assignedUserId') || user.id, etd: values.get('etd'), eta: values.get('eta'), cruiseAltitudeFt: values.get('altitude'), tz })
      const result = await organizationRequest(orgId, '/flights', { method: 'POST', body })
      onSaved(result.flight || result)
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <Dialog title="예정비행 등록" onClose={onClose}><form className="ol-form" onSubmit={submit}>
    <label className="ol-full">비행명<input name="name" required /></label>
    <label className="ol-full">개인 저장 경로<select name="routeId" required><option value="">경로 선택</option>{routes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>출발시각 · {tz}<input name="etd" type="datetime-local" required /></label>
    <label>도착시각 · {tz}<input name="eta" type="datetime-local" required /></label>
    <label>계획고도 · ft AMSL<input name="altitude" type="number" min="500" max="60000" step="100" required /></label>
    <label className="ol-full">담당 조종사<select name="assignedUserId"><option value={user.id}>{user.display_name || user.username}</option>{data.members.filter((member) => String(member.userId || member.user_id) !== String(user.id)).map((member) => <option key={member.id} value={member.userId || member.user_id}>{member.displayName || member.username}</option>)}</select></label>
    {error && <p className="ol-form-error" role="alert">{error}</p>}
    <Button type="submit" className="ol-full" disabled={busy}><Save size={18} /> {busy ? '저장 중…' : '예정비행 저장'}</Button>
  </form></Dialog>
}

function FlightDetail({ orgId, flight, data, tz, user, navigate, reload, busy, setBusy, message, setMessage }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [viewedMaterial, setViewedMaterial] = useState(null)
  const canPlan = ['admin', 'planner'].includes(data.organization?.role)
  const isCreator = String(flight.createdBy) === String(user.id)
  const canEdit = canPlan || isCreator
  const canAnnotate = canEdit || String(flight.assignedUserId) === String(user.id)
  const linkedMaterials = useMemo(() => data.materials.filter((material) => (flight.materialRefs || []).some((ref) => String(ref.id || ref.materialId || ref) === String(material.id))), [data.materials, flight.materialRefs])
  return <>
    <button className="ol-back" type="button" onClick={() => navigate('flights')}>← 예정비행</button>
    <PageHeading title={flight.name} description={`${routeLabel(flight)} · ${formatTime(flight.etd, tz, true)}`} action={<>{canEdit && <Button secondary onClick={() => setEditOpen(true)}><Edit3 size={17} /> 비행계획 편집</Button>}<a className="ol-button" href={`/?orgId=${encodeURIComponent(orgId)}&orgFlightId=${encodeURIComponent(flight.id)}`}><Plane size={17} /> 기상 브리핑 보기</a></>} />
    {message && <p className="ol-success" role="status">{message}</p>}
    <dl className="ol-flight-facts"><div><dt>출발</dt><dd>{formatTime(flight.etd, tz, true)}</dd></div><div><dt>도착</dt><dd>{formatTime(flight.eta, tz, true)}</dd></div><div><dt>계획고도</dt><dd>{Number(flight.snapshot?.cruiseAltitudeFt || 0).toLocaleString()} ft</dd></div><div><dt>계획 버전</dt><dd>v{flight.version}</dd></div></dl>
    <div className="ol-detail-grid"><div className="ol-stack">
      <Panel title="저장 경로"><div className="ol-route-strip"><strong>{routeLabel(flight)}</strong><span>{flight.snapshot?.base?.routeString}</span></div></Panel>
      <Panel title="운항 참고사항" action={canAnnotate && <Button secondary onClick={() => { setEditingNote(null); setNoteOpen(true) }}><StickyNote size={17} /> 작성</Button>}>
        {(flight.annotations || []).length ? <div className="ol-note-list">{flight.annotations.map((note) => <article key={note.id}><strong>{note.title}</strong><p>{note.body || note.description}</p><small>사용자 작성{note.geometry || note.circle ? ' · 지도에 표시' : ''}</small>{canAnnotate && <div className="ol-panel-actions"><Button secondary disabled={busy} onClick={() => { setEditingNote(note); setNoteOpen(true) }}>편집</Button><Button secondary disabled={busy} onClick={async () => { setBusy(true); try { await organizationRequest(orgId, `/flights/${flight.id}/annotations/${note.id}`, { method: 'DELETE', body: { expectedVersion: flight.version } }); reload(); setMessage('운항 참고사항을 삭제했습니다.') } catch (reason) { setMessage(reason.message) } finally { setBusy(false) } }}>삭제</Button></div>}</article>)}</div> : <EmptyState title="등록된 참고사항이 없습니다.">이 비행에서 함께 확인할 사항을 남겨 주세요.</EmptyState>}
      </Panel>
    </div><Panel title="이 비행의 참고자료" action={canAnnotate && <Button secondary onClick={() => setMaterialsOpen(true)}><FilePlus2 size={17} /> 연결</Button>}>
      {(flight.materialRefs || []).length ? flight.materialRefs.map((ref) => { const id = ref.id ?? ref.materialId; const version = ref.version ?? ref.materialVersion; const material = linkedMaterials.find(item => String(item.id) === String(id)); return <button key={id} className="ol-material-row" type="button" disabled={busy} onClick={async () => { setBusy(true); try { const result = await organizationRequest(orgId, `/materials/${id}?version=${version}`); setViewedMaterial(result.material) } catch (reason) { setMessage(reason.message) } finally { setBusy(false) } }}>{material?.title || `기관 자료 ${id}`} · v{version}</button> }) : <EmptyState title="연결 자료가 없습니다." />}
    </Panel></div>
    {noteOpen && <AnnotationDialog initial={editingNote} {...{ orgId, flight, busy, setBusy }} onClose={() => setNoteOpen(false)} onSaved={() => { setNoteOpen(false); setMessage('운항 참고사항을 저장했습니다.'); reload() }} onError={(reason) => setMessage(reason.message)} />}
    {editOpen && <EditFlightDialog {...{ orgId, flight, data, tz, busy, setBusy }} canPlan={canPlan} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); setMessage('비행계획을 저장했습니다.'); reload() }} onError={(reason) => setMessage(reason.message)} />}
    {materialsOpen && <LinkMaterialsDialog {...{ orgId, flight, materials: data.materials, busy, setBusy }} onClose={() => setMaterialsOpen(false)} onSaved={() => { setMaterialsOpen(false); setMessage('참고자료 연결을 저장했습니다.'); reload() }} onError={(reason) => setMessage(reason.message)} />}
    {viewedMaterial && <MaterialDialog material={viewedMaterial} orgId={orgId} canEdit={false} onClose={() => setViewedMaterial(null)} />}
  </>
}

function localDateTime(value, tz) {
  if (!Number.isFinite(Date.parse(value))) return ''
  const fields = briefingTimeFields(value, tz)
  return `${fields.year}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}T${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
}
function EditFlightDialog({ orgId, flight, data, tz, busy, setBusy, canPlan, onClose, onSaved, onError }) {
  async function submit(event) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setBusy(true)
    try { await organizationRequest(orgId, `/flights/${encodeURIComponent(flight.id)}`, { method: 'PATCH', body: { expectedVersion: flight.version, name: values.get('name'), ...(canPlan ? { assignedUserId: Number(values.get('assignedUserId')) } : {}), etd: localInputToIso(values.get('etd'), tz), eta: localInputToIso(values.get('eta'), tz), status: values.get('status') } }); onSaved() }
    catch (reason) { onError(reason) } finally { setBusy(false) }
  }
  const assignee = data.members.find((member) => String(member.userId || member.user_id) === String(flight.assignedUserId))
  return <Dialog title="비행계획 편집" onClose={onClose}><form className="ol-form" onSubmit={submit}><label className="ol-full">비행명<input name="name" defaultValue={flight.name} required /></label><label>출발시각 · {tz}<input name="etd" type="datetime-local" defaultValue={localDateTime(flight.etd, tz)} required /></label><label>도착시각 · {tz}<input name="eta" type="datetime-local" defaultValue={localDateTime(flight.eta, tz)} required /></label>{canPlan ? <label>담당 조종사<select name="assignedUserId" defaultValue={flight.assignedUserId}>{data.members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || member.username}</option>)}</select></label> : <label>담당 조종사<input value={flight.assignedDisplayName || assignee?.displayName || assignee?.username || '미배정'} readOnly /></label>}<label>상태<select name="status" defaultValue={flight.status}><option value="scheduled">예정</option><option value="completed">완료</option><option value="cancelled">취소</option></select></label><Button type="submit" className="ol-full" disabled={busy}>비행계획 저장</Button></form></Dialog>
}
function LinkMaterialsDialog({ orgId, flight, materials, busy, setBusy, onClose, onSaved, onError }) {
  const current = new Set((flight.materialRefs || []).map((ref) => String(ref.id || ref.materialId || ref)))
  async function submit(event) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const materialRefs = values.getAll('materialId').map((id) => flight.materialRefs?.find(ref => String(ref.id ?? ref.materialId) === id) || ({ id: Number(id), version: materials.find((item) => String(item.id) === String(id))?.version }))
    setBusy(true); try { await organizationRequest(orgId, `/flights/${encodeURIComponent(flight.id)}`, { method: 'PATCH', body: { expectedVersion: flight.version, materialRefs } }); onSaved() } catch (reason) { onError(reason) } finally { setBusy(false) }
  }
  return <Dialog title="기관 공유자료에서 연결" onClose={onClose}><form onSubmit={submit}><div className="ol-choice-list">{materials.map((material) => <label className="ol-setting-row" key={material.id}><span><strong>{material.title}</strong><small>{material.kind} · v{material.version}</small></span><input type="checkbox" name="materialId" value={material.id} defaultChecked={current.has(String(material.id))} /></label>)}</div>{!materials.length && <EmptyState title="연결할 공유자료가 없습니다." />}<div className="ol-panel-actions"><Button type="submit" disabled={busy || !materials.length}>자료 연결 저장</Button></div></form></Dialog>
}

const SHAPES = [['text', '글만'], ['Point', '지점'], ['LineString', '선'], ['Polygon', '구역'], ['Circle', '원']]
function haversineMeters(a, b) {
  const rad = (value) => value * Math.PI / 180; const p1 = rad(a[1]); const p2 = rad(b[1]); const dp = p2 - p1; const dl = rad(b[0] - a[0])
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2))
}
function annotationGeometry(type, points) {
  if (type === 'text') return null
  if (type === 'Point' && points.length >= 1) return { type, coordinates: points[0] }
  if (type === 'LineString' && points.length >= 2) return { type, coordinates: points }
  if (type === 'Polygon' && points.length >= 3) return { type, coordinates: [[...points, points[0]]] }
  if (type === 'Circle' && points.length >= 2) return { center: points[0], radiusM: Math.round(haversineMeters(points[0], points[1])) }
  return undefined
}
function draftAnnotation(type, points) {
  const geometry = annotationGeometry(type, points)
  if (!geometry) return []
  return [{ id: 'draft', title: '작성 중', sourceKind: 'annotation', geometry: type === 'Circle' ? null : geometry, circle: type === 'Circle' ? { center: geometry.center, radiusMeters: geometry.radiusM } : null }]
}
function AnnotationDialog({ orgId, flight, busy, setBusy, onClose, onSaved, onError, initial }) {
  const [type, setType] = useState(initial?.circle ? 'Circle' : initial?.geometry?.type || 'text'); const [points, setPoints] = useState([]); const [localError, setLocalError] = useState('')
  const [keepGeometry, setKeepGeometry] = useState(Boolean(initial))
  const need = type === 'Point' ? 1 : type === 'Circle' ? 2 : type === 'LineString' ? 2 : type === 'Polygon' ? 3 : 0
  function addPoint(point) { setPoints((current) => type === 'Point' ? [[point.lon, point.lat]] : type === 'Circle' ? [...current, [point.lon, point.lat]].slice(0, 2) : [...current, [point.lon, point.lat]]) }
  async function submit(event) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const geometry = keepGeometry ? initial?.circle ? { center: initial.circle.center, radiusM: initial.circle.radiusMeters } : initial?.geometry : annotationGeometry(type, points)
    if (type !== 'text' && !geometry) { setLocalError(`지도에서 점을 ${need}개 이상 지정하세요.`); return }
    const min = values.get('altitudeMinFt'); const max = values.get('altitudeMaxFt')
    if ((min && !max) || (!min && max) || (min && Number(min) >= Number(max))) { setLocalError('고도 하한과 상한을 올바르게 함께 입력하세요.'); return }
    setBusy(true); setLocalError('')
    try { await organizationRequest(orgId, `/flights/${encodeURIComponent(flight.id)}/annotations${initial ? `/${initial.id}` : ''}`, { method: initial ? 'PATCH' : 'POST', body: { expectedVersion: flight.version, title: values.get('title'), description: values.get('description'), shapeType: type === 'text' ? null : type, geometry: geometry || null, altitudeMinFt: min ? Number(min) : null, altitudeMaxFt: max ? Number(max) : null } }); onSaved() }
    catch (reason) { setLocalError(reason.message); onError(reason) } finally { setBusy(false) }
  }
  return <Dialog title={initial ? "운항 참고사항 편집" : "운항 참고사항 작성"} onClose={onClose}><form className="ol-annotation-editor" onSubmit={submit}>
    <div><div className="ol-segments" aria-label="도형 종류">{SHAPES.map(([id, label]) => <button key={id} type="button" aria-pressed={type === id} onClick={() => { setType(id); setPoints([]); setKeepGeometry(false) }}>{label}</button>)}</div>{type !== 'text' && <><div className="ol-annotation-map"><OrganizationMap orgId={orgId} bundle={{ flight }} annotations={[...(flight.annotations || []), ...draftAnnotation(type, points)]} drawing onMapClick={point => { setKeepGeometry(false); addPoint(point) }} /></div><div className="ol-panel-actions"><span className="ol-caption">{keepGeometry ? '기존 도형 유지 · 지도 선택 시 다시 작성' : `${type === 'Point' ? '한 번' : type === 'Circle' ? '중심과 가장자리' : '꼭짓점'}을 지도에서 선택 · ${points.length}개 지정`}</span><Button secondary disabled={!points.length} onClick={() => setPoints((current) => current.slice(0, -1))}>한 점 취소</Button><Button secondary onClick={() => { setPoints([]); setKeepGeometry(false) }}>다시 그리기</Button></div></>}</div>
    <div className="ol-form"><label className="ol-full">제목<input name="title" defaultValue={initial?.title} required /></label><label className="ol-full">설명<textarea name="description" rows="5" defaultValue={initial?.description} /></label><label>고도 하한 · ft AMSL<input name="altitudeMinFt" type="number" min="0" max="60000" defaultValue={initial?.altitude?.minFt ?? initial?.altitudeMinFt ?? ''} /></label><label>고도 상한 · ft AMSL<input name="altitudeMaxFt" type="number" min="0" max="60000" defaultValue={initial?.altitude?.maxFt ?? initial?.altitudeMaxFt ?? ''} /></label>{localError && <p className="ol-form-error ol-full">{localError}</p>}<Button type="submit" className="ol-full" disabled={busy}>참고사항 저장</Button></div>
  </form></Dialog>
}
