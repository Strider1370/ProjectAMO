import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchBox } from '../../shared/ui/fluent.js'
import { matchSearch } from '../map/layerActions.js'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import './SearchPalette.css'

// 결과 타입 꼬리표(중립색) — 동음("위성") 구분 + 무엇을 하는지 표시.
const TYPE_TAG = {
  airport: '공항', panel: '바로가기', met: '기상', aviation: '항공', basemap: '베이스맵',
}

// 공항 + 기능 통합 검색 팔레트. catalog=buildSearchCatalog(airports), onRun=App의 라우터.
export default function SearchPalette({ open, onClose, catalog, onRun }) {
  useCloseOnBackButton(open, onClose)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const results = useMemo(() => matchSearch(catalog, query), [catalog, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    restoreFocusRef.current = document.activeElement // 닫을 때 포커스 복귀(접근성)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      clearTimeout(t)
      restoreFocusRef.current?.focus?.()
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  if (!open) return null

  function run(entry) { if (entry) { onRun(entry); onClose() } }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    // 포커스 트랩: 모달 밖으로 새지 않게 입력에 고정(목록은 ↑↓로 이동).
    else if (e.key === 'Tab') { e.preventDefault(); inputRef.current?.focus() }
  }

  return (
    <div className="search-palette-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="검색"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="search-palette-head">
          <SearchBox
            ref={inputRef}
            appearance="filled-lighter"
            size="large"
            placeholder="공항·기능 검색 (예: 레이더, 인천, 단색)"
            value={query}
            onChange={(_, d) => setQuery(d.value)}
          />
        </div>
        {query && (
          <ul className="search-palette-results" role="listbox" aria-label="검색 결과">
            {results.length === 0 && <li className="search-palette-empty">결과 없음</li>}
            {results.map((entry, i) => (
              <li key={`${entry.type}:${entry.id}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`search-palette-row${i === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(entry)}
                >
                  <span className="search-palette-label">{entry.label}</span>
                  <span className="search-palette-type">{TYPE_TAG[entry.type]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
