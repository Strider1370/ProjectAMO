import { useEffect, useState } from 'react'
import { listSavedRoutes } from '../route-briefing/lib/routeStore.js'
import { listPreviewSavedRoutes, organizationApiUrl, organizationRequest } from './api.js'
import PdfViewer from './PdfViewer.jsx'
import { Button, EmptyState } from './components.jsx'

export function OrganizationDocument({ orgId, blocks = [] }) {
  return <article className="ol-written-document">{blocks.map((block, index) => {
    const text = block.text ?? block.body ?? ''
    if (block.kind === 'heading') return <h3 key={index}>{text}</h3>
    if (block.kind === 'text') return <p key={index} style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
    if (block.kind === 'link') return /^https?:\/\//i.test(block.url || '') ? <p key={index}><a href={block.url} target="_blank" rel="noreferrer">{text || block.url}</a></p> : null
    if (['image', 'pdf'].includes(block.kind) && block.materialId && block.materialVersion) {
      const url = organizationApiUrl(orgId, `/materials/${encodeURIComponent(block.materialId)}/versions/${encodeURIComponent(block.materialVersion)}/original`)
      return block.kind === 'pdf' ? <PdfViewer key={index} url={url} title={text || '첨부 문서'} /> : <figure key={index}><img className="ol-image-viewer" src={url} alt={text || '기관 첨부 이미지'} /><figcaption>{text}</figcaption></figure>
    }
    return null
  })}</article>
}

export function OrganizationDocumentEditor({ orgId, materials, initial, onSaved }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [blocks, setBlocks] = useState(initial?.blocks || [{ kind: 'text', text: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (index, patch) => setBlocks(current => current.map((block, i) => i === index ? { ...block, ...patch } : block))
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const result = await organizationRequest(orgId, `/materials${initial ? `/${initial.id}` : ''}`, { method: initial ? 'PATCH' : 'POST', body: { kind: 'document', title, blocks, ...(initial ? { expectedVersion: initial.version } : {}) } }); onSaved(result.material) }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <form className="ol-form" onSubmit={save}>
    <label className="ol-full">문서 제목<input required value={title} onChange={event => setTitle(event.target.value)} /></label>
    <div className="ol-full ol-stack">{blocks.map((block, index) => <section className="ol-document-block ol-form" key={index}>
      <label>블록 종류<select value={block.kind} onChange={event => update(index, { kind: event.target.value })}><option value="heading">제목</option><option value="text">본문</option><option value="link">링크</option><option value="image">이미지</option><option value="pdf">PDF</option></select></label>
      <div className="ol-panel-actions"><Button secondary disabled={index === 0} onClick={() => setBlocks(current => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next })}>위로</Button><Button secondary onClick={() => setBlocks(current => current.filter((_, i) => i !== index))}>블록 삭제</Button></div>
      <label className="ol-full">{block.kind === 'text' ? '본문' : '표시 제목'}<textarea rows={block.kind === 'text' ? 5 : 2} value={block.text || ''} onChange={event => update(index, { text: event.target.value })} /></label>
      {block.kind === 'link' && <label className="ol-full">링크 주소<input type="url" pattern="https?://.*" required value={block.url || ''} onChange={event => update(index, { url: event.target.value })} /></label>}
      {['image', 'pdf'].includes(block.kind) && <label className="ol-full">첨부할 기관 자료<select required value={block.materialId || ''} onChange={event => { const material = materials.find(item => String(item.id) === event.target.value); update(index, { materialId: material.id, materialVersion: material.version }) }}><option value="">자료 선택</option>{materials.filter(item => block.kind === 'pdf' ? item.mimeType === 'application/pdf' : item.mimeType?.startsWith('image/')).map(item => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></label>}
    </section>)}</div>
    <Button secondary onClick={() => setBlocks(current => [...current, { kind: 'text', text: '' }])}>블록 추가</Button><Button type="submit" disabled={busy}>{busy ? '저장 중…' : '기관 문서 저장'}</Button>
    {error && <p className="ol-form-error ol-full" role="alert">{error}</p>}
  </form>
}

export function OrganizationRouteMaterialEditor({ orgId, onSaved }) {
  const [routes, setRoutes] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    const loadRoutes = orgId === 'preview'
      ? () => listPreviewSavedRoutes().then((items) => items.filter((item) => item.kind !== 'briefing'))
      : () => listSavedRoutes({ kind: 'route' })
    loadRoutes().then(value => { if (active) setRoutes(value) }).catch(reason => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [orgId])
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget)
    const route = routes.find(item => String(item.id) === values.get('routeId'))
    try { const result = await organizationRequest(orgId, '/materials', { method: 'POST', body: { kind: 'route', title: values.get('title') || route.name, metadata: { snapshot: route.snapshot } } }); onSaved(result.material) }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <form className="ol-form" onSubmit={save}><label className="ol-full">공유 경로 제목<input name="title" /></label><label className="ol-full">개인 저장 경로<select name="routeId" required><option value="">경로 선택</option>{routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>{!routes.length && <EmptyState title="개인 경로를 먼저 저장하세요." />}<Button className="ol-full" type="submit" disabled={busy || !routes.length}>경로 복사하여 공유</Button>{error && <p className="ol-form-error ol-full" role="alert">{error}</p>}</form>
}
