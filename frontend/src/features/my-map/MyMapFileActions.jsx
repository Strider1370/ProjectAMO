import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Download, FilePlus2, MoreHorizontal, Trash2 } from 'lucide-react'
import MapConversionDialog, { PreviewSummary } from './MapConversionDialog.jsx'
import { previewMapConversion } from './lib/mapKmlCodec.js'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger } from '../../shared/ui/fluent.js'

// 내보내기·편집본 변환은 완료 자료만 사용한다. 미완성 초안은 포함하지 않는다.
const KML_MIME = 'application/vnd.google-earth.kml+xml'

function DuplicateDialog({ open, source, onClose, onDuplicate }) {
  const [name, setName] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (open) { setName((source?.name ?? '지도').slice(0, 197) + ' 사본'); setError('') } }, [open, source?.id, source?.name])
  const duplicate = async () => {
    if (pending) return
    setPending(true); setError('')
    try { if (await onDuplicate(name.trim())) onClose(); else setError('지도를 복제하지 못했습니다. 알림을 확인하세요.') }
    catch (failure) { setError(failure.message) }
    finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={(_, data) => { if (!data.open && !pending) onClose() }}><DialogSurface><DialogBody>
    <DialogTitle>지도 복제</DialogTitle><DialogContent>
      <p>숨긴 항목을 포함해 {source?.items?.length ?? 0}개 항목을 새 개인 지도로 복사합니다. 원본 지도는 그대로 유지됩니다.</p>
      <label className="my-map-editor-field"><span>사본 이름</span><input autoFocus maxLength={200} disabled={pending} value={name} onChange={(event) => setName(event.target.value)} /></label>
      {error && <p className="my-map-error" role="alert">{error}</p>}
    </DialogContent><DialogActions><Button appearance="secondary" disabled={pending} onClick={onClose}>취소</Button><Button appearance="primary" disabled={pending || !name.trim()} onClick={duplicate}>{pending ? '복제 중…' : '복제하기'}</Button></DialogActions>
  </DialogBody></DialogSurface></Dialog>
}

function ExportDialog({ open, document: source, preview, selectedId, onClose, onExport }) {
  const [scope, setScope] = useState({ mode: 'all', groupId: null })
  useEffect(() => { if (open) setScope({ mode: 'all', groupId: null }) }, [open])
  const groups = preview?.groups ?? []
  const scopePreview = useMemo(() => {
    if (!open || !source || source.loaded === false) return null
    if (scope.mode === 'group' && !source.groups.some((group) => group.id === scope.groupId)) return null
    const range = scope.mode === 'group' ? { groupId: scope.groupId } : scope.mode === 'item' ? { itemIds: selectedId ? [selectedId] : [] } : {}
    return previewMapConversion(source, range)
  }, [open, source, scope, selectedId])
  const count = scopePreview?.itemCount ?? 0
  const selectedName = source?.items?.find((item) => item.id === selectedId)?.name
  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>KML로 내보내기</DialogTitle>
          <DialogContent>
            <fieldset className="my-map-preview-scope">
              <legend>내보낼 범위</legend>
              <label><input type="radio" name="my-map-export-scope" checked={scope.mode === 'all'} onChange={() => setScope({ mode: 'all', groupId: null })} /> 지도 전체</label>
              <label><input type="radio" name="my-map-export-scope" disabled={!groups.length} checked={scope.mode === 'group'} onChange={() => setScope({ mode: 'group', groupId: groups[0]?.id ?? null })} /> 선택한 폴더</label>
              {scope.mode === 'group' && (
                <select aria-label="내보낼 폴더" value={scope.groupId ?? ''} onChange={(event) => setScope({ mode: 'group', groupId: event.target.value })}>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.path.join(' / ')}</option>)}
                </select>
              )}
              <label><input type="radio" name="my-map-export-scope" disabled={!selectedId} checked={scope.mode === 'item'} onChange={() => setScope({ mode: 'item', groupId: null })} /> 선택한 항목{selectedName ? ` · ${selectedName}` : ''}</label>
            </fieldset>
            <p className="my-map-preview-note">숨긴 항목도 범위에 들어가면 함께 내보냅니다. 작성 중인 미완성 도형은 포함하지 않습니다.</p>
            <PreviewSummary preview={scopePreview} />
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>취소</Button>
            <Button appearance="primary" disabled={!count} onClick={() => { onExport(scope); onClose() }}>내보내기</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default function MyMapFileActions({ myMap, document: source, onRemove }) {
  const [dialog, setDialog] = useState(null)
  const [preview, setPreview] = useState(null)
  const canConvert = source?.kind === 'imported' && typeof myMap.convertDocument === 'function'
  const canDuplicate = source?.kind === 'personal' && typeof myMap.duplicateDocument === 'function'
  const canExport = typeof myMap.exportDocument === 'function'

  const openDialog = useCallback(async (next) => {
    setPreview(null); setDialog(next)
    if (typeof myMap.previewConversion !== 'function') return
    const result = await myMap.previewConversion(source.id)
    setPreview(result ?? null)
  }, [myMap, source?.id])

  const runExport = useCallback(async (scope) => {
    const range = scope.mode === 'group' ? { groupId: scope.groupId } : scope.mode === 'item' ? { itemIds: [myMap.selectedId] } : {}
    const result = await myMap.exportDocument(source.id, range)
    if (!result) return
    const url = URL.createObjectURL(new Blob([result.kml], { type: KML_MIME }))
    const anchor = globalThis.document.createElement('a')
    anchor.href = url
    anchor.download = result.fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }, [myMap, source?.id])

  const items = useMemo(() => [
    canDuplicate && { key: 'duplicate', icon: <Copy size={16} />, label: '지도 복제', run: () => setDialog('duplicate') },
    canConvert && { key: 'convert', icon: <FilePlus2 size={16} />, label: '편집본으로 가져오기', run: () => openDialog('convert') },
    canExport && { key: 'export', icon: <Download size={16} />, label: 'KML로 내보내기', run: () => openDialog('export') },
    onRemove && { key: 'remove', icon: <Trash2 size={16} />, label: '지도 삭제', run: onRemove },
  ].filter(Boolean), [canDuplicate, canConvert, canExport, openDialog, onRemove])
  if (!items.length) return null

  return (
    <>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <MenuButton appearance="transparent" size="small" icon={<MoreHorizontal size={18} />} aria-label="지도 파일 메뉴" data-testid="my-map-file-menu" />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>{items.map((item) => <MenuItem key={item.key} icon={item.icon} onClick={item.run}>{item.label}</MenuItem>)}</MenuList>
        </MenuPopover>
      </Menu>
      <MapConversionDialog open={dialog === 'convert'} source={source} preview={preview} onClose={() => setDialog(null)} onConvert={(name) => myMap.convertDocument(source.id, { name })} />
      <DuplicateDialog open={dialog === 'duplicate'} source={source} onClose={() => setDialog(null)} onDuplicate={(name) => myMap.duplicateDocument(source.id, { name })} />
      <ExportDialog open={dialog === 'export'} document={source} preview={preview} selectedId={myMap.selectedId} onClose={() => setDialog(null)} onExport={runExport} />
    </>
  )
}
