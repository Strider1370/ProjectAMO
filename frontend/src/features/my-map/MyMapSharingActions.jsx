import { useEffect, useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from '../../shared/ui/fluent.js'
import { documentGroupCount, documentItemCount, documentScopedId } from './lib/mapPanelRows.js'
import { effectiveHiddenGroups } from './lib/mapDocumentOverlay.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

export function OrganizationMapStamp({ document }) {
  const { tz } = useTimeZone(), share = document.organization
  if (!share) return null
  const date = new Date(share.updatedAt)
  const time = Number.isFinite(date.getTime()) ? `${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul' }).format(date)} ${tz}` : ''
  return <span>{share.organizationName} · {share.version}판{time && <> · <time dateTime={share.updatedAt}>{time}</time></>}</span>
}

const canManage = (doc, userId) => doc.organization?.role === 'admin' || doc.organization?.publisherUserId === userId

function ShareDialog({ open, sourceDocument, myMap, onClose }) {
  const [orgId, setOrgId] = useState(''), [sourceId, setSourceId] = useState(''), [targetId, setTargetId] = useState('')
  const [name, setName] = useState(''), [note, setNote] = useState(''), [pending, setPending] = useState(false), [failed, setFailed] = useState(false)
  const [expectedVersion, setExpectedVersion] = useState(null)
  const personal = myMap.documents.filter((doc) => doc.kind === 'personal')
  const memberships = myMap.sharing?.memberships ?? []
  const source = myMap.documents.find((doc) => doc.id === sourceId)
  const targets = myMap.documents.filter((doc) => doc.kind === 'organization' && String(doc.organization.organizationId) === orgId && canManage(doc, myMap.sharing?.userId))
  const target = targets.find((doc) => doc.id === targetId)
  useEffect(() => {
    if (!open) return
    const shared = sourceDocument.organization
    const source = shared ? personal.find((doc) => doc.id === shared.sourcePersonalMapId) ?? personal[0] : sourceDocument
    setSourceId(source?.id ?? ''); setOrgId(String(shared?.organizationId ?? memberships[0]?.id ?? ''))
    setTargetId(shared ? sourceDocument.id : ''); setName(sourceDocument.name); setNote(''); setFailed(false)
    setExpectedVersion(shared?.latestVersion ?? null)
    void myMap.prepareSharing?.(source?.id)
  }, [open, sourceDocument.id]) // Form drafts remain stable while save/refresh callbacks update props.
  useEffect(() => { if (open && !orgId && memberships[0]) setOrgId(String(memberships[0].id)) }, [open, orgId, memberships])
  const hiddenGroups = new Set(source ? effectiveHiddenGroups([source], myMap.hiddenGroups) : [])
  const hiddenCount = source?.items?.filter((item) => !myMap.visibleIds.has(source.id) || hiddenGroups.has(documentScopedId(source.id, item.groupId)) || myMap.hiddenItems.has(documentScopedId(source.id, item.id))).length ?? 0
  const valid = myMap.storage?.account && memberships.some((member) => String(member.id) === orgId) && source?.loaded !== false && source?.kind === 'personal' && name.trim() && (!targetId || target)
  const submit = async () => {
    if (pending || !valid) return
    setPending(true); setFailed(false)
    try {
      const result = await myMap.publishMap(source.id, { organizationId: Number(orgId), sharedId: target?.organization.mapId, expectedSharedVersion: expectedVersion, name: name.trim(), note })
      if (result) onClose()
      else setFailed(true)
    } finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !pending) onClose() }}><DialogSurface><DialogBody>
    <DialogTitle>{targetId ? '공유본 업데이트' : '기관에 지도 공유'}</DialogTitle>
    <DialogContent>
      {!myMap.storage?.account ? <p>로그인하면 소속 기관에 지도를 공유할 수 있습니다. 개인 작업은 그대로 유지됩니다.</p>
        : !memberships.length ? <p>{myMap.sharing?.ready ? '공유할 수 있는 소속 기관이 없습니다.' : '소속 기관을 확인하고 있습니다…'}</p> : <>
          <label className="my-map-editor-field"><span>공유할 기관</span><select disabled={pending || Boolean(sourceDocument.organization)} value={orgId} onChange={(event) => { setOrgId(event.target.value); setTargetId('') }}>{memberships.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          {sourceDocument.organization && <label className="my-map-editor-field"><span>공유할 개인 지도</span><select disabled={pending} value={sourceId} onChange={(event) => { setSourceId(event.target.value); void myMap.prepareSharing(event.target.value) }}><option value="">개인 지도를 선택하세요</option>{personal.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</select></label>}
          {!sourceDocument.organization && targets.length > 0 && <label className="my-map-editor-field"><span>공유 방식</span><select disabled={pending} value={targetId} onChange={(event) => { setTargetId(event.target.value); setExpectedVersion(targets.find((doc) => doc.id === event.target.value)?.organization.latestVersion ?? null) }}><option value="">새 공유본 만들기</option>{targets.map((doc) => <option key={doc.id} value={doc.id}>{doc.name} · {doc.organization.latestVersion}판 업데이트</option>)}</select></label>}
          <label className="my-map-editor-field"><span>지도 이름</span><input disabled={pending} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="my-map-editor-field"><span>전달 메모</span><textarea disabled={pending} maxLength={2000} rows={3} placeholder="동료에게 전할 참고사항" value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <p className="my-map-preview-note">지도 전체 {documentItemCount(source ?? {}).toLocaleString()}개 항목 · {documentGroupCount(source ?? {})}개 그룹 · 숨긴 항목 {hiddenCount}개 포함</p>
          <p>기관 구성원은 공유한 버전을 봅니다. 이후 개인 지도를 수정해도 공유본은 바뀌지 않습니다.</p>
          {!source && <p>기관 지도를 내 지도로 복사한 뒤 수정한 개인 사본을 선택할 수 있습니다.</p>}
        </>}
      {myMap.sharing?.error && <p className="my-map-error" role="alert">{myMap.sharing.error}</p>}
      {failed && <p className="my-map-error" role="alert">{myMap.error || '공유하지 못했습니다. 저장 상태와 권한을 확인한 뒤 다시 시도하세요.'}</p>}
    </DialogContent>
    <DialogActions><Button appearance="secondary" disabled={pending} onClick={onClose}>취소</Button><Button appearance="primary" disabled={pending || !valid} onClick={submit}>{pending ? '저장 확인·공유 중…' : '이 버전 공유'}</Button></DialogActions>
  </DialogBody></DialogSurface></Dialog>
}

export default function MyMapSharingActions({ document, myMap }) {
  const [open, setOpen] = useState(false), [stop, setStop] = useState(false), [stopping, setStopping] = useState(false)
  const [stopFailed, setStopFailed] = useState(false)
  const share = document.organization
  if (!['personal', 'organization'].includes(document.kind)) return null
  return <div className="my-map-sharing">
    {share && <><p className="my-map-preview-note"><OrganizationMapStamp document={document} /> · 읽기 전용</p>{share.note && <p className="my-map-description">{share.note}</p>}</>}
    {share?.latestVersion > share?.version && <div className="my-map-sharing-update" role="status"><span>새 버전이 있습니다 · {share.latestVersion}판</span><button type="button" className="my-map-primary-button" disabled={Boolean(myMap.busy)} onClick={() => myMap.applyOrganizationVersion(document.id)}>적용</button></div>}
    <div className="my-map-sharing-actions">
      {!share ? <button type="button" className="my-map-secondary-button" onClick={() => setOpen(true)}><Share2 size={16} aria-hidden="true" />기관에 공유</button>
        : <><button type="button" className="my-map-primary-button" onClick={() => myMap.copyOrganizationMap(document.id)}><Copy size={16} aria-hidden="true" />내 지도로 복사</button>
          {canManage(document, myMap.sharing?.userId) && <><button type="button" className="my-map-secondary-button" onClick={() => setOpen(true)}>공유본 업데이트</button><button type="button" className="my-map-secondary-button" onClick={() => { setStopFailed(false); setStop(true) }}>공유 중단</button></>}
        </>}
    </div>
    <ShareDialog open={open} sourceDocument={document} myMap={myMap} onClose={() => setOpen(false)} />
    <Dialog open={stop} onOpenChange={(_, data) => { if (!stopping) setStop(data.open) }}><DialogSurface><DialogBody><DialogTitle>기관 공유를 중단할까요?</DialogTitle><DialogContent><p>{document.name} · {documentItemCount(document)}개 항목</p><p>기관 구성원이 이 공유본을 다시 열 수 없게 됩니다. 개인 원본과 이미 만든 개인 사본은 남아 있습니다.</p>{stopFailed && <p className="my-map-error" role="alert">{myMap.error || '공유를 중단하지 못했습니다. 다시 시도하세요.'}</p>}</DialogContent><DialogActions><Button disabled={stopping} onClick={() => setStop(false)}>취소</Button><Button appearance="primary" disabled={stopping} onClick={async () => { setStopping(true); setStopFailed(false); try { if (await myMap.stopSharingMap(document.id)) setStop(false); else setStopFailed(true) } finally { setStopping(false) } }}>공유 중단</Button></DialogActions></DialogBody></DialogSurface></Dialog>
  </div>
}
