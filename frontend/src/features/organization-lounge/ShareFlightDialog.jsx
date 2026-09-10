import { useEffect, useMemo, useState } from 'react'
import { Plane } from 'lucide-react'

import { listSavedRoutes, entryKind } from '../route-briefing/lib/routeStore.js'
import { localInputToIso } from './flightDraft.js'
import { listPreviewSavedRoutes, shareSavedFlight } from './api.js'
import { Button, Dialog, EmptyState } from './components.jsx'
import {
  buildShareFlightBody, organizationFlightHref, organizationFromMembership, shareFlightDefaults,
} from './shareFlight.js'
import './OrganizationLounge.css'

function errorMessage(error) {
  if (error?.status === 401) return '로그인한 뒤 기관에 공유할 수 있습니다.'
  if (error?.status === 403) return '현재 기관의 활성 구성원만 비행을 공유할 수 있습니다.'
  if (error?.status === 404) return '저장 자료를 찾을 수 없습니다. 개인 목록을 새로 확인해 주세요.'
  if (error?.code === 'invalid_saved_route') return '이 저장 자료는 공유할 수 없습니다. 경로 편집기에서 다시 저장해 주세요.'
  const field = error?.details?.details?.field
  if (error?.status === 400 && field === 'savedRouteId') return '서버에 저장된 개인 경로나 브리핑만 공유할 수 있습니다.'
  if (error?.status === 400 && field === 'etd') return '출발시각을 입력하세요.'
  if (error?.status === 400 && field === 'eta') return '도착시각은 출발시각보다 뒤여야 합니다.'
  if (error?.status === 400 && field === 'cruiseAltitudeFt') return '계획고도를 500~60,000 ft 범위로 입력하세요.'
  return error?.message || '비행을 공유하지 못했습니다.'
}

export default function ShareFlightDialog({ orgId = '', memberships = [], source = null, tz = 'KST', onClose, onShared }) {
  const [items, setItems] = useState(source ? [source] : [])
  const [selectedId, setSelectedId] = useState(source ? String(source.id) : '')
  const [selectedOrgId, setSelectedOrgId] = useState(String(orgId || organizationFromMembership(memberships[0])?.id || ''))
  const [defaults, setDefaults] = useState(() => shareFlightDefaults(source, tz))
  const [loading, setLoading] = useState(!source)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shared, setShared] = useState(null)
  const selected = useMemo(() => items.find((item) => String(item.id) === selectedId), [items, selectedId])

  useEffect(() => {
    if (source) return undefined
    let active = true
    setLoading(true)
    const loadRoutes = () => orgId === 'preview' ? listPreviewSavedRoutes() : listSavedRoutes()
    loadRoutes().then((saved) => {
      if (!active) return
      setItems(saved)
      if (saved.length) {
        setSelectedId(String(saved[0].id))
        setDefaults(shareFlightDefaults(saved[0], tz))
      }
    }).catch((reason) => { if (active) setError(errorMessage(reason)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [source, tz, orgId])

  function selectSource(id) {
    setSelectedId(id)
    setDefaults(shareFlightDefaults(items.find((item) => String(item.id) === id), tz))
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (!selectedOrgId) { setError('공유할 기관을 선택하세요.'); return }
    const values = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const body = buildShareFlightBody({
        source: selected, name: values.get('name'), etd: values.get('etd'), eta: values.get('eta'),
        cruiseAltitudeFt: values.get('cruiseAltitudeFt'), tz, toIso: localInputToIso,
      })
      const result = await shareSavedFlight(selectedOrgId, body)
      const flight = result.flight || result
      setShared({ orgId: selectedOrgId, flight })
      onShared?.(flight, { orgId: selectedOrgId })
    } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) }
  }

  if (shared) return <Dialog title="비행 공유 완료" onClose={onClose}>
    <div className="ol-stack">
      <p className="ol-success" role="status"><strong>{shared.flight.name || '비행'}</strong>을(를) 기관 예정비행에 공유했습니다.</p>
      <p className="ol-caption">공유본은 독립된 복사본이므로 개인 저장 자료를 삭제해도 기관 비행은 유지됩니다.</p>
      <div className="ol-panel-actions"><a className="ol-button" href={organizationFlightHref(shared.orgId, shared.flight.id)}><Plane size={17} /> 기관 비행 보기</a><Button secondary onClick={onClose}>닫기</Button></div>
    </div>
  </Dialog>

  return <Dialog title="내 비행을 기관에 공유" onClose={onClose}><form className="ol-form" onSubmit={submit}>
    {!orgId && <label className="ol-full">공유 대상 기관<select value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)} required><option value="">기관 선택</option>{memberships.map((membership) => { const organization = organizationFromMembership(membership); return organization && <option key={organization.id} value={organization.id}>{organization.name}</option> })}</select></label>}
    {!source && <label className="ol-full">{orgId === 'preview' ? '체험용 저장 자료' : '개인 저장 자료'}<select value={selectedId} onChange={(event) => selectSource(event.target.value)} required><option value="">저장 자료 선택</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {entryKind(item) === 'briefing' ? '브리핑' : '경로'}</option>)}</select></label>}
    {loading && <p className="ol-caption ol-full" role="status">{orgId === 'preview' ? '체험용' : '개인'} 저장 자료를 불러오는 중…</p>}
    {!loading && !items.length && <div className="ol-full"><EmptyState title="공유할 저장 자료가 없습니다.">저장 자료를 새로 확인한 뒤 다시 시도하세요.</EmptyState></div>}
    <label className="ol-full">비행명<input name="name" key={`name:${selectedId}`} defaultValue={defaults.name} /></label>
    <label>출발시각 · {tz}<input name="etd" type="datetime-local" key={`etd:${selectedId}`} defaultValue={defaults.etd} required /></label>
    <label>도착시각 · {tz}<input name="eta" type="datetime-local" key={`eta:${selectedId}`} defaultValue={defaults.eta} required /></label>
    <label className="ol-full">계획고도 · ft AMSL<input name="cruiseAltitudeFt" type="number" min="500" max="60000" step="100" key={`alt:${selectedId}`} defaultValue={defaults.cruiseAltitudeFt} required /></label>
    <p className="ol-caption ol-full">공유본은 독립된 복사본이므로 개인 저장 자료를 삭제해도 기관 비행은 유지됩니다.</p>
    {error && <p className="ol-form-error ol-full" role="alert">{error}</p>}
    <Button type="submit" className="ol-full" disabled={busy || loading || !items.length || !selectedOrgId}><Plane size={18} /> {busy ? '공유 중…' : '내 비행 공유'}</Button>
  </form></Dialog>
}
