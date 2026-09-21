import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, Crosshair, Eye, EyeOff,
  ArrowLeft, Folder, LoaderCircle, Plus, X,
} from 'lucide-react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from '../../shared/ui/fluent.js'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import MyMapDetail from './MyMapDetail.jsx'
import MyMapFileActions from './MyMapFileActions.jsx'
import MapConversionDialog from './MapConversionDialog.jsx'
import MyMapEditor, { DocumentNameField } from './MyMapEditor.jsx'
import MyMapStorageStatus from './MyMapStorageStatus.jsx'
import MyMapLibrary from './MyMapLibrary.jsx'
import MyMapImportPanel from './MyMapImportPanel.jsx'
import {
  buildMapPanelTree, documentGroupCount, documentItemCount, documentScopedId,
  filterMapPanelTree, flattenMapPanelRows, selectedItemReveal,
} from './lib/mapPanelRows.js'
import './MyMapPanel.css'

const ITEMS_PER_PAGE = 120

function sourceLabel(document) {
  if (document.kind === 'personal') return '개인 지도'
  if (document.kind === 'organization') return '기관 지도'
  return '가져온 지도'
}

function mapItemIcon(kind) {
  return kind === 'point' ? '●' : kind === 'line' ? '━' : kind === 'polygon' ? '⬠' : kind === 'circle' ? '○' : '◇'
}

function groupVisible(document, groupId, hiddenGroups) {
  const byId = new Map((document.groups ?? []).map((group) => [group.id, group]))
  const seen = new Set()
  let currentId = groupId
  while (currentId && !seen.has(currentId)) {
    if (hiddenGroups?.has?.(documentScopedId(document.id, currentId))) return false
    seen.add(currentId)
    currentId = byId.get(currentId)?.parentId ?? null
  }
  return true
}

function selectedItem(document, selectedId) {
  return document?.items?.find((item) => item.id === selectedId) ?? null
}

