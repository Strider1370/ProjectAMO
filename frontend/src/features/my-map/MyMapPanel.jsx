import { useMemo, useState } from 'react'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { visibleRows, hasChildren, toggleExpanded } from './lib/folderView.js'
import './MyMapPanel.css'

const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function MyMapPanel({ myMap, onClose }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const [query, setQuery] = useState('')

  const { files, activeFileIds, layersByFile, hidden, busy, error } = myMap

  // 켜진 파일들의 폴더를 파일 순서대로 이어 붙인다.
  const rows = useMemo(() => {
    const out = []
    for (const file of files) {
      if (!activeFileIds.has(file.id)) continue
      const list = layersByFile.get(file.id)
      if (!list) continue
      out.push({ kind: 'file', file, list })
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
        <p className="my-map-intro">
          구글어스에서 직접 만든 지도를 불러와 우리 지도 위에 겹쳐 봅니다.
          훈련공역, 절차, 즐겨찾는 지점 같은 직접 그린 요소를 그대로 볼 수 있습니다.
        </p>
        <p className="my-map-hint">비행경로를 불러오려면 ‘비행 전 브리핑’을 쓰세요.</p>

        <input
          data-testid="my-map-file"
          type="file"
          accept=".kml,.kmz"
          className="my-map-file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; myMap.addFile(f) }}
        />

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
                    <span className="my-map-count">{layer.features.length > 0 ? layer.features.length.toLocaleString() : ''}</span>
                    {layer.features.length > 0 && (
                      <button type="button" className="my-map-goto" onClick={() => myMap.flyToFolder(layer.id)}>여기로</button>
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
