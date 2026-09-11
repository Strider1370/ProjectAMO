import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Clock3, Expand, LayoutDashboard, LoaderCircle,
  Maximize2, Minimize2, RefreshCw, Square, X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import VerticalProfileChart from '../route-briefing/VerticalProfileChart.jsx'
import { organizationRequest, organizationResourceUrl } from './api.js'
import PreviewMode from './PreviewMode.jsx'
import { formatTime } from './components.jsx'
import OrganizationMap from './OrganizationMap.jsx'
import { OrganizationDocument } from './OrganizationDocument.jsx'
import PdfViewer from './PdfViewer.jsx'
import useOrganizationPresentation from './hooks/useOrganizationPresentation.js'
import { linkedItemKey, nextPinnedSelection } from './lib/linkedSelection.js'
import { briefingHazardLinkedItems, organizationLinkedItems } from './lib/organizationMapModel.js'
import {
  mapSelectionModels,
  materialReferences,
  presentationMapDataSelection,
  presentationWeatherState,
  speakerNotes,
} from './lib/presentationModel.js'
import './OrganizationPresentation.css'

function statusLabel(status) {
  return ({ available: '사용 가능', partial: '일부 누락', out_of_range: '범위 밖', unavailable: '사용 불가', unsupported: '고정 미지원' })[status] || status
}

