import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight, Plus, X } from 'lucide-react'
import airports from '../../../../shared/airports.js'
import usePersonalSettings from '../personal/usePersonalSettings.js'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import AlertIcon from './AlertIcon.jsx'
import LegacyAlertArchive from './LegacyAlertArchive.jsx'
import { clock } from './AlertCard.jsx'
import { activeByTarget, alertView, ceilingText, metarNow, ruleChips, visibilityText } from './alertModel.js'
import './airportAlerts.css'

const CATEGORY_CLASS = { VFR: 'is-vfr', MVFR: 'is-vfr', IFR: 'is-ifr', LIFR: 'is-lifr' }

// 지금 METAR(국내·해외). 감시 카드의 "지금 시정 · 운고"와 범주 표시.
function useCurrentMetars() {
  const [metars, setMetars] = useState({})
  useEffect(() => {
    let alive = true
    Promise.all(['/api/metar', '/api/metar-overseas'].map((url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((results) => { if (alive) setMetars(Object.assign({}, ...results.map((d) => d?.airports ?? {}))) })
    return () => { alive = false }
  }, [])
  return metars
}
export { useCurrentMetars }

export function Switch({ checked, label, onChange, disabled = false }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
    className={`aa-switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
}

// 감시 대상: 받는 방법(모든 대상 공통) + 공항 카드 + 경로 카드. 카드를 누르면 편집 화면.
export default function AlertWatchesPage({ watches, notifications, onBack, onClose, onEditAirport, onEditRoute }) {
  const { tz } = useTimeZone()
  const { pushEnabled, pushSupported, togglePush } = usePersonalSettings()
  const metars = useCurrentMetars()
  const isMobile = useIsMobile()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const active = activeByTarget(notifications)
  const airportWatches = watches.airport.watches
  const popupOn = airportWatches.length ? airportWatches.every((w) => w.rules?.channels?.popup !== false) : true
  const watchedRouteIds = new Set(watches.route.watches.map((w) => w.routeId))
  const unwatchedRoutes = watches.route.routes.filter((r) => !watchedRouteIds.has(r.id))
  const tzLabel = tz === 'UTC' ? 'UTC' : 'KST'

  // 받는 방법은 모든 공항 감시에 같이 적용한다(서버 설정은 공항마다 있다).
  async function setPopup(next) {
    setBusy(true); setMessage('')
    try {
      await Promise.all(airportWatches.map((w) => fetch(`/api/me/airport-watches/${w.icao}`, { method: 'PUT', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: w.enabled, rules: { ...w.rules, channels: { ...w.rules.channels, popup: next } } }) })
        .then((r) => { if (!r.ok) throw new Error() })))
      await watches.changed()
    } catch { setMessage('웹 팝업 설정을 바꾸지 못했습니다.') } finally { setBusy(false) }
  }
  async function setPush(next) {
    const result = await togglePush(next)
    if (next && !result?.ok) setMessage(result?.reason === 'denied' ? '브라우저 알림 권한이 차단됐습니다. 브라우저 설정에서 허용해 주세요.' : '푸시 알림을 켜지 못했습니다.')
  }

  return <main className="aa-page"><div className="aa-shell">
    <header className="aa-head">
      <button type="button" className="aa-back" aria-label="알림으로" onClick={onBack}><ArrowLeft size={18} /></button>
      <h1>감시 대상</h1>
      <button type="button" className="aa-close" aria-label="알림 패널 닫기" onClick={onClose}><X size={18} /></button>
    </header>
    {(message || watches.error) && <p className="aa-message" role="status">{message || watches.error}</p>}

    <section className="aa-box" aria-labelledby="aa-recv-title">
      <h2 id="aa-recv-title" className="aa-box-title">받는 방법</h2>
      <div className="aa-setting-row">
        <span>웹 팝업<small>사이트가 열려 있을 때 화면 오른쪽 위</small></span>
        <Switch checked={popupOn} label="웹 팝업" disabled={busy || !airportWatches.length} onChange={setPopup} />
      </div>
      {/* 휴대폰 푸시는 휴대폰에서 켠다(기기마다 따로). PC에서는 켜는 방법만 안내한다. */}
      {isMobile ? <div className="aa-setting-row">
        <span>이 휴대폰 푸시<small className={pushEnabled ? 'is-ok' : undefined}>{pushEnabled ? '켜짐 · 잠금화면과 알림센터로 받습니다' : pushSupported ? '꺼짐 · 켜면 사이트를 닫아도 받습니다' : '이 브라우저는 푸시를 지원하지 않습니다 · 홈 화면에 추가한 뒤 다시 시도하세요'}</small></span>
        <Switch checked={pushEnabled} label="이 휴대폰 푸시" disabled={!pushSupported} onChange={setPush} />
      </div> : <div className="aa-setting-row">
        <span>휴대폰 푸시<small>휴대폰에서 이 사이트를 열고 알림 → 감시 대상 → 받는 방법에서 켜세요. 휴대폰마다 따로 켭니다.</small></span>
      </div>}
    </section>

    <div className="aa-group-head">
      <h2>공항 {airportWatches.length}</h2>
      <label className="aa-add"><Plus size={16} aria-hidden="true" />공항 추가
        <select value="" aria-label="추가할 공항" onChange={(event) => event.target.value && onEditAirport(event.target.value)}>
          <option value="">공항 선택</option>
          {airports.filter((a) => !airportWatches.some((w) => w.icao === a.icao)).map((a) => <option key={a.icao} value={a.icao}>{a.nameKo} · {a.icao}</option>)}
        </select>
      </label>
    </div>
    {!airportWatches.length && <p className="aa-empty is-small">아직 감시하는 공항이 없습니다. 공항 패널의 알림 버튼이나 위의 공항 추가로 시작하세요.</p>}
    <div className="aa-watch-cards">{airportWatches.map((w) => {
      const airport = airports.find((a) => a.icao === w.icao)
      const now = metarNow(metars[w.icao], w.icao)
      const hits = (active.airports.get(w.icao) ?? []).filter((n) => n.type === 'metar')
      const hitKeys = new Set(hits.flatMap((n) => (n.payload?.metrics ?? []).map((m) => m.key)))
      const hitTitle = hits[0] ? alertView(hits[0]).title : null
      return <button key={w.icao} type="button" className={`aa-watch-card${hitTitle ? ' is-hit' : ''}`} onClick={() => onEditAirport(w.icao)}>
        <span className="aa-watch-card-head">
          <strong>{airport?.nameKo ?? w.icao}</strong><code>{w.icao}</code>
          <span className={`aa-pill${!w.enabled ? '' : hitTitle ? ' is-hit' : ' is-on'}`}>{!w.enabled ? '일시정지' : hitTitle ? `해당 중 · ${hitTitle.replace(/ 기준.*/, '')}` : '감시 중 · 이상 없음'}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </span>
        <span className="aa-chips">{ruleChips(w.rules).map((c) => <span key={c.key} className={`aa-chip${hitKeys.has(c.key) ? ' is-hit' : ''}`}><AlertIcon kind={c.icon} size={13} />{c.text}</span>)}</span>
        <span className="aa-watch-now">{now?.category && <span className={`aa-cat ${CATEGORY_CLASS[now.category] ?? ''}`}>{now.category === 'MVFR' ? 'VFR' : now.category}</span>}
          {now ? `지금 시정 ${visibilityText(now.visibilityM)} · ${ceilingText(now.ceilingFt)}${now.windKt != null ? ` · 바람 ${now.windKt}kt` : ''}` : '지금 METAR 없음'}
          {w.lastEvaluatedAt ? ` · ${clock(w.lastEvaluatedAt, tz)} 확인` : ' · 첫 확인 대기 중'}</span>
      </button>
    })}</div>

    <div className="aa-group-head"><h2>비행경로 {watches.route.watches.length}</h2></div>
    <div className="aa-watch-cards">{watches.route.watches.map((w) => {
      const hits = active.routes.get(w.routeId) ?? []
      const first = hits[0] ? alertView(hits[0]) : null
      return <button key={w.id} type="button" className={`aa-watch-card${first ? ' is-hit' : ''}`} onClick={() => onEditRoute(w.routeId)}>
        <span className="aa-watch-card-head">
          <strong>{w.routeName}</strong>
          <span className={`aa-pill${!w.enabled ? '' : first ? ' is-hit' : ' is-on'}`}>{!w.enabled ? '일시정지' : first
            ? <><AlertIcon kind="sigmet" code={first.code} size={16} />{first.title}{hits.length > 1 ? ` 외 ${hits.length - 1}` : ''} 겹침</> : 'SIGMET 감시 중'}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </span>
        <span className="aa-watch-now">ETD {clock(w.snapshot?.etd, tz)} → ETA {clock(w.snapshot?.eta, tz)} {tzLabel}{w.snapshot?.cruiseAltitudeFt ? ` · 순항고도 FL${String(Math.round(w.snapshot.cruiseAltitudeFt / 100)).padStart(3, '0')}` : ''} · 도착 후 자동 종료</span>
      </button>
    })}</div>
    {unwatchedRoutes.length > 0 && <div className="aa-route-pick"><span>감시하지 않는 저장 경로</span>
      {unwatchedRoutes.map((r) => <button key={r.id} type="button" onClick={() => onEditRoute(r.id)}>{r.name}<small>ETD {clock(r.snapshot?.etd, tz)}</small></button>)}</div>}
    {!watches.route.watches.length && !unwatchedRoutes.length && <p className="aa-empty is-small">경로선과 ETD·ETA가 있는 저장 경로가 없습니다. 경로 생성에서 경로를 저장하면 여기서 SIGMET 감시를 켤 수 있습니다.</p>}
    <p className="aa-note">감시를 끄거나 지워도 지난 알림 이력은 남습니다.</p>
    <LegacyAlertArchive />
  </div></main>
}
