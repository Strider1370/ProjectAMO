import { useState } from 'react'
import { Plus, Save, UserPlus } from 'lucide-react'
import { organizationRequest } from '../api.js'
import { Badge, Button, Dialog, EmptyState, PageHeading, Panel } from '../components.jsx'
import OrganizationMap from '../OrganizationMap.jsx'

export default function SettingsScreen({ orgId, data, reload }) {
  const organization = data.organization || {}
  const [radius, setRadius] = useState(organization.settings?.airportRadiusKm || 10)
  const [windowMinutes, setWindowMinutes] = useState(organization.settings?.lightningWindowMinutes || 30)
  const [joint, setJoint] = useState(organization.settings?.jointBriefingEnabled !== false)
  const [message, setMessage] = useState('')
  const [memberOpen, setMemberOpen] = useState(false)
  const [interestOpen, setInterestOpen] = useState(false)
  const [regionOpen, setRegionOpen] = useState(false)
  const canAdmin = organization.role === 'admin'
  async function save() {
    try { await organizationRequest(orgId, '/settings', { method: 'PATCH', body: { expectedVersion: organization.version, settings: { ...organization.settings, airportRadiusKm: Number(radius), lightningWindowMinutes: Number(windowMinutes), jointBriefingEnabled: joint } } }); setMessage('기관 설정을 저장했습니다.'); reload() }
    catch (reason) { setMessage(reason.message) }
  }
  return <>
    <PageHeading title="기관 설정" description={`${organization.name || '기관'}의 관심대상과 구성원을 관리합니다.`} action={canAdmin && <Button onClick={save}><Save size={17} /> 설정 저장</Button>} />
    {message && <p className={message.includes('저장했습니다') ? 'ol-success' : 'ol-form-error'} role="status">{message}</p>}
    <div className="ol-settings-grid">
      <Panel title="관심 공항" action={canAdmin && <Button secondary onClick={() => setInterestOpen(true)}><Plus size={17} /> 추가</Button>}>{data.interests.filter((item) => item.kind === 'airport' || item.type === 'airport').length ? data.interests.filter((item) => item.kind === 'airport' || item.type === 'airport').map((item) => <div className="ol-setting-row" key={item.id}><span><strong>{item.name || item.icao}</strong><small>{item.icao}</small></span><Badge>기상·경보 표시</Badge></div>) : <EmptyState title="관심 공항이 없습니다." />}</Panel>
      <Panel title="관심 권역" action={canAdmin && <Button secondary onClick={() => setRegionOpen(true)}><Plus size={17} /> 권역 추가</Button>}>{data.interests.filter((item) => item.kind === 'region' || item.type === 'region').length ? data.interests.filter((item) => item.kind === 'region' || item.type === 'region').map((item) => <div className="ol-setting-row" key={item.id}><strong>{item.name}</strong><Badge>GeoJSON</Badge></div>) : <EmptyState title="관심 권역이 없습니다." />}</Panel>
      <Panel title="기상 조회 조건"><div className="ol-form ol-settings-form"><label>공항 주변 반경<select value={radius} onChange={(event) => setRadius(event.target.value)}><option value="5">5 km</option><option value="10">10 km</option><option value="20">20 km</option></select></label><label>낙뢰 조회 기간<select value={windowMinutes} onChange={(event) => setWindowMinutes(event.target.value)}><option value="15">최근 15분</option><option value="30">최근 30분</option><option value="60">최근 60분</option></select></label><p className="ol-caption ol-full">조회 범위 설정이며 운항 판단 기준은 아닙니다.</p></div></Panel>
      <Panel title="기능과 구성원" action={canAdmin && <Button secondary onClick={() => setMemberOpen(true)}><UserPlus size={17} /> 구성원 추가</Button>}><label className="ol-setting-row"><span><strong>합동 브리핑 사용</strong><small>준비·발표 메뉴를 표시합니다.</small></span><input type="checkbox" checked={joint} disabled={!canAdmin} onChange={(event) => setJoint(event.target.checked)} /></label>{data.members.map((member) => <div className="ol-setting-row" key={member.userId}><span><strong>{member.displayName || member.username}</strong><small>{member.status === 'inactive' ? '비활성' : member.username}</small></span><Badge>{({ admin: '기관 관리자', planner: '비행계획 관리자', member: '일반 회원' })[member.role] || member.role}</Badge></div>)}</Panel>
    </div>
    {memberOpen && <MemberDialog orgId={orgId} onClose={() => setMemberOpen(false)} onSaved={() => { setMemberOpen(false); setMessage('구성원을 저장했습니다.'); reload() }} />}
    {interestOpen && <InterestDialog orgId={orgId} onClose={() => setInterestOpen(false)} onSaved={() => { setInterestOpen(false); setMessage('관심 공항을 저장했습니다.'); reload() }} />}
    {regionOpen && <RegionDialog orgId={orgId} interests={data.interests} onClose={() => setRegionOpen(false)} onSaved={() => { setRegionOpen(false); setMessage('관심 권역을 저장했습니다.'); reload() }} />}
  </>
}