function SelectionCard({ item, tz, activeItemId, pinnedItemId, onPreview, onClearPreview, onPin }) {
  const cardRef = useRef(null)
  const key = linkedItemKey(item)
  const intervals = item.distanceIntervals || item.routeIntervals || []
  const selected = key === activeItemId
  const weather = item.sourceKind?.includes('weather')
  const provenance = weather
    ? [item.source || '자동 기상', item.validFrom ? formatTime(item.validFrom, tz) : null, item.validTo ? `–${formatTime(item.validTo, tz)}` : null].filter(Boolean).join(' ')
    : `사용자 작성${item.authorUserId != null ? ` · 작성자 #${item.authorUserId}` : ''}`
  useEffect(() => {
    if (key === pinnedItemId) cardRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [key, pinnedItemId])
  return <button
    ref={cardRef}
    type="button"
    className={`op-linked-card${selected ? ' is-active' : ''}`}
    aria-pressed={key === pinnedItemId}
    onPointerEnter={(event) => { if (event.pointerType !== 'touch') onPreview(key) }}
    onPointerLeave={(event) => { if (event.pointerType !== 'touch') onClearPreview() }}
    onFocus={() => onPreview(key)}
    onBlur={onClearPreview}
    onClick={() => onPin(key)}
  >
    <strong>{item.title || item.summary || '연결 항목'}</strong>
    {item.description && <span>{item.description}</span>}
    <small>{provenance} · {intervals.length ? `경로 ${intervals.length}개 구간` : '경로 밖 또는 글만'}</small>
  </button>
}

function ProfilePanel({ bundle, activeItemId, onSelectItem, onExpand }) {
  const state = presentationWeatherState(bundle)
  const linkedItems = organizationLinkedItems({ bundle })
  if (!bundle?.verticalProfile) return <section className="op-panel op-profile-panel">
    <PanelTitle title="연직단면도" onExpand={onExpand} />
    <div className="op-empty">단면 자료를 사용할 수 없습니다. 지도와 작성 자료는 유지됩니다.</div>
  </section>
  return <section className="op-panel op-profile-panel">
    <PanelTitle title="연직단면도" onExpand={onExpand} />
    {state.limited && <div className="op-limited">자료 일부가 누락되어 위험 없음으로 판단할 수 없습니다.</div>}
    <VerticalProfileChart
      profile={bundle.verticalProfile}
      crossSection={bundle.crossSection}
      layers={{ wind: true, temp: true, moisture: true, icing: true, turbulence: true, cloud: true }}
      linkedItems={linkedItems}
      activeLinkedItemId={activeItemId}
      onSelectLinkedItem={onSelectItem}
      enableDragScroll
      hideMeta
      allowMissingTerrain
    />
  </section>
}

function PanelTitle({ title, onExpand }) {
  return <header className="op-panel-title"><h2>{title}</h2>{onExpand && <button type="button" aria-label={`${title} 확대`} onClick={onExpand}><Expand size={18} /></button>}</header>
}

function NotesPanel({ bundle, session, run, flight, tz, activeItemId, pinnedItemId, onPreview, onClearPreview, onPin, onExpandMaterials }) {
  const weather = presentationWeatherState(bundle)
  const weatherItems = briefingHazardLinkedItems(bundle)
  const linkedItems = organizationLinkedItems({ bundle }).filter((item) => item.sourceKind !== 'weather_hazard')
  const materials = materialReferences(session, run, flight, bundle)
  const notes = speakerNotes(session, run, flight, bundle)
  return <aside className="op-panel op-notes" aria-label="발표 자료">
    <section><div className="op-section-title"><h2>주요 위험기상</h2><span className={weather.limited ? 'is-limited' : ''}>{weather.label}</span></div>
      {weather.limited && <div className="op-limited">{weather.statuses.map(statusLabel).join(' · ')} · 결측을 정상 또는 위험 없음으로 해석하지 않습니다.</div>}
      {weatherItems.length ? weatherItems.map((item) => <SelectionCard key={linkedItemKey(item)} {...{ item, tz, activeItemId, pinnedItemId, onPreview, onClearPreview, onPin }} />)
        : !weather.limited && <p className="op-empty-inline">검증된 bundle에 요약된 위험기상이 없습니다.</p>}
    </section>
    <section className="op-scroll-section"><div className="op-section-title"><h2>운항 참고사항</h2><span>사용자 작성</span></div>
      {notes.map((note) => <article key={note.id} className="op-speaker-note"><strong>{note.title || '발표자 메모'}</strong><p>{note.body}</p></article>)}
      {linkedItems.length ? linkedItems.map((item) => <SelectionCard key={linkedItemKey(item)} {...{ item, tz, activeItemId, pinnedItemId, onPreview, onClearPreview, onPin }} />)
        : !notes.length && <p className="op-empty-inline">작성된 주의사항이 없습니다.</p>}
    </section>
    <section><div className="op-section-title"><h2>참고자료</h2>{materials.length > 0 && <button type="button" onClick={onExpandMaterials}>확대</button>}</div>
      {materials.length ? <div className="op-material-grid">{materials.slice(0, 4).map((material) => <button key={`${material.materialId}:${material.materialVersion}`} type="button" onClick={onExpandMaterials}><Square size={14} /><span>{material.title || `자료 ${material.materialId}`}</span><small>v{material.materialVersion ?? '현재'}</small></button>)}</div>
        : <p className="op-empty-inline">연결된 참고자료가 없습니다.</p>}
    </section>
  </aside>
}

function PresentationMaterialViewer({ orgId, material }) {
  const [resolved, setResolved] = useState(null)
  const [error, setError] = useState('')
  const materialId = material?.materialId
  const version = material?.materialVersion
  useEffect(() => {
    if (materialId == null || version == null) { setResolved(null); return undefined }
    const controller = new AbortController()
    setResolved(null); setError('')
    organizationRequest(orgId, `/materials/${encodeURIComponent(materialId)}?version=${encodeURIComponent(version)}`, { signal: controller.signal })
      .then((result) => setResolved(result.material || result))
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [orgId, materialId, version])

  if (version == null) return <div className="op-empty">고정된 자료 버전이 없어 발표 중 열 수 없습니다.</div>
  if (error) return <div className="op-empty" role="alert">고정 자료를 열 수 없습니다. {error}</div>
  if (!resolved) return <div className="op-empty" role="status"><LoaderCircle className="ol-spin" /> 고정 자료 v{version}을 여는 중…</div>
  const url = organizationResourceUrl(orgId, resolved.fileUrl, `/materials/${encodeURIComponent(materialId)}/versions/${encodeURIComponent(version)}/original`)
  const mime = resolved.mimeType || resolved.mime_type || ''
  const geojson = resolved.metadata?.geojson
  const features = geojson?.type === 'FeatureCollection' ? geojson.features : geojson?.type === 'Feature' ? [geojson] : []
  if (mime === 'application/pdf') return <PdfViewer url={url} title={resolved.title || `자료 ${materialId}`} />
  if (mime.startsWith('image/')) return <img className="op-expanded-image" src={url} alt={resolved.title || `자료 ${materialId}`} />
  if (resolved.kind === 'document' || resolved.blocks?.length) return <OrganizationDocument orgId={orgId} blocks={resolved.blocks || []} />
  if (features.length) return <OrganizationMap orgId={orgId} annotations={features.flatMap((feature, index) => feature?.geometry ? [{
    id: `${materialId}-${version}-${index}`,
    sourceKind: 'material',
    title: feature.properties?.name || feature.properties?.title || resolved.title,
    geometry: feature.geometry,
  }] : [])} />
  return <div className="op-empty"><strong>{resolved.title || `자료 ${materialId}`}</strong><a href={url} target="_blank" rel="noreferrer">고정 원본 열기</a></div>
}

function ExpandedPane({ orgId, type, bundle, session, run, flight, activeItemId, onSelectItem, onClose }) {
  const dialogRef = useRef(null)
  const materials = materialReferences(session, run, flight, bundle)
  const [selectedMaterialKey, setSelectedMaterialKey] = useState(null)
  const selectedMaterial = materials.find((material) => `${material.materialId}:${material.materialVersion}` === selectedMaterialKey) || materials[0]
  useEffect(() => {
    if (!materials.length) setSelectedMaterialKey(null)
    else if (!materials.some((material) => `${material.materialId}:${material.materialVersion}` === selectedMaterialKey)) {
      setSelectedMaterialKey(`${materials[0].materialId}:${materials[0].materialVersion}`)
    }
  }, [materials, selectedMaterialKey])
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={dialogRef} className="op-expanded" aria-label="발표 자료 확대" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header><strong>{type === 'map' ? '평면 기상 지도' : type === 'profile' ? '연직단면도' : '참고자료'}</strong><button type="button" onClick={onClose}><Minimize2 size={18} /> 발표 배치로 복귀</button></header>
    <div className="op-expanded-body">
      {type === 'map' && <OrganizationMap orgId={orgId} bundle={bundle} dataMode="pinned" selectedItemId={activeItemId} onSelectItem={onSelectItem} />}
      {type === 'profile' && <ProfilePanel bundle={bundle} activeItemId={activeItemId} onSelectItem={onSelectItem} />}
      {type === 'materials' && <div className="op-expanded-materials"><nav aria-label="참고자료 목록">{materials.map((material) => { const key = `${material.materialId}:${material.materialVersion}`; return <button type="button" key={key} aria-current={key === `${selectedMaterial?.materialId}:${selectedMaterial?.materialVersion}` ? 'true' : undefined} onClick={() => setSelectedMaterialKey(key)}><strong>{material.title || `기관 자료 ${material.materialId}`}</strong><small>불변 버전 v{material.materialVersion ?? '미지정'}</small></button> })}</nav><div className="op-expanded-material-view">{selectedMaterial ? <PresentationMaterialViewer orgId={orgId} material={selectedMaterial} /> : <div className="op-empty">연결된 참고자료가 없습니다.</div>}</div></div>}
    </div>
  </dialog>
}

export default function OrganizationPresentation({ orgId, sessionId, onExit }) {
  const { user } = useAuth()
  const { tz } = useTimeZone()
  const presentation = useOrganizationPresentation({ orgId, sessionId })
  const [layout, setLayout] = useState('map')
  const [expanded, setExpanded] = useState(null)
  const [pinnedItemId, setPinnedItemId] = useState(null)
  const [previewItemId, setPreviewItemId] = useState(null)
  const activeItemId = previewItemId || pinnedItemId
  const owner = orgId === 'preview' || (presentation.run && String(presentation.run.startedBy) === String(user?.id))
  const weather = presentationWeatherState(presentation.currentBundle)
  const mapSelection = presentationMapDataSelection(presentation.currentBundle)
  const candidateId = presentation.currentCandidate?.bundleId
  const candidateFlightVersion = presentation.currentCandidate?.bundle?.flightRevision
    ?? presentation.currentCandidate?.bundle?.flight?.version
  const candidateOrganizationVersion = presentation.currentCandidate?.bundle?.organizationSnapshot?.briefing?.version
  const appliedId = presentation.currentBundle?.bundleId
  const candidateReady = candidateId && candidateId !== appliedId

  useEffect(() => { setPinnedItemId(null); setPreviewItemId(null); setExpanded(null) }, [presentation.currentFlight?.id])
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.matches('input,textarea,select')) return
      if (event.key === 'Escape') {
        if (expanded) setExpanded(null)
        else { setPinnedItemId(null); setPreviewItemId(null) }
      } else if (!expanded && event.key === 'ArrowRight') presentation.move(1)
      else if (!expanded && event.key === 'ArrowLeft') presentation.move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, presentation.move])

  const selectItem = (item) => { setPreviewItemId(null); setPinnedItemId((current) => nextPinnedSelection(current, item)) }
  const modelTimes = useMemo(() => mapSelectionModels(mapSelection).flatMap(([name, model]) => model?.validTime ? [`${name.toUpperCase()} ${formatTime(model.validTime, tz)}`] : []), [mapSelection, tz])

  if (presentation.loading) return <main className="op-state" role="status"><LoaderCircle className="ol-spin" /> 발표 run과 불변 자료를 준비하는 중…</main>
  if (!presentation.run || !presentation.currentFlight) return <main className="op-state" role="alert"><strong>발표를 시작할 수 없습니다.</strong><p>{presentation.error || '회차에 발표할 예정비행이 없습니다.'}</p><button type="button" onClick={onExit}>돌아가기</button></main>

  const map = <section className="op-panel op-map-panel"><PanelTitle title="평면 기상 지도" onExpand={() => setExpanded('map')} /><OrganizationMap
    orgId={orgId}
    bundle={presentation.currentBundle}
    dataMode="pinned"
    selectedItemId={activeItemId}
    onSelectItem={selectItem}
  /></section>
  const profile = <ProfilePanel bundle={presentation.currentBundle} activeItemId={activeItemId} onSelectItem={selectItem} onExpand={() => setExpanded('profile')} />
  const notes = <NotesPanel bundle={presentation.currentBundle} session={presentation.session} run={presentation.run} flight={presentation.currentFlight}
    {...{ tz, activeItemId, pinnedItemId }} onPreview={setPreviewItemId} onClearPreview={() => setPreviewItemId(null)} onPin={selectItem} onExpandMaterials={() => setExpanded('materials')} />

  return <main className="organization-presentation">
    {orgId === 'preview' && <PreviewMode compact />}
    <header className="op-topbar"><div><strong>{presentation.run.pinnedSnapshot?.briefing?.name || presentation.session?.name || '합동 브리핑'}</strong><small>{presentation.run.status === 'ended' ? `종료 · ${formatTime(presentation.run.endedAt, tz, true)}` : `발표 run #${presentation.run.id} · 시작 ${formatTime(presentation.run.startedAt, tz)}`}</small></div>
      <div className="op-nav"><button type="button" onClick={() => presentation.move(-1)} aria-label="이전 비행"><ArrowLeft /></button><span>{presentation.currentIndex + 1} / {presentation.flights.length}</span><button type="button" onClick={() => presentation.move(1)} aria-label="다음 비행"><ArrowRight /></button>
        <button type="button" disabled={!owner || presentation.busy} onClick={async () => { if (await presentation.end()) onExit?.() }}><X size={18} /> 발표 종료</button></div></header>
    <div className="op-flightbar"><div><h1>{presentation.currentFlight.name || `비행 ${presentation.currentFlight.id}`}</h1><p>{presentation.currentFlight.routeLabel || presentation.currentFlight.snapshot?.base?.routeString || ''}</p></div>
      <div className="op-flight-actions"><div className="op-layout" role="group" aria-label="발표 배치"><button type="button" aria-pressed={layout === 'stacked'} onClick={() => setLayout('stacked')}><LayoutDashboard size={16} /> A 기존 배치</button><button type="button" aria-pressed={layout === 'map'} onClick={() => setLayout('map')}><Maximize2 size={16} /> B 지도 중심</button></div>
        {candidateReady ? <button className="op-update" type="button" disabled={!owner || presentation.busy} onClick={presentation.applyCurrent}><RefreshCw size={17} /> {candidateOrganizationVersion ? `회차 v${candidateOrganizationVersion} · ` : candidateFlightVersion && Number(candidateFlightVersion) !== Number(presentation.currentFlight.version) ? `비행 v${candidateFlightVersion} · ` : ''}준비된 새 자료 적용</button>
          : <button type="button" disabled={!owner || presentation.busy} onClick={presentation.prepareCurrent}><Clock3 size={17} /> {presentation.organizationChanged ? `기관 회차 v${presentation.session.version} 변경 확인` : '새 자료 확인'}</button>}</div></div>
    {presentation.error && <div className="op-error" role="alert">{presentation.error}<button type="button" onClick={() => presentation.setError('')}>닫기</button></div>}
    {!presentation.currentBundle ? <section className="op-waiting" role="status"><LoaderCircle className="ol-spin" /><strong>첫 표시 bundle을 준비하고 있습니다.</strong><button type="button" onClick={presentation.prepareCurrent}>다시 준비</button></section>
      : <div className={`op-grid is-${layout}`}>{map}{profile}{notes}</div>}
    <footer className="op-footer"><span className={weather.limited ? 'is-limited' : ''}>{weather.label}</span><span>{modelTimes.join(' · ') || '모델 유효시각 없음'}</span><span>bundle {appliedId?.slice(0, 12) || '--'} · 비행 v{presentation.currentFlight.version}</span><span>종료 기록은 사용 버전과 출처를 보존하며 당시 기상 전체 재현은 제공하지 않습니다.</span></footer>
    {expanded && presentation.currentBundle && <ExpandedPane orgId={orgId} type={expanded} bundle={presentation.currentBundle} session={presentation.session} run={presentation.run} flight={presentation.currentFlight} activeItemId={activeItemId} onSelectItem={selectItem} onClose={() => setExpanded(null)} />}
  </main>
}
