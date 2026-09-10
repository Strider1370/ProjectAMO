import { BellRing, CalendarClock, ChevronRight, Newspaper, Plane, SlidersHorizontal } from 'lucide-react'
import { getFlightCategory } from '../../../shared/weather/helpers.js'
import OrganizationMap from '../OrganizationMap.jsx'
import { MaterialDialog } from './MaterialsScreen.jsx'
import { Badge, Button, EmptyState, Panel, formatTime, routeLabel } from '../components.jsx'

function severity(alert) { return alert.severity === 'red' || alert.level === 'red' ? 'red' : 'amber' }
function airportCondition(summary, sourceStatus) {
  const observation = summary.metar?.observation
  if (!observation || sourceStatus !== 'available' || !Number.isFinite(observation.visibility?.value)) return { category: sourceStatus === 'delayed' ? '자료 지연' : '자료 없음', level: 'gray', detail: 'METAR 수집 상태를 확인하세요.' }
  const ceiling = (observation.clouds || []).filter((cloud) => ['BKN', 'OVC', 'VV'].includes(cloud.amount) && Number.isFinite(cloud.base)).map((cloud) => cloud.base).sort((a, b) => a - b)[0]
  const category = getFlightCategory(observation.visibility?.value, ceiling, summary.interest.icao).category
  const display = observation.display || {}
  return { category, level: category === 'VFR' ? 'green' : category === 'LIFR' ? 'red' : 'amber', detail: [display.wind, display.weather, display.clouds].filter(Boolean).join(' · ') || (summary.lightning?.coverageStatus === 'complete' ? `확인 구간 낙뢰 ${summary.lightning.count}건` : '낙뢰 관측 범위 미완료') }
}
function alertTitle(alert) {
  const detail = alert.payload || {}
  return alert.title || detail.title || detail.advisory?.phenomenon_label || detail.advisory?.phenomenon_code || alert.kind
}

