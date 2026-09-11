import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, ChevronLeft, LoaderCircle, LogIn, UserRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import Sidebar from '../../app/layout/Sidebar.jsx'
import { createOrganization, listOrganizations, organizationRequest, startPreviewSession } from './api.js'
import PreviewMode from './PreviewMode.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import FlightsScreen from './screens/FlightsScreen.jsx'
import MaterialsScreen from './screens/MaterialsScreen.jsx'
import AlertsScreen from './screens/AlertsScreen.jsx'
import BriefingsScreen from './screens/BriefingsScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'
import OrganizationPresentation from './OrganizationPresentation.jsx'
import './OrganizationLounge.css'

const NAV = [
  ['home', '홈'], ['flights', '예정비행'], ['materials', '공유자료'],
  ['alerts', '알림'], ['briefings', '합동 브리핑'], ['settings', '기관 설정'],
]
const EMPTY_DATA = { organization: null, flights: [], materials: [], alerts: [], briefings: [], notices: [], members: [], interests: [], situation: null }

function parseLocation() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  return { orgId: parts[1] || '', section: parts[2] || 'home', itemId: parts[3] || '', action: parts[4] || '' }
}

function go(path, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function asList(result, key) { return Array.isArray(result?.[key]) ? result[key] : [] }

function OrganizationPicker({ organizations, onSelect, onPreview, onCreate }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true); setCreateError('')
    try { await onCreate(trimmed) } catch (error) { setCreateError(error.message) } finally { setCreating(false) }
  }
  return <main className="ol-entry">
    <section className="ol-entry-card" aria-labelledby="ol-entry-title">
      <Building2 size={28} aria-hidden="true" />
      <div><p className="ol-eyebrow">PROJECTAMO</p><h1 id="ol-entry-title">기관 라운지 선택</h1></div>
      {organizations.length ? <div className="ol-choice-list">
        {organizations.map((membership) => {
          const organization = membership.organization || membership
          return <button key={organization.id} type="button" className="ol-choice" onClick={() => onSelect(organization.id)}>
            <span><strong>{organization.name}</strong><small>{membership.roleLabel || membership.role || '구성원'}</small></span>
            <span aria-hidden="true">→</span>
          </button>
        })}
      </div> : <div className="ol-empty"><strong>참여 중인 라운지가 없습니다.</strong><p>직접 라운지를 만들어 비행·자료·합동 브리핑을 바로 시험할 수 있습니다.</p></div>}
      <form className="ol-create-lounge" onSubmit={submit}>
        <label htmlFor="ol-new-lounge-name">새 라운지 이름</label>
        <div><input id="ol-new-lounge-name" value={name} onChange={(event) => setName(event.target.value)} maxLength="100" placeholder="예: 주말 비행 모임" required /><button type="submit" className="ol-button" disabled={creating}>{creating ? '만드는 중…' : '내 라운지 만들기'}</button></div>
        {createError && <p role="alert">{createError}</p>}
      </form>
      <button type="button" className="ol-button" onClick={onPreview}>미리보기 체험</button>
      <a className="ol-button ol-button-secondary" href="/"><ChevronLeft size={17} /> 지도로 돌아가기</a>
    </section>
  </main>
}