function RegionDialog({ orgId, interests, onClose, onSaved }) {
  const [points, setPoints] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const geometry = points.length >= 3 ? { type: 'Polygon', coordinates: [[...points, points[0]]] } : null
  async function submit(event) {
    event.preventDefault(); if (!geometry) return setError('지도에서 꼭짓점을 3개 이상 지정하세요.')
    setBusy(true); setError(''); const values = new FormData(event.currentTarget)
    try { await organizationRequest(orgId, '/interests', { method: 'POST', body: { kind: 'region', name: values.get('name'), geometry, lightningRadiusKm: 10, lightningWindowMinutes: 30 } }); onSaved() }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  const draft = geometry ? [{ id: 'draft-region', title: '작성 중인 권역', sourceKind: 'annotation', geometry }] : []
  return <Dialog title="관심 권역 그리기" onClose={onClose}><form className="ol-annotation-editor" onSubmit={submit}><div><div className="ol-annotation-map"><OrganizationMap orgId={orgId} situation={{ interests }} annotations={draft} drawing onMapClick={({ lon, lat }) => setPoints((value) => [...value, [lon, lat]])} /></div><div className="ol-panel-actions"><span className="ol-caption">지도에서 꼭짓점 선택 · {points.length}개</span><Button secondary disabled={!points.length} onClick={() => setPoints((value) => value.slice(0, -1))}>한 점 취소</Button><Button secondary disabled={!points.length} onClick={() => setPoints([])}>다시 그리기</Button></div></div><div className="ol-form"><label className="ol-full">권역명<input name="name" required /></label><p className="ol-caption ol-full">다각형을 닫아 WGS84 GeoJSON으로 저장합니다.</p>{error && <p className="ol-form-error ol-full">{error}</p>}<Button type="submit" className="ol-full" disabled={busy}>권역 저장</Button></div></form></Dialog>
}

function InterestDialog({ orgId, onClose, onSaved }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); const values = new FormData(event.currentTarget)
    try { await organizationRequest(orgId, '/interests', { method: 'POST', body: { kind: 'airport', name: values.get('name'), icao: String(values.get('icao')).toUpperCase(), config: {} } }); onSaved() }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <Dialog title="관심 공항 추가" onClose={onClose}><form className="ol-form" onSubmit={submit}><label className="ol-full">공항명<input name="name" required /></label><label className="ol-full">ICAO 코드<input name="icao" required minLength="4" maxLength="4" pattern="[A-Za-z]{4}" /></label>{error && <p className="ol-form-error ol-full">{error}</p>}<Button type="submit" className="ol-full" disabled={busy}>{busy ? '저장 중…' : '관심 공항 저장'}</Button></form></Dialog>
}

function MemberDialog({ orgId, onClose, onSaved }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); const values = new FormData(event.currentTarget)
    try { await organizationRequest(orgId, `/members/${encodeURIComponent(values.get('userId'))}`, { method: 'PUT', body: { role: values.get('role'), status: 'active' } }); onSaved() }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <Dialog title="기관 구성원 추가" onClose={onClose}><form className="ol-form" onSubmit={submit}><label className="ol-full">사용자 ID<input name="userId" type="number" min="1" required /></label><label className="ol-full">기관 역할<select name="role"><option value="member">일반 회원</option><option value="planner">비행계획 관리자</option><option value="admin">기관 관리자</option></select></label><p className="ol-caption ol-full">현재 버전은 등록된 사용자의 ID로 구성원을 연결합니다.</p>{error && <p className="ol-form-error ol-full">{error}</p>}<Button type="submit" className="ol-full" disabled={busy}>{busy ? '저장 중…' : '구성원 저장'}</Button></form></Dialog>
}
