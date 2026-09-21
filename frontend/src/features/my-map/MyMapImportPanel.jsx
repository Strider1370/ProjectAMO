import { FileUp, MapPinned } from 'lucide-react'

export default function MyMapImportPanel({ prepared, loading, opening, ready, onPick, onOpen, onReset }) {
  if (!prepared) return <section className="my-map-import" aria-label="지도 파일 선택">
    <p className="my-map-start-intro">KML·KMZ 파일을 지도 위에 펼쳐 보세요.</p>
    <div className="my-map-dropzone"><FileUp size={32} aria-hidden="true" /><strong>{loading ? '지도 내용을 확인하고 있습니다…' : '파일을 여기에 놓으세요'}</strong><p>KML 또는 KMZ · 파일 1개</p><button type="button" className="my-map-primary-button" disabled={!ready || loading} onClick={onPick}>파일 선택</button></div>
  </section>
  const source = prepared.source, warnings = source.source?.warnings ?? []
  return <section className="my-map-import" aria-label="지도 파일 확인">
    <div className="my-map-import-summary"><MapPinned size={26} aria-hidden="true" /><div><h2>{prepared.file.name}</h2><p>{source.groups.length.toLocaleString()}개 폴더 · {source.items.length.toLocaleString()}개 항목</p></div></div>
    {warnings.length > 0 && <details className="my-map-import-warnings"><summary>확인할 내용 {warnings.length}개</summary><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    {!source.items.length && <p className="my-map-empty">표시할 지도 항목이 없습니다.</p>}
    <div className="my-map-import-actions"><button type="button" className="my-map-primary-button" disabled={!ready || opening || !source.items.length} onClick={onOpen}>{opening ? '지도 여는 중…' : '지도에서 보기'}</button><button type="button" className="my-map-header-button" disabled={opening} onClick={onReset}>다른 파일 선택</button></div>
    <p className="my-map-import-note">내용을 확인한 뒤 필요한 경우<br />수정 가능한 사본을 만들 수 있습니다.</p>
  </section>
}
