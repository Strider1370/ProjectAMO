import { useEffect, useState } from 'react'
import { ArrowLeft, BellRing, Check, Plus, Trash2, X } from 'lucide-react'
import airports from '../../../../shared/airports.js'
import { useAuth } from '../auth/AuthContext.jsx'
import usePersonalSettings from '../personal/usePersonalSettings.js'
import RouteAlertSettings from './RouteAlertSettings.jsx'
import LegacyAlertArchive from './LegacyAlertArchive.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import './airportAlerts.css'

const API = '/api/me/airport-watches'
const METRICS = [
  ['visibility', '시정', 'm', '미만'], ['ceiling', '운고', 'ft', '미만'],
  ['wind', '풍속', 'kt', '이상'], ['gust', '돌풍', 'kt', '이상'],
  ['temperature', '기온', '°C', null],
]
const clone = (value) => JSON.parse(JSON.stringify(value))
const timeText = (iso, tz) => new Intl.DateTimeFormat('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const SOURCE_TEXT = { available: '정상', complete: '완전', delayed: '지연', partial: '일부 수집', unavailable: '확인 불가', unknown: '확인 불가', outside_coverage: '관측 범위 밖' }
const TEST_LABELS = { metar: 'METAR 설정 기준 초과', windshear: '급변풍 보고', fzra: '어는 비 관측', taf_new: '새 TAF 발표', taf_amd: 'TAF AMD 발표', airport_warning: '공항경보 발효', lightning: '반경 내 낙뢰' }

export default function AirportAlertSettingsPage({ embedded = false, initialIcao, initialRouteId, onBack, onClose, onLogin }) {
  const { user, loading: authLoading } = useAuth()
  const { tz } = useTimeZone()
  const { pushEnabled, pushSupported, togglePush } = usePersonalSettings()
  const [defaults, setDefaults] = useState(null)
  const [watches, setWatches] = useState([])
  const [icao, setIcao] = useState('RKSI')
  const [rules, setRules] = useState(null)
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [testScenario, setTestScenario] = useState('')
  const [lastTest, setLastTest] = useState(null)
  const [targetTab, setTargetTab] = useState(initialRouteId ? 'route' : 'airport')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch(API, { credentials: 'include' }).then(async (res) => {
      if (!res.ok) throw new Error('설정을 불러오지 못했습니다.')
      return res.json()
    }).then((data) => {
      if (cancelled) return
      setDefaults(data.defaults)
      setWatches(data.watches)
      const targetIcao = initialIcao ?? data.watches[0]?.icao ?? 'RKSI'
      const first = data.watches.find((item) => item.icao === targetIcao)
      setIcao(targetIcao)
      setRules(clone(first?.rules ?? data.defaults))
      setEnabled(first?.enabled ?? true)
    }).catch((error) => { if (!cancelled) setMessage(error.message) })
    return () => { cancelled = true }
  }, [user, initialIcao])

  function select(code) {
    const watch = watches.find((item) => item.icao === code)
    setIcao(code); setRules(clone(watch?.rules ?? defaults)); setEnabled(watch?.enabled ?? true); setMessage(''); setTestScenario(''); setLastTest(null)
  }
  function update(key, patch) { setRules((current) => ({ ...current, [key]: { ...current[key], ...patch } })) }
  const current = watches.find((item) => item.icao === icao)
  const airport = airports.find((item) => item.icao === icao)
  const testOptions = current?.enabled ? [
    ...(['visibility', 'ceiling', 'wind', 'gust', 'temperature'].some((key) => current.rules[key]?.enabled) ? ['metar'] : []),
    ...(current.rules.windshear?.enabled ? ['windshear'] : []),
    ...(current.rules.fzra?.enabled ? ['fzra'] : []),
    ...(current.rules.tafNew?.enabled ? ['taf_new'] : []),
    ...(current.rules.tafAmd?.enabled ? ['taf_amd'] : []),
    ...(current.rules.airportWarning?.enabled ? ['airport_warning'] : []),
    ...(current.rules.lightning?.enabled ? ['lightning'] : []),
  ] : []

  useEffect(() => {
    if (!user || !current?.enabled) return undefined
    let cancelled = false
    fetch(`/api/me/alert-tests/latest?icao=${encodeURIComponent(icao)}`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : { test: null })
      .then((data) => { if (!cancelled) setLastTest(data.test) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user, icao, current?.enabled])

  async function save(nextEnabled = enabled, nextRules = rules) {
    if (nextEnabled && !Object.entries(nextRules).some(([key, rule]) => key !== 'channels' && rule.enabled)) {
      setMessage('감시할 조건을 하나 이상 선택하세요.'); return
    }
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`${API}/${icao}`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled, rules: nextRules }) })
      if (!res.ok) throw new Error('설정을 저장하지 못했습니다. 입력값을 확인하세요.')
      setWatches((items) => [...items.filter((item) => item.icao !== icao), { icao, enabled: nextEnabled, rules: nextRules }].sort((a, b) => a.icao.localeCompare(b.icao)))
      setRules(clone(nextRules))
      setEnabled(nextEnabled)
      setMessage(nextEnabled ? '감시가 시작됐습니다. 현재 관측은 서버의 다음 평가에서 확인합니다.' : '감시를 일시정지했습니다.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`${API}/${icao}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('삭제하지 못했습니다.')
      const remaining = watches.filter((item) => item.icao !== icao)
      setWatches(remaining)
      const next = remaining[0]?.icao ?? 'RKSI'
      const watch = remaining.find((item) => item.icao === next)
      setIcao(next); setRules(clone(watch?.rules ?? defaults)); setEnabled(watch?.enabled ?? true)
      setMessage('감시 공항을 삭제했습니다.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function enablePush() {
    try {
      const result = await togglePush(true)
      setMessage(result.ok ? '이 기기에서 푸시 알림을 받습니다.' : result.reason === 'denied'
        ? '브라우저 알림 권한이 차단됐습니다. 브라우저 설정에서 허용해 주세요.' : '푸시 알림을 설정하지 못했습니다. 서버 설정을 확인하세요.')
    } catch { setMessage('푸시 알림을 설정하지 못했습니다.') }
  }

  async function runReceptionTest() {
    if (!current?.enabled || !testOptions.length) return
    setBusy(true); setMessage('')
    try {
      let endpoint
      if (pushEnabled) endpoint = (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint
      const res = await fetch('/api/me/alert-tests', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ icao, scenario: testScenario || testOptions[0], ...(endpoint ? { endpoint } : {}) }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error === 'device_not_subscribed' ? '이 기기의 푸시 구독이 만료됐습니다. 다시 켜 주세요.'
        : result.error === 'test_rate_limited' ? '짧은 시간에 시험을 많이 실행했습니다. 잠시 후 다시 시도하세요.'
          : result.error === 'condition_not_met' ? '현재 설정으로는 시험 조건이 발동하지 않습니다. 기준값을 확인하세요.'
            : '시험 알림을 만들지 못했습니다.')
      setLastTest(result.test)
      if (window.innerWidth > 719) window.dispatchEvent(new CustomEvent('airport-alert-preview', { detail: {
        id: `test:${result.test.id}`, testId: result.test.id, source: 'airport', test: true,
        airportIcao: icao, routeName: airport?.nameKo ?? icao, type: result.test.kind,
        payload: result.test.payload, detectedAt: result.test.createdAt,
      } }))
      setMessage(result.test.pushStatus === 'sent' ? '시험 알림을 이 기기로 보냈습니다. 기기에서 수신과 탭 이동을 확인하세요.'
        : result.test.pushStatus === 'not_requested' ? '모의 판정이 발동했습니다. 휴대폰 푸시는 이 기기에서 푸시 수신을 켠 뒤 다시 시험하세요.'
          : '모의 판정은 발동했지만 푸시 발송에 실패했습니다. 구독 상태를 확인하세요.')
    } catch (error) { setMessage(error.message || '시험을 실행하지 못했습니다.') }
    finally { setBusy(false) }
  }
  async function refreshStatus() {
    try {
      const res = await fetch(API, { credentials: 'include' })
      if (!res.ok) throw new Error()
      setWatches((await res.json()).watches)
      setMessage('감시 상태를 새로 확인했습니다.')
    } catch { setMessage('감시 상태를 확인하지 못했습니다.') }
  }

  if (!authLoading && !user) return <main className="aa-page"><div className="aa-shell"><button type="button" onClick={onBack ?? onClose}>← 알림으로</button><h1>알림 설정</h1><p>감시 대상을 저장하려면 로그인하세요.</p><button type="button" onClick={onLogin}>로그인</button></div></main>
  return <main className="aa-page"><div className="aa-shell">
    <header className="aa-page-head">{embedded ? <button type="button" onClick={onBack}><ArrowLeft size={17} /> 알림으로</button> : <a href="/alerts"><ArrowLeft size={17} /> 알림 목록</a>}<div><p>ProjectAMO · 알림 설정</p><h1>{targetTab === 'route' ? '감시할 경로' : '감시할 공항과 조건'}</h1><span>{targetTab === 'route' ? '저장한 비행경로에 유효한 SIGMET이 겹치면 알려드립니다.' : '공항마다 기준을 정하면 서버가 관측·TAF·공항경보·낙뢰를 계속 확인합니다.'}</span></div>{embedded && <button type="button" className="aa-close" aria-label="알림 패널 닫기" onClick={onClose}><X size={18} /></button>}</header>
    <nav className="aa-target-tabs" aria-label="알림 대상"><button type="button" className={targetTab === 'airport' ? 'is-active' : ''} aria-current={targetTab === 'airport' ? 'page' : undefined} onClick={() => setTargetTab('airport')}>공항</button><button type="button" className={targetTab === 'route' ? 'is-active' : ''} aria-current={targetTab === 'route' ? 'page' : undefined} onClick={() => setTargetTab('route')}>비행경로</button></nav>
    {targetTab === 'airport' && message && <p className="aa-message" role="status">{message}</p>}
    {targetTab === 'airport' && (!rules ? <p role="status">설정을 불러오는 중…</p> : <div className="aa-settings-layout">
      <aside className="aa-watch-list" aria-label="감시 공항 목록"><div className="aa-section-title"><strong>감시 공항</strong><span>{watches.filter((item) => item.enabled).length}개 사용 중</span></div>
        {watches.map((watch) => { const item = airports.find((a) => a.icao === watch.icao); return <button key={watch.icao} type="button" disabled={busy} className={icao === watch.icao ? 'is-selected' : ''} onClick={() => select(watch.icao)}><strong>{item?.nameKo ?? watch.icao}</strong><small>{watch.icao} · {watch.enabled ? '감시 중' : '일시정지'}</small></button> })}
        {!watches.length && <p>아직 감시하는 공항이 없습니다.</p>}
        <label className="aa-add"><Plus size={16} /> 공항 추가<select value={current ? '' : icao} disabled={busy} onChange={(event) => event.target.value && select(event.target.value)} aria-label="추가할 공항"><option value="">공항 선택</option>{airports.filter((item) => !watches.some((watch) => watch.icao === item.icao)).map((item) => <option key={item.icao} value={item.icao}>{item.nameKo} · {item.icao}</option>)}</select></label>
      </aside>
      <section className="aa-editor"><div className="aa-editor-head"><div><small>{icao}</small><h2>{airport?.nameKo ?? icao}</h2></div><span className={current?.enabled ? 'aa-status is-on' : 'aa-status'}>{current?.enabled ? '감시 중' : current ? '일시정지' : '미등록'}</span></div>
        {current && <div className="aa-source-status"><span>{current.lastEvaluatedAt ? `마지막 평가 ${timeText(current.lastEvaluatedAt, tz)} ${tz}` : '첫 평가 대기 중'}{current.sourceStatus && ` · METAR ${SOURCE_TEXT[current.sourceStatus.metar] ?? '확인 불가'} · 공항경보 ${SOURCE_TEXT[current.sourceStatus.warning] ?? '확인 불가'} · 낙뢰 ${SOURCE_TEXT[current.sourceStatus.lightning] ?? '확인 불가'}`}</span><button type="button" onClick={refreshStatus}>상태 새로고침</button></div>}
        <section><h3>관측값 기준</h3><p>새 METAR 관측이 기준에 해당하면 한 번 알립니다. 해소된 뒤 다시 해당하면 재알림합니다.</p>
          <div className="aa-rules">{METRICS.map(([key, label, unit, fixed]) => <div className="aa-rule" key={key}><label><input type="checkbox" checked={rules[key].enabled} onChange={(event) => update(key, { enabled: event.target.checked })} />{label}</label><div><input aria-label={`${label} 임계값`} type="number" step="1" value={rules[key].threshold} disabled={!rules[key].enabled} onChange={(event) => update(key, { threshold: event.target.value === '' ? '' : Number(event.target.value) })} /><span>{unit}</span>{fixed ? <span>{fixed}</span> : <select aria-label="기온 비교 방향" value={rules.temperature.direction} disabled={!rules.temperature.enabled} onChange={(event) => update('temperature', { direction: event.target.value })}><option value="above">이상</option><option value="below">이하</option></select>}</div></div>)}</div>
          <label className="aa-check"><input type="checkbox" checked={rules.windshear.enabled} onChange={(event) => update('windshear', { enabled: event.target.checked })} />METAR에 급변풍이 보고되면 알림</label>
          <label className="aa-check"><input type="checkbox" checked={rules.fzra?.enabled ?? false} onChange={(event) => update('fzra', { enabled: event.target.checked })} />METAR에 어는 비(FZRA)가 보고되면 알림</label>
        </section>
        <section><h3>TAF 발표</h3><p>새 전문이 발표되면 알립니다. 최초 감시 시작 시 이미 발표된 전문은 기준점으로 저장합니다.</p>
          <label className="aa-check"><input type="checkbox" checked={rules.tafNew?.enabled ?? false} onChange={(event) => update('tafNew', { enabled: event.target.checked })} />새 TAF 발표</label>
          <label className="aa-check"><input type="checkbox" checked={rules.tafAmd?.enabled ?? false} onChange={(event) => update('tafAmd', { enabled: event.target.checked })} />TAF AMD 발표</label>
        </section>
        <section><h3>공식 경보와 낙뢰</h3><label className="aa-check"><input type="checkbox" checked={rules.airportWarning.enabled} onChange={(event) => update('airportWarning', { enabled: event.target.checked })} />공항경보가 새로 유효해지면 알림</label>
          <label className="aa-check"><input type="checkbox" checked={rules.lightning.enabled} onChange={(event) => update('lightning', { enabled: event.target.checked })} />공항 주변 낙뢰 알림</label>
          {rules.lightning.enabled && <div className="aa-inline"><label>반경 <input type="number" min="1" max="50" value={rules.lightning.radiusKm} onChange={(event) => update('lightning', { radiusKm: Number(event.target.value) })} /> km</label><label>최근 <input type="number" min="5" max="120" value={rules.lightning.windowMinutes} onChange={(event) => update('lightning', { windowMinutes: Number(event.target.value) })} /> 분</label><label>최소 <input type="number" min="1" max="100" value={rules.lightning.minCount} onChange={(event) => update('lightning', { minCount: Number(event.target.value) })} /> 건</label></div>}
        </section>
        <section><h3>받는 방법</h3><p>발생 이력은 알림 목록에 항상 남습니다.</p><label className="aa-check"><input type="checkbox" checked={rules.channels.popup} onChange={(event) => update('channels', { popup: event.target.checked })} />웹사이트가 열려 있을 때 팝업</label><label className="aa-check"><input type="checkbox" checked={rules.channels.push} onChange={(event) => update('channels', { push: event.target.checked })} />이 기기로 웹 푸시 발송</label>
          {rules.channels.push && <div className="aa-push"><BellRing size={17} />{pushEnabled ? <span><Check size={15} /> 이 기기 푸시 수신 중</span> : <><span>{pushSupported ? '이 기기의 푸시 수신이 꺼져 있습니다.' : '이 브라우저는 웹 푸시를 지원하지 않습니다.'}</span>{pushSupported && <button type="button" onClick={enablePush}>푸시 수신 켜기</button>}</>}</div>}
        </section>
        <div className="aa-test-alert"><div><strong>실제 수신 테스트</strong><span>저장된 설정을 모의 자료로 판정합니다. 실제 감시 이력에는 남지 않습니다.</span></div>
          <label>시험 종류 <select aria-label="시험할 알림 종류" value={testOptions.includes(testScenario) ? testScenario : testOptions[0] ?? ''} disabled={busy || !testOptions.length} onChange={(event) => setTestScenario(event.target.value)}><option value="" disabled>감시 중인 알림 없음</option>{testOptions.map((scenario) => <option key={scenario} value={scenario}>{TEST_LABELS[scenario]}</option>)}</select></label>
          <button type="button" disabled={busy || !testOptions.length} onClick={runReceptionTest}><BellRing size={16} /> 테스트 알림 보내기</button>
          {lastTest && <a href={`/?alertTest=${encodeURIComponent(lastTest.id)}`}>마지막 시험 내용 보기 · {lastTest.pushStatus === 'sent' ? '기기 발송 접수' : '앱에서 확인'}</a>}
        </div>
        <div className="aa-actions"><button className="aa-primary" type="button" disabled={busy} onClick={() => save(true)}>{current ? '설정 저장 · 감시 시작' : '공항 감시 시작'}</button>{current && <button type="button" disabled={busy} onClick={() => save(!enabled, current.rules)}>{enabled ? '일시정지' : '재개'}</button>}{current && <button type="button" disabled={busy} className="aa-delete" onClick={remove}><Trash2 size={16} /> 삭제</button>}</div>
      </section>
    </div>)}
    {targetTab === 'route' && user && <RouteAlertSettings user={user} initialRouteId={initialRouteId} pushEnabled={pushEnabled} togglePush={togglePush} />}
    {user && <LegacyAlertArchive />}
  </div></main>
}
