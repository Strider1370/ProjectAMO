import { useEffect, useMemo, useState } from 'react'
import { File as FileIcon, FileImage, Map, Plus, Route, Upload } from 'lucide-react'
import { organizationRequest } from '../api.js'
import { Badge, Button, Dialog, EmptyState, PageHeading } from '../components.jsx'
import PdfViewer from '../PdfViewer.jsx'
import OrganizationMap from '../OrganizationMap.jsx'
import { OrganizationDocument, OrganizationDocumentEditor, OrganizationRouteMaterialEditor } from '../OrganizationDocument.jsx'

function kindOf(material) {
  const mime = material.mimeType || material.mime_type || ''
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (/kml|kmz/.test(mime) || material.kind === 'map') return 'map'
  if (material.kind === 'route') return 'route'
  return material.kind || 'document'
}
const icons = { pdf: FileIcon, image: FileImage, map: Map, route: Route, document: FileIcon }

export default function MaterialsScreen({ orgId, route, data, user, navigate, reload }) {
  const [filter, setFilter] = useState('all'); const [query, setQuery] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [createKind, setCreateKind] = useState('file')
  const selected = data.materials.find((item) => String(item.id) === route.itemId)
  const visible = useMemo(() => data.materials.filter((item) => {
    const kind = kindOf(item); const group = ['pdf', 'image', 'document'].includes(kind) ? 'document' : kind
    return (filter === 'all' || filter === group) && (item.title || '').toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko'))
  }), [data.materials, filter, query])
  async function upload(event) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const file = values.get('file')
    if (!(file instanceof window.File) || !file.size) return setError('등록할 파일을 선택하세요.')
    setBusy(true); setError('')
    try {
      await organizationRequest(orgId, '/materials', { method: 'POST', body: file, headers: {
        'x-file-name': encodeURIComponent(file.name), 'x-material-title': encodeURIComponent(values.get('title') || file.name), 'x-material-fields-encoding': 'uri-component',
      } }); setUploadOpen(false); reload()
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <>
    <PageHeading title="공유자료" description="기관의 문서, 현장도, 지도와 경로를 함께 보관합니다." action={<Button onClick={() => setUploadOpen(true)}><Plus size={18} /> 자료 등록</Button>} />
    <div className="ol-toolbar"><div className="ol-segments" aria-label="자료 종류">{[['all', '전체'], ['document', '문서·이미지'], ['map', '지도'], ['route', '경로']].map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><label className="ol-search"><span className="ol-visually-hidden">자료 제목 검색</span><input type="search" placeholder="자료 제목 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    {visible.length ? <div className="ol-material-grid">{visible.map((material) => { const kind = kindOf(material); const Icon = icons[kind] || FileIcon; return <article key={material.id} className="ol-material-card">
      <button type="button" className="ol-material-thumb" onClick={() => navigate('materials', material.id)}>{material.thumbnailAvailable ? <img src={`/api/organizations/${encodeURIComponent(orgId)}/materials/${encodeURIComponent(material.id)}/versions/${encodeURIComponent(material.version)}/thumbnail`} alt="" /> : <Icon size={36} />}</button>
      <div><Badge>{kind.toUpperCase()}</Badge><h2>{material.title}</h2><p>{material.description || material.originalName || '기관 공유자료'}</p><small>{material.authorName || '기관 구성원'} · {(material.updatedAt || '').slice(0, 10)}</small></div>
    </article> })}</div> : <EmptyState title="조건에 맞는 자료가 없습니다.">파일을 등록하거나 검색 조건을 바꿔 보세요.</EmptyState>}
    {selected && <MaterialDialog material={selected} materials={data.materials} orgId={orgId} canEdit={['admin', 'planner'].includes(data.organization?.role) || String(selected.ownerUserId) === String(user?.id)} onClose={() => navigate('materials')} onUpdated={() => { reload(); navigate('materials') }} />}
    {uploadOpen && <Dialog title="공유자료 등록" onClose={() => setUploadOpen(false)}><div className="ol-segments" aria-label="자료 등록 방식">{[['file', '파일 업로드'], ['document', '글 작성'], ['route', '저장 경로']].map(([kind, label]) => <button type="button" key={kind} aria-pressed={kind === createKind} onClick={() => setCreateKind(kind)}>{label}</button>)}</div>
      {createKind === 'file' ? <form className="ol-form" onSubmit={upload}><label className="ol-full">제목<input name="title" /></label><label className="ol-full">PDF·이미지·KML/KMZ<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.kml,.kmz" /></label><p className="ol-caption ol-full">파일은 기관 권한으로 보호되는 비공개 저장소에 보관됩니다.</p>{error && <p className="ol-form-error ol-full" role="alert">{error}</p>}<Button type="submit" className="ol-full" disabled={busy}><Upload size={18} /> {busy ? '등록 중…' : '등록'}</Button></form>
        : createKind === 'document' ? <OrganizationDocumentEditor orgId={orgId} materials={data.materials} onSaved={() => { setUploadOpen(false); reload() }} />
          : <OrganizationRouteMaterialEditor orgId={orgId} onSaved={() => { setUploadOpen(false); reload() }} />}
    </Dialog>}
  </>
}