export default function HomeScreen({ orgId, data, tz, navigate }) {
  const [showMapControls, setShowMapControls] = useState(true)
  const activeAlerts = data.alerts.filter((item) => item.status !== 'expired').slice(0, 4)
  const now = Date.now()
  const notices = data.notices.filter((notice) => (!notice.startsAt || Date.parse(notice.startsAt) <= now) && (!notice.endsAt || Date.parse(notice.endsAt) > now))
  const upcoming = [...data.flights].filter((flight) => flight.status !== 'cancelled').sort((a, b) => Date.parse(a.etd) - Date.parse(b.etd)).slice(0, 4)
  const airportSituations = data.situation?.airports || []
  const situation = data.situation || { alerts: activeAlerts, interests: data.interests }
  const canPlan = ['admin', 'planner'].includes(data.organization?.role)
  return <div className="ol-home">
    <section className="ol-news-strip">
      <button type="button" onClick={() => navigate('home', 'news')}><Newspaper size={19} /><strong>기관 소식</strong><span>{notices[0]?.title || (data.materials.length ? `최근 자료 ${data.materials.length}건` : '새 소식이 없습니다.')}</span><ChevronRight size={18} /></button>
      {data.organization?.settings?.jointBriefingEnabled !== false && <Button onClick={() => navigate('briefings')}><CalendarClock size={18} /> 합동 브리핑 준비</Button>}
    </section>
    {airportSituations.length > 0 && <section className="ol-airport-strip" aria-label="관심 공항 기상" style={{ '--ol-airport-count': Math.min(airportSituations.length, 4) }}>
      {airportSituations.slice(0, 4).map((summary) => { const condition = airportCondition(summary, data.situation?.sourceStatus?.metar?.status); const interest = summary.interest; return <button key={interest.id || interest.icao} type="button">
        <span><strong>{interest.name || interest.icao}</strong><small>{interest.icao}</small></span>
        <Badge level={condition.level}>{condition.category}</Badge>
        <small>{condition.detail}</small>
      </button> })}
    </section>}
    <div className="ol-home-grid">
      <Panel title="운항 기상" action={<button type="button" className="ol-map-controls-toggle"
        aria-pressed={!showMapControls} onClick={() => setShowMapControls((shown) => !shown)}>
        <SlidersHorizontal size={16} aria-hidden="true" />{showMapControls ? '지도만 보기' : '조작 버튼 보기'}
      </button>} className="ol-map-panel">
        <OrganizationMap orgId={orgId} situation={situation} dataMode="live" className="ol-map" showControls={showMapControls} />
      </Panel>
      <div className="ol-home-side">
        <Panel title="기관 알림" action={<div><button className="ol-text-button" type="button" onClick={() => navigate('home', 'news')}>공지</button><button className="ol-text-button" type="button" onClick={() => navigate('alerts')}>기상 알림</button></div>}>
          {activeAlerts.length || notices.length ? <div className="ol-compact-list">{activeAlerts.map((alert) => <button type="button" key={alert.id} onClick={() => navigate('alerts', alert.id)}>
            <BellRing size={18} className={`ol-${severity(alert)}`} /><span><strong>{alertTitle(alert)}</strong><small>{alert.targetName || alert.payload?.targetName || '기관 관심대상'} · {formatTime(alert.observedAt || alert.validFrom || alert.updatedAt, tz)}</small></span>
          </button>)}{notices.slice(0, Math.max(0, 4 - activeAlerts.length)).map((notice) => <button type="button" key={`notice-${notice.id}`} onClick={() => navigate('home', 'news')}><Newspaper size={18} className="ol-notice-icon" /><span><strong>{notice.title}</strong><small>공지 · {notice.body || formatTime(notice.updatedAt, tz)}</small></span></button>)}</div> : <EmptyState title="새로운 알림이 없습니다.">기관 공지와 관심 구역의 기상 알림이 여기에 표시됩니다.</EmptyState>}
        </Panel>
        <Panel title="비행 일정" action={<button className="ol-text-button" type="button" onClick={() => navigate('flights')}>전체 보기</button>}>
          {upcoming.length ? <div className="ol-flight-mini-list">{upcoming.map((flight) => <article key={flight.id}>
            <time>{formatTime(flight.etd, tz)}</time><div><strong>{flight.name}</strong><small>{routeLabel(flight)} · {Number(flight.snapshot?.cruiseAltitudeFt || flight.cruiseAltitudeFt || 0).toLocaleString()} ft</small></div>
            <a className="ol-icon-link" aria-label={`${flight.name} 기상 브리핑 보기`} href={`/?orgId=${encodeURIComponent(orgId)}&orgFlightId=${encodeURIComponent(flight.id)}`}><Plane size={18} /></a>
          </article>)}</div> : <EmptyState title="예정비행이 없습니다." action={canPlan && <Button onClick={() => navigate('flights', 'new')}>비행 등록</Button>} />}
        </Panel>
      </div>
    </div>
    {location.pathname.endsWith('/home/news') && <NewsDrawer orgId={orgId} data={data} navigate={navigate} />}
  </div>
}

function NewsDrawer({ orgId, data, navigate }) {
  const drawerRef = useRef(null)
  const [selected, setSelected] = useState(null)
  useEffect(() => { const trigger = document.activeElement; drawerRef.current?.showModal(); return () => { drawerRef.current?.close(); trigger?.focus?.() } }, [])
  return <>
    <dialog ref={drawerRef} className="ol-news-drawer" aria-label="기관 소식" onCancel={event => { event.preventDefault(); navigate('home') }}>
      <header><div><p className="ol-eyebrow">기관 소식</p><h2>공지와 최근 자료</h2></div><Button secondary onClick={() => navigate('home')}>닫기</Button></header>
      <div className="ol-drawer-content">
        {data.notices.map((notice) => <article key={notice.id}><Badge>{notice.kind || '공지'}</Badge><h3>{notice.title}</h3><p>{notice.body}</p><small>{notice.authorName || '기관 관리자'} · {notice.updatedAt?.slice(0, 16).replace('T', ' ')}</small></article>)}
        <h3>최근 자료</h3>
        {data.materials.slice(0, 5).map((material) => <button key={material.id} type="button" className="ol-material-row" onClick={() => setSelected(material)}><span><strong>{material.title}</strong><small>{material.authorName || '기관 자료'} · {material.updatedAt?.slice(0, 10)}</small></span><ChevronRight /></button>)}
      </div>
      <footer><Button secondary onClick={() => navigate('materials')}>전체 자료함</Button><Button onClick={() => navigate('briefings')}>브리핑 준비</Button></footer>
    </dialog>
    {selected && <MaterialDialog material={selected} orgId={orgId} canEdit={false} onClose={() => setSelected(null)} />}
  </>
}
import { useEffect, useRef, useState } from 'react'
