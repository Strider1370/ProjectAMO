import { CheckCircle2, CloudOff, FileClock, RefreshCw, Server, TriangleAlert } from 'lucide-react'

function messageFor(state, account) {
  switch (state) {
    case 'localOnly': return '이 기기에 저장됨'
    case 'dirty': return account ? '계정에 저장할 변경사항이 있습니다.' : '이 기기에 저장 중입니다.'
    case 'saving': return '계정에 저장 중입니다.'
    case 'synced': return '계정에 저장됨'
    case 'offline': return '오프라인입니다. 연결되면 계정에 저장합니다.'
    case 'local': return account ? '저장 상태를 확인하고 있습니다.' : '이 기기에 보관 중입니다.'
    default: return null
  }
}

function StorageAction({ children, onClick, primary = false }) {
  return <button type="button" className={primary ? 'my-map-primary-button' : 'my-map-secondary-button'} onClick={onClick}>{children}</button>
}

export default function MyMapStorageStatus({ storage, documentId, onRetry, onCopyConflict, onOpenServerVersion, onRestoreDraft, onDiscardDraft, onImportGuest }) {
  if (!storage) return null
  const state = documentId ? storage.states?.[documentId] : null
  const draft = documentId ? storage.drafts?.[documentId] : null
  const stateMessage = messageFor(state?.state, storage.account)
  const errorMessage = state?.error?.message ?? storage.error
  const guestMaps = storage.account ? (storage.guestMaps ?? []) : []

  return <section className="my-map-storage" aria-label="지도 저장 상태">
    {!storage.ready && <p className="my-map-storage-row my-map-storage-pending" role="status"><FileClock size={15} aria-hidden="true" />내 지도 저장소를 준비하고 있습니다.</p>}
    {storage.error && <p className="my-map-storage-row my-map-storage-error" role="alert"><TriangleAlert size={15} aria-hidden="true" />{String(storage.error)}</p>}
    {state?.state === 'error' && <div className="my-map-storage-row my-map-storage-error" role="alert"><TriangleAlert size={15} aria-hidden="true" /><span>{errorMessage || '계정에 저장하지 못했습니다.'}</span><StorageAction onClick={() => onRetry?.(documentId)}><RefreshCw size={15} aria-hidden="true" />다시 시도</StorageAction></div>}
    {state?.state === 'conflict' && <div className="my-map-storage-row my-map-storage-conflict" role="alert"><TriangleAlert size={15} aria-hidden="true" /><span>다른 변경이 먼저 저장되었습니다. 자동으로 덮어쓰지 않았습니다.</span><div className="my-map-storage-actions"><StorageAction primary onClick={() => onCopyConflict?.(documentId)}>내 변경을 새 지도로 보관</StorageAction><StorageAction onClick={() => onOpenServerVersion?.(documentId)}><Server size={15} aria-hidden="true" />서버 버전 열기</StorageAction></div></div>}
    {state?.state === 'synced' && state.error && <p className="my-map-storage-row my-map-storage-error" role="alert"><TriangleAlert size={15} aria-hidden="true" />계정 저장은 완료했지만 기기 복구본을 보관하지 못했습니다. {String(state.error.message ?? state.error)}</p>}
    {stateMessage && state?.state !== 'error' && state?.state !== 'conflict' && <div className={`my-map-storage-row my-map-storage-${state.state}`} role="status">{state.state === 'synced' ? <CheckCircle2 size={15} aria-hidden="true" /> : state.state === 'offline' ? <CloudOff size={15} aria-hidden="true" /> : <FileClock size={15} aria-hidden="true" />}{stateMessage}{state.state === 'offline' && <StorageAction onClick={() => onRetry?.(documentId)}><RefreshCw size={15} aria-hidden="true" />다시 시도</StorageAction>}{Number.isSafeInteger(state.revision) && state.state === 'synced' && <small>버전 {state.revision}</small>}</div>}
    {draft && <div className="my-map-storage-row my-map-storage-draft" role="status"><FileClock size={15} aria-hidden="true" /><span>미완성 작업을 복구할 수 있습니다.</span><div className="my-map-storage-actions"><StorageAction primary onClick={() => onRestoreDraft?.(documentId)}>작업 재개</StorageAction><StorageAction onClick={() => onDiscardDraft?.(documentId)}>버리기</StorageAction></div></div>}
    {guestMaps.length > 0 && <div className="my-map-guest-maps"><p>로그인 전 이 기기에 만든 지도</p><ul>{guestMaps.map((map) => <li key={map.id}><span><strong>{map.name || '이름 없는 지도'}</strong><small>{Number(map.itemCount ?? 0).toLocaleString()}개 항목</small></span><StorageAction onClick={() => onImportGuest?.(map.id)}>가져오기</StorageAction></li>)}</ul></div>}
  </section>
}
