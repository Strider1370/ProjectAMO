import { useState } from 'react'
import { ChevronRight, Eye, EyeOff, FileUp, MapPinned, Plus } from 'lucide-react'
import { documentItemCount } from './lib/mapPanelRows.js'

export default function MyMapLibrary({ documents, myMap, ready, onImport, onCreate }) {
  const [query, setQuery] = useState('')
  if (!documents.length) return <section className="my-map-start" aria-label="내 지도 시작">
    <p className="my-map-start-intro">비행에 필요한 지점과 경로를<br />나만의 지도에 모아 보세요.</p>
    <div className="my-map-start-choices">
      <button type="button" className="my-map-start-choice" aria-label="새 지도 그리기" disabled={!ready} onClick={onCreate}>
        <svg className="my-map-choice-drawing" viewBox="0 0 128 60" aria-hidden="true"><path d="M9 47 44 15 81 37 116 10" stroke="currentColor" strokeWidth="2" fill="none" /><path d="m79 54 16-22 25 19z" fill="var(--level-gray-bg)" stroke="currentColor" /><circle cx="9" cy="47" r="5" fill="currentColor" /><circle cx="44" cy="15" r="5" fill="var(--bg-1)" stroke="currentColor" strokeWidth="2" /><circle cx="81" cy="37" r="5" fill="var(--bg-1)" stroke="currentColor" strokeWidth="2" /></svg>
        <span className="my-map-choice-title">새 지도 그리기<ChevronRight size={18} aria-hidden="true" /></span>
        <span className="my-map-choice-copy">점·선·면·원으로 필요한 정보를<br />지도 위에 직접 표시합니다.</span>
      </button>
      <button type="button" className="my-map-start-choice" aria-label="파일 불러오기" disabled={!ready} onClick={onImport}>
        <span className="my-map-choice-file" aria-hidden="true">KML</span>
        <span className="my-map-choice-title">파일 불러오기<ChevronRight size={18} aria-hidden="true" /></span>
        <span className="my-map-choice-copy">가지고 있는 KML·KMZ 파일을<br />지도 위에서 확인합니다.</span>
      </button>
    </div>
  </section>
  const matches = documents.filter((entry) => entry.name?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <>
    <div className="my-map-library-actions">
      <button type="button" className="my-map-primary-button" disabled={!ready} onClick={onCreate}><Plus size={16} aria-hidden="true" />새 지도</button>
      <button type="button" className="my-map-secondary-button" disabled={!ready} onClick={onImport}><FileUp size={16} aria-hidden="true" />파일 불러오기</button>
    </div>
    {documents.length > 6 && <label className="my-map-search"><span className="sr-only">지도 검색</span><input type="search" placeholder="지도 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
    <section className="my-map-library" aria-label="내 지도 목록"><ul className="my-map-files" data-testid="my-map-files">
      {matches.map((entry) => {
        const visible = myMap.visibleIds?.has(entry.id) ?? false
        return <li className="my-map-document-row" key={entry.id}>
          <button type="button" className="my-map-document-open" onClick={() => myMap.openDocument(entry.id)}><span className="my-map-document-icon"><MapPinned size={18} aria-hidden="true" /></span><span className="my-map-document-copy"><strong>{entry.name}</strong><small>{entry.kind === 'personal' ? '직접 만든 지도' : '가져온 파일'} · {documentItemCount(entry).toLocaleString()}개 항목</small></span></button>
          <button type="button" className="my-map-icon-button" aria-label={`${entry.name} ${visible ? '숨기기' : '표시하기'}`} aria-pressed={visible} onClick={() => myMap.toggleDocument(entry.id)}>{visible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
        </li>
      })}
    </ul>{!matches.length && <p className="my-map-empty">맞는 지도가 없습니다.</p>}</section>
  </>
}