function RemoveDocumentDialog({ document, onClose, onConfirm }) {
  const imported = document?.kind === 'imported'
  return (
    <Dialog open={Boolean(document)} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{imported ? '원본 파일을 삭제할까요?' : '지도를 삭제할까요?'}</DialogTitle>
          <DialogContent>
            <p><strong>{document?.name}</strong> · {documentItemCount(document ?? {}).toLocaleString()}개 항목</p>
            <p>{imported ? '이 파일의 지도 표시와 원본 항목을 모두 제거합니다.' : '삭제한 지도는 되돌릴 수 없습니다.'}</p>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>취소</Button>
            <Button appearance="primary" onClick={() => { if (document) onConfirm(document.id); onClose() }}>삭제</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

function Viewer({ document, myMap, onConvert }) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())
  const [revealed, setRevealed] = useState({})
  const selectedRowRef = useRef(null)
  const tree = useMemo(() => buildMapPanelTree(document), [document])
  const rows = useMemo(() => flattenMapPanelRows(filterMapPanelTree(tree, query), {
    expanded, query, revealed, itemLimit: ITEMS_PER_PAGE,
  }), [tree, query, expanded, revealed])
  const selected = selectedItem(document, myMap.selectedId)
  const allVisible = (document.items ?? []).every((item) => (
    groupVisible(document, item.groupId, myMap.hiddenGroups)
    && !myMap.hiddenItems?.has?.(documentScopedId(document.id, item.id))
  ))

  useEffect(() => {
    if (!selected) return
    const reveal = selectedItemReveal(document, selected.id, ITEMS_PER_PAGE)
    if (!reveal) return
    setQuery('')
    setExpanded((previous) => new Set([...previous, ...reveal.expanded]))
    setRevealed((previous) => ({ ...previous, [reveal.parentId]: Math.max(previous[reveal.parentId] ?? 0, reveal.revealed) }))
  }, [document, selected])

  // Native scrollIntoView can also move the map wrapper or page. Selection should
  // only reveal its row inside this panel's own scroller.
  useEffect(() => {
    const row = selectedRowRef.current
    // The tree has its own scroll region.  Scrolling the drawer body here hid
    // the search and list above the detail when a map selection arrived.
    const scroller = row?.closest('.my-map-viewer-list')
    if (!row || !scroller) return
    const rowBox = row.getBoundingClientRect()
    const scrollBox = scroller.getBoundingClientRect()
    if (rowBox.top < scrollBox.top) scroller.scrollTop += rowBox.top - scrollBox.top
    else if (rowBox.bottom > scrollBox.bottom) scroller.scrollTop += rowBox.bottom - scrollBox.bottom
  }, [myMap.selectedId, rows])

  const toggleExpanded = (id) => setExpanded((previous) => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const showMore = (parentId) => setRevealed((previous) => ({ ...previous, [parentId]: (previous[parentId] ?? ITEMS_PER_PAGE) + ITEMS_PER_PAGE }))

  return (
    <div className="my-map-viewer">
      <div className="my-map-viewer-list">
        {document.source?.warnings?.length > 0 && <p className="my-map-source-warning" role="status">원본 파일 일부를 읽지 못했습니다. 표시 가능한 항목만 안전하게 보여 줍니다.</p>}
        <div className="my-map-view-actions">
          <div className="my-map-view-action-group">
            <button type="button" className="my-map-secondary-button" onClick={() => myMap.setAllVisible?.(!allVisible)}>{allVisible ? '전체 숨기기' : '전체 표시'}</button>
            {document.kind === 'personal' && typeof myMap.startEditing === 'function' && <button type="button" className="my-map-primary-button" onClick={() => myMap.startEditing()}><Plus size={16} aria-hidden="true" /> 지도 편집</button>}
          </div>
          <button type="button" className="my-map-icon-button" aria-label="지도 전체 위치로 이동" onClick={() => myMap.fitDocument?.()}><Crosshair size={18} /></button>
        </div>
        {document.kind === 'imported' && <button type="button" className="my-map-primary-button my-map-convert-button" onClick={onConvert}>사본 만들어 편집</button>}
        <label className="my-map-search" htmlFor="my-map-search-input">
          <span className="sr-only">항목과 폴더 검색</span>
          <input id="my-map-search-input" data-testid="my-map-search" type="search" placeholder="항목 또는 폴더 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <ul className="my-map-tree" data-testid="my-map-tree" aria-label="지도 폴더와 항목">
          {rows.map((row) => {
          if (row.type === 'more') return (
            <li key={`more-${row.parentId}`} className="my-map-more-row" style={{ '--tree-depth': row.depth }}>
              <button type="button" className="my-map-secondary-button" onClick={() => showMore(row.parentId)}>더 보기 · {row.remaining.toLocaleString()}개 남음</button>
            </li>
          )
          if (row.type === 'group' || row.type === 'ungrouped') {
            const group = row.node.group
            const visible = row.type === 'ungrouped' || groupVisible(document, group.id, myMap.hiddenGroups)
            const hasChildren = row.node.children.length > 0 || row.node.items.length > 0
            return (
              <li key={`group-${row.id}`} className={`my-map-tree-row my-map-group-row${visible ? '' : ' is-hidden'}`} style={{ '--tree-depth': row.depth }}>
                <button type="button" className="my-map-tree-caret" disabled={!hasChildren} aria-label={row.open ? '폴더 접기' : '폴더 펼치기'} aria-expanded={hasChildren ? row.open : undefined} onClick={() => toggleExpanded(row.id)}>
                  {hasChildren && (row.open ? <ChevronDown size={17} /> : <ChevronRight size={17} />)}
                </button>
                <button type="button" className="my-map-tree-name" onClick={() => hasChildren && toggleExpanded(row.id)}>
                  <Folder size={16} aria-hidden="true" /><span>{group?.name || '그룹 없는 항목'}</span><small>{row.node.itemCount.toLocaleString()}</small>
                </button>
                {group && <button type="button" className="my-map-icon-button" aria-label={`${group.name} ${visible ? '숨기기' : '표시하기'}`} aria-pressed={visible} onClick={() => myMap.toggleGroup?.(group.id)}>{visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>}
                {group && <button type="button" className="my-map-icon-button my-map-fit-button" aria-label={`${group.name} 위치로 이동`} onClick={() => myMap.fitGroup?.(group.id)}><Crosshair size={16} /></button>}
              </li>
            )
          }
          const item = row.item
          const visible = groupVisible(document, item.groupId, myMap.hiddenGroups) && !myMap.hiddenItems?.has?.(documentScopedId(document.id, item.id))
          const itemIsSelected = myMap.selectedId === item.id
          return (
            <li ref={itemIsSelected ? selectedRowRef : null} key={`item-${item.id}`} className={`my-map-tree-row my-map-item-row${itemIsSelected ? ' is-selected' : ''}${visible ? '' : ' is-hidden'}`} style={{ '--tree-depth': row.depth }}>
              <button type="button" className="my-map-tree-name" aria-pressed={itemIsSelected} onClick={() => myMap.selectItem?.(item.id)}>
                <span className="my-map-item-kind" aria-hidden="true">{mapItemIcon(item.kind)}</span><span>{item.name || '이름 없는 항목'}</span>
              </button>
              <button type="button" className="my-map-icon-button" aria-label={`${item.name} ${visible ? '숨기기' : '표시하기'}`} aria-pressed={visible} onClick={() => myMap.toggleItem?.(item.id)}>{visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>
            </li>
          )
          })}
        </ul>
        {!rows.length && <p className="my-map-empty">검색 결과가 없습니다.</p>}
      </div>
      <MyMapDetail item={selected} groupName={selected?.groupId ? document.groups?.find((group) => group.id === selected.groupId)?.name : '그룹 없는 항목'} onClose={() => myMap.clearSelection?.()} onEdit={document.kind === 'personal' && typeof myMap.startEditing === 'function' ? () => myMap.startEditing() : undefined}  />
    </div>
  )
}

export default function MyMapPanel({ myMap, onClose = () => {}, open = true }) {
  const isMobile = useIsMobile()
  const fileInputRef = useRef(null)
  const fileIntent = useRef('view'), importSequence = useRef(0)
  const [importPreview, setImportPreview] = useState(null)
  const [fileDrag, setFileDrag] = useState(false), [fileError, setFileError] = useState('')
  const [removeTarget, setRemoveTarget] = useState(null)
  const [fileScreen, setFileScreen] = useState(false), [prepared, setPrepared] = useState(null)
  const [inspecting, setInspecting] = useState(false), [opening, setOpening] = useState(false)
  const [showLegacy, setShowLegacy] = useState(false)
  const documents = (myMap.documents ?? []).filter((entry) => entry.kind !== 'organization')
  const document = documents.find((entry) => entry.id === myMap.currentId) ?? null
  const storageReady = myMap.storage?.ready !== false
  const library = myMap.mode === 'library' || !document
  const title = fileScreen ? '파일 불러오기' : library ? '내 지도' : document.name || '이름 없는 지도'
  const editing = !library && myMap.mode === 'edit'
  const titleContent = editing ? <DocumentNameField value={document.name} onRename={myMap.renameDocument} /> : title
  const subtitle = fileScreen || library || myMap.mode === 'edit' ? null : `${sourceLabel(document)} · ${documentGroupCount(document)}개 폴더 · ${documentItemCount(document).toLocaleString()}개 항목`
  const contentClass = `my-map-panel-content${!fileScreen && !library && myMap.mode === 'view' ? ' is-viewer' : ''}${myMap.mode === 'edit' ? ' is-editor' : ''}`
  useEffect(() => {
    importSequence.current += 1; setImportPreview(null); setFileDrag(false); setFileError(''); setFileScreen(false); setPrepared(null); setInspecting(false); setOpening(false); setShowLegacy(false)
    return () => { importSequence.current += 1 }
  }, [myMap.currentId, myMap.mode, myMap.accountScope, open])

  const closeImport = () => { importSequence.current += 1; setImportPreview(null) }
  const pickFile = (intent) => { if (storageReady) { fileIntent.current = intent; fileInputRef.current?.click() } }
  const takeFile = (file, intent = 'view') => {
    if (!file || !storageReady) return
    setFileError('')
    if (intent !== 'convert' && myMap.mode !== 'edit') {
      const sequence = ++importSequence.current
      setFileScreen(true); setPrepared(null); setInspecting(true)
      void myMap.inspectFile(file).then((result) => { if (sequence === importSequence.current) setPrepared(result) })
        .catch((failure) => { if (sequence === importSequence.current) setFileError(failure.message) })
        .finally(() => { if (sequence === importSequence.current) setInspecting(false) })
      return
    }
    const targetId = myMap.mode === 'edit' ? document.id : null
    const targetName = targetId ? document.name : null
    const prepare = async () => {
      const sequence = ++importSequence.current
      setImportPreview({ source: { name: file.name }, preview: null, targetId, targetName })
      const result = await myMap.prepareFileConversion?.(file)
      if (sequence !== importSequence.current) return
      setImportPreview(result ? { ...result, targetId, targetName } : null)
    }
    if (myMap.mode === 'edit' && myMap.requestNavigation) myMap.requestNavigation(prepare)
    else void prepare()
  }
  const fileDrop = {
    onDragOver: (event) => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); setFileDrag(true) } },
    onDragLeave: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFileDrag(false) },
    onDropCapture: (event) => {
      if (!event.dataTransfer.files.length) return
      event.preventDefault(); event.stopPropagation(); setFileDrag(false)
      if (event.dataTransfer.files.length !== 1) { setFileError('파일은 한 번에 하나씩 가져오세요.'); return }
      takeFile(event.dataTransfer.files[0])
    },
  }
  const resetFile = () => { importSequence.current += 1; setPrepared(null); setInspecting(false); setFileError('') }
  const openFileScreen = () => { resetFile(); setFileScreen(true); myMap.dismissMessages?.() }
  const backToLibrary = () => { resetFile(); setFileScreen(false); myMap.showLibrary?.() }
  const openPrepared = async () => {
    if (!prepared || opening) return
    const sequence = importSequence.current
    setOpening(true)
    try { await myMap.addFile(prepared.file, { prepared }) }
    finally { if (sequence === importSequence.current) setOpening(false) }
  }
  const convertCurrent = async () => {
    const sequence = ++importSequence.current
    setImportPreview({ source: document, preview: null })
    const preview = await myMap.previewConversion(document.id)
    if (sequence === importSequence.current) setImportPreview(preview ? { source: document, preview } : null)
  }
  const hasLegacy = myMap.drawSpike?.pending > 0 || (myMap.storage?.guestMaps?.length ?? 0) > 0
  const headerActions = editing ? <button type="button" className="my-map-primary-button" onClick={() => myMap.finishEditing()}>편집 마침</button> : !fileScreen && !library && (
    <>
      <button type="button" className="my-map-header-button" onClick={() => myMap.showLibrary?.()}>목록</button>
      <MyMapFileActions myMap={myMap} document={document} onRemove={() => setRemoveTarget(document)} />
    </>
  )
  const body = (
    <>
      <input ref={fileInputRef} data-testid="my-map-file" type="file" accept=".kml,.kmz" className="my-map-file-input" onChange={(event) => { const file = event.target.files?.[0], intent = fileIntent.current; fileIntent.current = 'view'; event.target.value = ''; takeFile(file, intent) }} />
      {fileDrag && <p className="my-map-notice" role="status">KML/KMZ 파일을 놓아 {myMap.mode === 'edit' ? '현재 지도에 추가' : '열기'}</p>}
      {fileError && <p className="my-map-error" role="alert">{fileError}</p>}
      <MyMapStorageStatus showGuestMaps={showLegacy} storage={myMap.storage} documentId={document?.id} onRetry={myMap.retrySave} onCopyConflict={myMap.copyConflict} onOpenServerVersion={myMap.openServerVersion} onRestoreDraft={myMap.restoreDraft} onDiscardDraft={myMap.discardRecoveredDraft} onImportGuest={myMap.importGuestMap} />
      {myMap.busy && <p className="my-map-status" role="status"><LoaderCircle size={16} className="my-map-spin" aria-hidden="true" />{myMap.busy}</p>}
      {myMap.error && <p className="my-map-error" role="alert">{myMap.error}<button type="button" className="my-map-message-close" aria-label="오류 알림 닫기" onClick={() => myMap.dismissMessages?.()}><X size={15} /></button></p>}
      {myMap.notice && <p className="my-map-notice" role="status">{myMap.notice}<button type="button" className="my-map-message-close" aria-label="안내 닫기" onClick={() => myMap.dismissMessages?.()}><X size={15} /></button></p>}
      {showLegacy && library && myMap.drawSpike?.pending > 0 && <div className="my-map-migrate-notice" data-testid="my-map-draw-migrate"><p>기존 그리기 자료 {myMap.drawSpike.pending}개를 사본으로 가져옵니다. 원본은 유지됩니다.</p><button type="button" className="my-map-secondary-button" disabled={!storageReady} onClick={() => myMap.importDrawSpike()}>그리기 자료 가져오기</button></div>}
      {fileScreen ? <MyMapImportPanel prepared={prepared} loading={inspecting} opening={opening} ready={storageReady} onPick={() => pickFile('view')} onOpen={openPrepared} onReset={resetFile} /> : library ? <MyMapLibrary documents={documents} myMap={myMap} ready={storageReady} onImport={openFileScreen} onCreate={() => myMap.createDocument('이름 없는 지도')} /> : myMap.mode === 'edit' ? <MyMapEditor myMap={myMap} document={document} onImport={() => pickFile('convert')} /> : <Viewer document={document} myMap={myMap} onConvert={convertCurrent} />}
    </>
  )
  const closePanel = () => {
    if (myMap.mode !== 'edit') { onClose(); return }
    const leave = () => { myMap.finishEditing?.(); onClose() }
    if (typeof myMap.requestNavigation === 'function') myMap.requestNavigation(leave)
    else leave()
  }

  return (
    <>
      {open && (isMobile ? (
        <MobileSheet open eyebrow="내 지도" title={editing ? '내 지도 편집' : title} titleExtra={editing ? titleContent : subtitle && <span className="my-map-mobile-subtitle">{subtitle}</span>} onClose={closePanel} headerExtra={<>{fileScreen && <button type="button" className="my-map-header-button" onClick={backToLibrary}>내 지도</button>}{!fileScreen && library && hasLegacy && <button type="button" className="my-map-header-button" aria-expanded={showLegacy} onClick={() => setShowLegacy(!showLegacy)}>이전 자료</button>}{headerActions}</>}>
          <div className={contentClass} {...fileDrop}>{body}</div>
        </MobileSheet>
      ) : (
        <aside className="dev-layer-panel layer-drawer my-map-panel" aria-label="내 지도" {...fileDrop}>
          <header className="my-map-panel-header">
            <div className="my-map-header-title">{fileScreen && <button type="button" className="my-map-back" onClick={backToLibrary}><ArrowLeft size={15} aria-hidden="true" />내 지도</button>}{!library && !fileScreen && <div className="layer-drawer-eyebrow">내 지도</div>}{editing ? titleContent : <h1>{title}</h1>}{subtitle && <p>{subtitle}</p>}</div>
            <div className="my-map-header-actions">{!fileScreen && library && hasLegacy && <button type="button" className="my-map-header-button" aria-expanded={showLegacy} onClick={() => setShowLegacy(!showLegacy)}>이전 자료</button>}{headerActions}<button type="button" className="my-map-icon-button" aria-label="내 지도 닫기" onClick={closePanel}><X size={18} /></button></div>
          </header>
          <div className={`layer-drawer-body ${contentClass}`}>{body}</div>
        </aside>
      ))}
      <RemoveDocumentDialog document={removeTarget} onClose={() => setRemoveTarget(null)} onConfirm={(id) => myMap.removeDocument?.(id)} />
      <MapConversionDialog open={Boolean(open && importPreview)} source={importPreview?.source} preview={importPreview?.preview} targetName={importPreview?.targetName} onClose={closeImport} onConvert={(name) => myMap.convertDocument(importPreview.source.id, { name, targetId: importPreview.targetId, edit: true })} />

      <Dialog open={Boolean(myMap.editor?.exitPending)}><DialogSurface><DialogBody><DialogTitle>진행 중인 작업이 있습니다</DialogTitle><DialogContent><p>그냥 나가면 현재 미완성 도형이나 적용 전 형태 수정은 버려집니다. 이미 완료한 항목은 남습니다.</p></DialogContent><DialogActions><Button appearance="primary" onClick={() => myMap.continueEditing?.()}>계속 그리기</Button><Button appearance="secondary" onClick={() => myMap.discardAndExit?.()}>그냥 나가기</Button></DialogActions></DialogBody></DialogSurface></Dialog>
    </>
  )
}
