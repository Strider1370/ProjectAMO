import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from '../../shared/ui/fluent.js'

export function PreviewSummary({ preview }) {
  if (!preview) return <p className="my-map-empty" role="status">내용을 확인하는 중입니다…</p>
  return <>
    <ul className="my-map-preview-counts">
      <li><strong>{preview.itemCount.toLocaleString()}</strong><span>대상 항목</span></li>
      <li><strong>{preview.includedCount.toLocaleString()}</strong><span>그대로 포함</span></li>
      <li><strong>{preview.convertedCount.toLocaleString()}</strong><span>형식 변환</span></li>
      <li><strong>{preview.excludedCount.toLocaleString()}</strong><span>제외</span></li>
    </ul>
    {preview.excludedCount > 0 && <p className="my-map-preview-note">제외는 지도에 그릴 수 없는 항목 수입니다. 원본 파일과 읽어낸 설명·속성은 보존합니다.</p>}
    {preview.warnings.length > 0 && <ul className="my-map-preview-warnings" aria-label="변환 주의 사항">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
  </>
}

export default function MapConversionDialog({ open, source, preview, targetName = null, onClose, onConvert }) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName((source?.name ?? '가져온 지도').slice(0, 196) + ' 편집본')
      setError('')
    }
    wasOpen.current = open
  }, [open, source?.name])
  const paths = preview?.groups?.filter((group) => group.path.length > 1) ?? []
  const convert = async () => {
    if (pending || !preview) return
    setPending(true); setError('')
    try {
      const result = await onConvert(name.trim())
      if (result) onClose()
      else setError('편집본을 만들지 못했습니다. 알림을 확인한 뒤 다시 시도하세요.')
    } catch (failure) { setError(failure.message) }
    finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !pending) onClose() }}>
    <DialogSurface><DialogBody>
      <DialogTitle>편집본으로 가져오기</DialogTitle>
      <DialogContent>
        {targetName != null ? <>
          <p><strong>{targetName}</strong>에 자료를 추가합니다. 기존 항목과 원본 파일은 그대로 남습니다.</p>
          <p className="my-map-preview-note">폴더는 새 그룹으로 추가하고, 폴더 없는 항목은 기존 ‘그룹 없는 항목’의 끝에 넣습니다. 추가한 자료는 한 번에 되돌릴 수 있습니다.</p>
        </> : <>
          <p>가져온 원본은 그대로 남고, 편집할 수 있는 개인 지도 사본을 새로 만듭니다.</p>
          <label className="my-map-editor-field"><span>편집본 이름</span><input autoFocus maxLength={200} value={name} disabled={pending} onChange={(event) => setName(event.target.value)} /></label>
        </>}
        <PreviewSummary preview={preview} />
        {paths.length > 0 && <details className="my-map-metadata-disclosure">
          <summary>중첩 폴더 {paths.length.toLocaleString()}개는 한 단계 그룹으로 펼칩니다</summary>
          <ul className="my-map-preview-paths">{paths.slice(0, 20).map((group) => <li key={group.id}>{group.path.join(' / ')}</li>)}</ul>
          {paths.length > 20 && <p className="my-map-empty">외 {(paths.length - 20).toLocaleString()}개</p>}
        </details>}
        {error && <p className="my-map-error" role="alert">{error}</p>}
      </DialogContent>
      <DialogActions><Button appearance="secondary" disabled={pending} onClick={onClose}>취소</Button><Button appearance="primary" disabled={pending || !preview || targetName == null && !name.trim()} onClick={convert}>{pending ? '처리 중…' : targetName != null ? '현재 지도에 추가' : '편집본 만들기'}</Button></DialogActions>
    </DialogBody></DialogSurface>
  </Dialog>
}