export default function OrganizationLoungePage() {
  const { user, loading: authLoading } = useAuth()
  const { tz } = useTimeZone()
  const [route, setRoute] = useState(parseLocation)
  const [organizations, setOrganizations] = useState([])
  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [pickerLoading, setPickerLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [previewSession, setPreviewSession] = useState(null)
  const preview = route.orgId === 'preview'
  const loungeUser = preview ? previewSession?.user : user

  useEffect(() => {
    const update = () => { setRoute(parseLocation()); window.scrollTo(0, 0) }
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setOrganizations([]); setPickerLoading(false); setLoading(false); return }
    const controller = new AbortController()
    setPickerLoading(true); setError('')
    listOrganizations({ signal: controller.signal }).then((result) => {
      const items = asList(result, 'organizations')
      setOrganizations(items)
    }).catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) }).finally(() => { if (!controller.signal.aborted) setPickerLoading(false) })
    return () => controller.abort()
  }, [authLoading, user?.id])

  useEffect(() => {
    if (!preview) { setPreviewSession(null); return undefined }
    const controller = new AbortController()
    setLoading(true); setError('')
    startPreviewSession({ signal: controller.signal })
      .then(setPreviewSession)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [preview])

  useEffect(() => { setData(EMPTY_DATA) }, [route.orgId, loungeUser?.id])

  const reload = useCallback(() => setRefreshKey((value) => value + 1), [])
  useEffect(() => {
    if (!route.orgId || !loungeUser || route.action === 'present') return
    const timer = window.setInterval(reload, 30_000)
    return () => window.clearInterval(timer)
  }, [route.orgId, route.action, loungeUser?.id, reload])
  useEffect(() => {
    if (!route.orgId || !loungeUser) { setLoading(false); return }
    const controller = new AbortController()
    let active = true
    setLoading(true); setError('')
    const partial = []
    const get = (path, key) => organizationRequest(route.orgId, path, { signal: controller.signal }).then((result) => asList(result, key)).catch((reason) => {
      if (reason.name === 'AbortError') throw reason
      partial.push(path); return null
    })
    Promise.all([
      organizationRequest(route.orgId, '', { signal: controller.signal }),
      get('/flights', 'flights'), get('/materials', 'materials'), get('/alerts', 'alerts'),
      get('/briefings', 'briefings'), get('/notices', 'notices'), get('/members', 'members'), get('/interests', 'interests'),
      organizationRequest(route.orgId, '/situation', { signal: controller.signal }).catch((reason) => { if (reason.name === 'AbortError') throw reason; partial.push('/situation'); return null }),
    ]).then(([org, flights, materials, alerts, briefings, notices, members, interests, situation]) => {
      if (!active) return
      setData((previous) => ({ organization: org.organization || org, flights: flights ?? previous.flights, materials: materials ?? previous.materials, alerts: alerts ?? previous.alerts, briefings: briefings ?? previous.briefings, notices: notices ?? previous.notices, members: members ?? previous.members, interests: interests ?? previous.interests, situation: situation ? situation.situation || situation : previous.situation }))
      if (partial.length) setError(`일부 기관 자료를 갱신하지 못했습니다 (${partial.length}개). 마지막으로 확인한 자료를 유지합니다.`)
    }).catch((reason) => {
      if (!active || reason.name === 'AbortError') return
      if (reason.status === 401 || reason.status === 403 || reason.status === 404) setData(EMPTY_DATA)
      setError(reason.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [route.orgId, loungeUser?.id, refreshKey])

  const navigate = useCallback((section = 'home', itemId = '', action = '') => {
    const suffix = [section, itemId, action].filter(Boolean).map(encodeURIComponent).join('/')
    go(`/lounge/${encodeURIComponent(route.orgId)}/${suffix}`)
  }, [route.orgId])
  const context = useMemo(() => ({ orgId: route.orgId, route, data, tz, user: loungeUser, navigate, reload }), [route, data, tz, loungeUser, navigate, reload])

  if ((authLoading && !preview) || (pickerLoading && !route.orgId) || (preview && !previewSession && !error)) return <div className="ol-loading" role="status"><LoaderCircle className="ol-spin" /> 기관 라운지를 불러오는 중…</div>
  if (!route.orgId && !user) return <main className="ol-entry"><section className="ol-entry-card"><LogIn size={28} /><h1>기관 라운지</h1><p>로그인 없이 예시 비행과 자료를 직접 편집하며 기능을 체험할 수 있습니다.</p><button type="button" className="ol-button" onClick={() => go('/lounge/preview/home')}>미리보기 체험</button><a className="ol-button ol-button-secondary" href="/">지도에서 로그인</a></section></main>
  if (!route.orgId) return <OrganizationPicker organizations={organizations} onSelect={(id) => go(`/lounge/${encodeURIComponent(id)}`)} onPreview={() => go('/lounge/preview/home')} onCreate={async (name) => {
    const result = await createOrganization({ name })
    const organization = result.organization
    setOrganizations((current) => [...current, organization])
    go(`/lounge/${encodeURIComponent(organization.id)}/home`)
  }} />
  if (!loungeUser) return <main className="ol-entry"><section className="ol-entry-card"><LogIn size={28} /><h1>{preview ? '미리보기를 시작할 수 없습니다.' : '로그인이 필요합니다.'}</h1><p>{error || '기관 자료는 구성원 권한을 확인한 뒤 제공합니다.'}</p><a className="ol-button" href={preview ? '/lounge/preview/home' : '/'}>{preview ? '다시 시도' : '지도에서 로그인'}</a></section></main>
  if (route.section === 'briefings' && route.action === 'present') return <OrganizationPresentation orgId={route.orgId} sessionId={route.itemId} onExit={() => navigate('briefings', route.itemId)} />

  const Screen = ({ home: HomeScreen, flights: FlightsScreen, materials: MaterialsScreen, alerts: AlertsScreen, briefings: BriefingsScreen, settings: SettingsScreen })[route.section] || HomeScreen
  const active = route.section === 'flights' ? 'flights' : route.section === 'materials' ? 'materials' : route.section === 'briefings' ? 'briefings' : route.section
  const navItems = data.organization?.settings?.jointBriefingEnabled === false
    ? NAV.filter(([id]) => id !== 'briefings')
    : NAV
  const unacknowledged = data.alerts.filter((alert) => !alert.acknowledgedAt && alert.status !== 'acknowledged').length
  return <div className={`ol-shell ${sidebarExpanded ? 'sidebar-is-expanded' : ''}`}>
    <Sidebar activePanel="lounge" onPanelToggle={(panel) => { if (panel !== 'lounge') window.location.assign('/') }} isExpanded={sidebarExpanded} onExpandToggle={setSidebarExpanded} layerCounts={{}} onSearchOpen={() => window.location.assign('/')} onProfileClick={() => window.location.assign('/')} onHelp={() => window.location.assign('/')} />
    <div className="ol-workspace">
      {preview && <PreviewMode />}
      <header className="ol-topbar">
        <div className="ol-org-identity"><Building2 size={20} /><strong>{data.organization?.name || '기관 라운지'}</strong>{organizations.length > 1 && <select aria-label="기관 전환" value={route.orgId} onChange={(event) => go(`/lounge/${encodeURIComponent(event.target.value)}`)}>{organizations.map((membership) => { const organization = membership.organization || membership; return <option key={organization.id} value={organization.id}>{organization.name}</option> })}</select>}</div>
        <nav className="ol-nav" aria-label="기관 라운지 내부 메뉴">{navItems.map(([id, label]) => <button key={id} type="button" aria-current={active === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}{id === 'alerts' && unacknowledged > 0 && <b>{unacknowledged}</b>}</button>)}</nav>
        <time>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul' }).format(new Date())}</time>
        <span className="ol-user"><UserRound size={17} />{loungeUser.display_name || loungeUser.username}</span>
      </header>
      {error && <div className="ol-error" role="alert"><span>{error}</span><button type="button" onClick={reload}>다시 시도</button></div>}
      <main id="organization-lounge-main" className="ol-main" tabIndex="-1">
        {loading && <div className="ol-progress" role="status">최신 기관 자료를 확인하는 중…</div>}
        <Screen key={`${route.orgId}:${loungeUser.id}`} {...context} />
      </main>
    </div>
  </div>
}