export function MaterialDialog({ material, materials = [], orgId, canEdit, onClose, onUpdated }) {
  const [shown, setShown] = useState(material)
  const kind = kindOf(shown)
  const [replaceOpen, setReplaceOpen] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setShown(material); setReplaceOpen(false) }, [material])
  const fallbackUrl = `/api/organizations/${encodeURIComponent(orgId)}/materials/${encodeURIComponent(shown.id)}/versions/${encodeURIComponent(shown.version)}/original`
  const fileUrl = shown.fileUrl || fallbackUrl
  const features = shown.metadata?.geojson?.type === 'FeatureCollection' ? shown.metadata.geojson.features : shown.metadata?.geojson?.type === 'Feature' ? [shown.metadata.geojson] : []
  const mapAnnotations = features.filter((feature) => feature?.geometry).map((feature, index) => ({ id: `${shown.id}-${shown.version}-${index}`, title: feature.properties?.name || feature.properties?.title || shown.title, sourceKind: 'material', geometry: feature.geometry }))
  async function loadVersion(version) {
    setBusy(true); setError('')
    try { const result = await organizationRequest(orgId, `/materials/${encodeURIComponent(material.id)}?version=${encodeURIComponent(version)}`); setShown(result.material || result) }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  async function replace(event) {
    event.preventDefault(); const file = new FormData(event.currentTarget).get('file')
    if (!(file instanceof window.File) || !file.size) return setError('교체할 파일을 선택하세요.')
    setBusy(true); setError('')
    try { await organizationRequest(orgId, `/materials/${encodeURIComponent(material.id)}`, { method: 'PATCH', body: file, headers: { 'x-file-name': encodeURIComponent(file.name), 'x-material-title': encodeURIComponent(material.title), 'x-expected-version': String(material.version), 'x-material-fields-encoding': 'uri-component' } }); onUpdated() }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <Dialog title={shown.title} onClose={onClose} footer={canEdit && shown.version === material.version && <div className="ol-panel-actions">{kind === 'document' ? <Button secondary onClick={() => setEditing(value => !value)}>문서 편집</Button> : kind !== 'route' && <Button secondary onClick={() => setReplaceOpen((value) => !value)}>파일 교체</Button>}<Button secondary disabled={busy} onClick={async () => { setBusy(true); try { await organizationRequest(orgId, `/materials/${material.id}`, { method: 'DELETE', body: { expectedVersion: material.version } }); onUpdated?.() } catch (reason) { setError(reason.message) } finally { setBusy(false) } }}>자료 삭제</Button></div>}>
    <div className="ol-material-meta"><p className="ol-caption">{shown.authorName || '기관 자료'} · {(shown.updatedAt || '').replace('T', ' ').slice(0, 16)}</p><label>자료 버전<select value={shown.version} disabled={busy} onChange={(event) => loadVersion(event.target.value)}>{Array.from({ length: material.version }, (_, index) => material.version - index).map((version) => <option key={version} value={version}>v{version}{version === material.version ? ' · 최신' : ''}</option>)}</select></label></div>
    {editing ? <OrganizationDocumentEditor orgId={orgId} materials={materials} initial={material} onSaved={onUpdated} /> : kind === 'document' ? <OrganizationDocument orgId={orgId} blocks={shown.blocks} /> : kind === 'route' && shown.metadata?.snapshot ? <div className="ol-material-map"><OrganizationMap orgId={orgId} bundle={{ flight: { snapshot: shown.metadata.snapshot } }} /></div> : kind === 'pdf' ? <PdfViewer url={fileUrl} title={shown.title} /> : kind === 'image' ? <img className="ol-image-viewer" src={fileUrl} alt={shown.title} /> : mapAnnotations.length ? <div className="ol-material-map"><OrganizationMap orgId={orgId} annotations={mapAnnotations} /></div> : <div className="ol-empty"><strong>{kind === 'route' ? '기관 공유 경로' : '지도 자료'}</strong><p>표시할 GeoJSON 도형이 없습니다.</p>{shown.originalName && <a className="ol-button" href={fileUrl}>원본 다운로드</a>}</div>}
    {error && <p className="ol-form-error" role="alert">{error}</p>}
    {replaceOpen && <form className="ol-form ol-replace-form" onSubmit={replace}><label className="ol-full">새 파일<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.kml,.kmz" /></label>{error && <p className="ol-form-error ol-full">{error}</p>}<Button type="submit" className="ol-full" disabled={busy}>{busy ? '교체 중…' : `v${material.version + 1}로 교체`}</Button></form>}
  </Dialog>
}
