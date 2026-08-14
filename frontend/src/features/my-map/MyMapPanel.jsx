import { useMemo, useRef, useState } from 'react'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { visibleRows, hasChildren, toggleExpanded, totalFeatures } from './lib/folderView.js'
import './MyMapPanel.css'

const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function MyMapPanel({ myMap, onClose }) {
  const fileInputRef = useRef(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const { files, activeFileIds, layersByFile, hidden, busy, error } = myMap

  // 파일이 하나도 없으면 올리는 네모가 늘 열려 있다. 하나라도 생기면 접고
  // '파일 추가'로 다시 연다 — 목록이 주인공이 되어야 한다.
  const dropOpen = files.length === 0 || addOpen

  const openPicker = () => fileInputRef.current?.click()
  const takeFile = (file) => {
    if (!file) return
    setAddOpen(false)
    myMap.addFile(file)
  }

  // 켜진 파일들의 폴더를 파일 순서대로 이어 붙인다.
  const rows = useMemo(() => {
    const out = []
    const activeFiles = files.filter((f) => activeFileIds.has(f.id) && layersByFile.has(f.id))
    for (const file of activeFiles) {
      const list = layersByFile.get(file.id)
      // 파일 머리글은 여러 파일을 켰을 때만 — 하나뿐이면 위 목록과 겹친다.
      if (activeFiles.length > 1) out.push({ kind: 'file', file, list })
      for (const layer of visibleRows(list, { expanded, query })) {
        out.push({ kind: 'folder', file, list, layer })
      }
    }
    return out
  }, [files, activeFileIds, layersByFile, expanded, query])

  return (
    <div className="dev-layer-panel layer-drawer my-map-panel" aria-label="내 지도">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">내 지도</div>
          <div className="layer-drawer-title">내가 만든 지도</div>
        </div>
        <button type="button" className="layer-sheet-clear" onClick={onClose}>닫기</button>
      </div>

      <div className="layer-drawer-body">
        <input
          ref={fileInputRef}
          data-testid="my-map-file"
          type="file"
          accept=".kml,.kmz"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; takeFile(f) }}
        />

        {dropOpen && (
          <>
            {/* 설명은 처음 쓰는 사람에게만 필요하다. 파일이 생기면 목록에 자리를 내준다. */}
            {files.length === 0 && (
              <p className="my-map-intro">
                구글어스에서 직접 만든 지도를 불러와 우리 지도 위에 겹쳐 봅니다.
                훈련공역, 절차, 즐겨찾는 지점 같은 직접 그린 요소를 그대로 볼 수 있습니다.
              </p>
            )}
            <button
              type="button"
              data-testid="my-map-dropzone"
              className={`my-map-dropzone${dragOver ? ' is-drag-over' : ''}`}
              onClick={openPicker}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFile(e.dataTransfer.files?.[0]) }}
            >
              <span className="my-map-dropzone-text">
                {'KML · KMZ 파일을 여기에 끌어다 놓거나'}
                <br />
                {'눌러서 고르세요'}
              </span>
            </button>
            {files.length === 0 && (
              <p className="my-map-hint">비행경로를 불러오려면 ‘비행 전 브리핑’을 쓰세요.</p>
            )}
            {addOpen && (
              <button type="button" className="my-map-add-cancel" onClick={() => setAddOpen(false)}>취소</button>
            )}
          </>
        )}

        {!dropOpen && (
          <button type="button" data-testid="my-map-add" className="my-map-add" onClick={() => setAddOpen(true)}>
            {'+ 파일 추가'}
          </button>
        )}

        {busy && <p className="my-map-note">{busy}</p>}
        {error && <p className="my-map-error">{error}</p>}

        {files.length > 0 && (
          <ul className="my-map-files" data-testid="my-map-files">
            {files.map((f) => (
              <li key={f.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={activeFileIds.has(f.id)}
                    onChange={() => myMap.toggleFile(f.id)}
                  />
                  {' '}<span className="my-map-file-name">{f.name}</span>
                  <span className="my-map-file-size">{mb(f.size)}</span>
                </label>
                <button type="button" className="my-map-remove" aria-label={`${f.name} 지우기`}
                  onClick={() => myMap.removeFile(f.id)}>×</button>
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 && (
          <>
            <div className="my-map-search">
              <input
                data-testid="my-map-search"
                type="search"
                placeholder="폴더 이름으로 찾기"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="my-map-tree" data-testid="my-map-tree">
              {rows.map((row) => {
                if (row.kind === 'file') {
                  return <li key={`h-${row.file.id}`} className="my-map-tree-file">{row.file.name}</li>
                }
                const { layer, list, file } = row
                const effective = isLayerVisible(list, layer.id, hidden)
                const openable = hasChildren(list, layer.id)
                // 하위까지 합쳐 센다 — 직접 것만 세면 제일 큰 폴더가 비어 보인다.
                const count = totalFeatures(list, layer.id)
                return (
                  <li key={`${file.id}-${layer.id}`} style={{ paddingLeft: `${layer.depth * 14}px` }}>
                    <button
                      type="button"
                      className={`my-map-caret${openable ? '' : ' is-hidden'}`}
                      aria-label={expanded.has(layer.id) ? '접기' : '펼치기'}
                      onClick={() => setExpanded((prev) => toggleExpanded(prev, layer.id))}
                    >
                      {expanded.has(layer.id) ? '▾' : '▸'}
                    </button>
                    <label className={effective ? '' : 'my-map-off'}>
                      <input type="checkbox" checked={effective} onChange={() => myMap.toggleFolder(layer.id)} />
                      {' '}{layer.name}
                    </label>
                    <span className="my-map-count">{count > 0 ? count.toLocaleString() : ''}</span>
                    {count > 0 && (
                      <button
                        type="button"
                        className="my-map-goto"
                        aria-label={`${layer.name} 위치로 이동`}
                        title="이 폴더 위치로 이동"
                        onClick={() => myMap.flyToFolder(layer.id)}
                      >
                        ⤢
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
