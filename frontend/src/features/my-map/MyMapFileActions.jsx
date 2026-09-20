import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FilePlus2, MoreHorizontal } from 'lucide-react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger } from '../../shared/ui/fluent.js'

// 내보내기·편집본 변환은 완료 자료만 사용한다. 미완성 초안은 포함하지 않는다.
const KML_MIME = 'application/vnd.google-earth.kml+xml'

function groupSubtree(document, groupId) {
  const ids = new Set([groupId])
  let size
  do {
    size = ids.size
    for (const group of document.groups ?? []) if (ids.has(group.parentId)) ids.add(group.id)
  } while (ids.size !== size)
  return ids
}

function scopeItemCount(document, scope, selectedId) {
  if (scope.mode === 'group') return scope.groupId ? (document.items ?? []).filter((item) => groupSubtree(document, scope.groupId).has(item.groupId)).length : 0
  if (scope.mode === 'item') return selectedId ? 1 : 0
  return (document.items ?? []).length
}

function PreviewSummary({ preview, scopeCount }) {
  if (!preview) return <p className="my-map-empty" role="status">내용을 확인하는 중입니다…</p>
  return (
    <>
      <ul className="my-map-preview-counts">
        <li><strong>{(scopeCount ?? preview.itemCount).toLocaleString()}</strong><span>대상 항목</span></li>
        <li><strong>{preview.includedCount.toLocaleString()}</strong><span>그대로 포함</span></li>
        <li><strong>{preview.convertedCount.toLocaleString()}</strong><span>형식 변환</span></li>
        <li><strong>{preview.excludedCount.toLocaleString()}</strong><span>제외</span></li>
      </ul>
      {preview.warnings.length > 0 && (
        <ul className="my-map-preview-warnings" aria-label="변환 주의 사항">
          {preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
        </ul>
      )}
    </>
  )
}

function ConvertDialog({ open, document: source, preview, onClose, onConvert }) {
  const [name, setName] = useState('')
  useEffect(() => { if (open) setName(`${source?.name ?? '가져온 지도'} 편집본`) }, [open, source?.name])
  const paths = preview?.groups?.filter((group) => group.path.length > 1) ?? []
  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>편집본으로 가져오기</DialogTitle>
          <DialogContent>
            <p>가져온 원본은 그대로 남고, 편집할 수 있는 개인 지도 사본을 새로 만듭니다.</p>
            <label className="my-map-editor-field"><span>편집본 이름</span>
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <PreviewSummary preview={preview} />
            {paths.length > 0 && (
              <details className="my-map-metadata-disclosure">
                <summary>중첩 폴더 {paths.length.toLocaleString()}개는 한 단계 그룹으로 펼칩니다</summary>
                <ul className="my-map-preview-paths">{paths.slice(0, 20).map((group) => <li key={group.id}>{group.path.join(' / ')}</li>)}</ul>
                {paths.length > 20 && <p className="my-map-empty">외 {(paths.length - 20).toLocaleString()}개</p>}
              </details>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>취소</Button>
            <Button appearance="primary" disabled={!name.trim()} onClick={() => { onConvert(name.trim()); onClose() }}>편집본 만들기</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

function ExportDialog({ open, document: source, preview, selectedId, onClose, onExport }) {
  const [scope, setScope] = useState({ mode: 'all', groupId: null })
  useEffect(() => { if (open) setScope({ mode: 'all', groupId: null }) }, [open])
  const groups = preview?.groups ?? []
  const count = scopeItemCount(source, scope, selectedId)
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
            <PreviewSummary preview={preview} scopeCount={count} />
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

export default function MyMapFileActions({ myMap, document: source }) {
  const [dialog, setDialog] = useState(null)
  const [preview, setPreview] = useState(null)
  const canConvert = source?.kind === 'imported' && typeof myMap.convertDocument === 'function'
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
    canConvert && { key: 'convert', icon: <FilePlus2 size={16} />, label: '편집본으로 가져오기', run: () => openDialog('convert') },
    canExport && { key: 'export', icon: <Download size={16} />, label: 'KML로 내보내기', run: () => openDialog('export') },
  ].filter(Boolean), [canConvert, canExport, openDialog])
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
      <ConvertDialog open={dialog === 'convert'} document={source} preview={preview} onClose={() => setDialog(null)} onConvert={(name) => myMap.convertDocument(source.id, { name })} />
      <ExportDialog open={dialog === 'export'} document={source} preview={preview} selectedId={myMap.selectedId} onClose={() => setDialog(null)} onExport={runExport} />
    </>
  )
}
