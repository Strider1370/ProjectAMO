import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BellRing, Check, X } from 'lucide-react'
import airports from '../../../../shared/airports.js'
import { useAuth } from '../auth/AuthContext.jsx'
import usePersonalSettings from '../personal/usePersonalSettings.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import AlertIcon from './AlertIcon.jsx'
import { clock } from './AlertCard.jsx'
import { useCurrentMetars, Switch } from './AlertWatchesPage.jsx'
import { METAR_PRESETS, ceilingText, metarNow, presetMatches, ruleState, visibilityText } from './alertModel.js'
import './airportAlerts.css'

const API = '/api/me/airport-watches'
const METRICS = [
  { key: 'visibility', label: '시정', unit: 'm', fixed: '미만', icon: 'vis' },
  { key: 'ceiling', label: '운고', unit: 'ft', fixed: '미만', icon: 'ceiling' },
  { key: 'wind', label: '풍속', unit: 'kt', fixed: '이상', icon: 'wind' },
  { key: 'gust', label: '돌풍', unit: 'kt', fixed: '이상', icon: 'wind' },
  { key: 'temperature', label: '기온', unit: '℃', fixed: null, icon: 'temp' },
]
const EVENTS = [
  { key: 'tafNew', label: '새 TAF 발표', note: '정시 TAF가 나올 때마다 전문 그대로', icon: 'taf' },
  { key: 'tafAmd', label: 'TAF AMD 발표', note: null, icon: 'taf' },
  { key: 'airportWarning', label: '공항경보 발효', note: '강풍·윈드시어·대설 등이 새로 유효해질 때', icon: 'warning' },
]
const TEST_LABELS = { metar: 'METAR 기준', windshear: '급변풍 보고', fzra: '어는 비 보고', taf_new: '새 TAF 발표', taf_amd: 'TAF AMD 발표', airport_warning: '공항경보 발효', lightning: '주변 낙뢰' }
const clone = (value) => JSON.parse(JSON.stringify(value))
const nowText = (key, now) => {
  if (!now) return '지금 자료 없음'
  if (key === 'visibility') return `지금 ${visibilityText(now.visibilityM)}`
  if (key === 'ceiling') return `지금 ${ceilingText(now.ceilingFt)}`
  if (key === 'wind') return now.windKt == null ? '지금 자료 없음' : `지금 ${now.windKt}kt`
  if (key === 'gust') return now.gustKt == null ? '지금 돌풍 없음' : `지금 G${now.gustKt}kt`
  return now.tempC == null ? '지금 자료 없음' : `지금 ${now.tempC}℃`
}

// 공항 하나의 감시 편집. 지금 METAR 옆에서 기준을 정하고, 아래 고정된 저장 줄로 저장한다.
export default function AirportAlertSettingsPage({ initialIcao, watches, onBack, onClose, onLogin }) {
  const { user, loading: authLoading } = useAuth()
  const { tz } = useTimeZone()
  const { pushEnabled } = usePersonalSettings()
  const metars = useCurrentMetars()
  const icao = initialIcao ?? 'RKSI'
  const current = watches?.airport.watches.find((item) => item.icao === icao) ?? null
  const defaults = watches?.airport.defaults
  const savedRules = current?.rules ?? defaults ?? null
  const [rules, setRules] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [testScenario, setTestScenario] = useState('')
  const [lastTest, setLastTest] = useState(null)
  const airport = airports.find((item) => item.icao === icao)
  const now = metarNow(metars[icao], icao)

  useEffect(() => { if (savedRules && !rules) setRules(clone(savedRules)) }, [savedRules, rules])
  useEffect(() => {
    if (!user || !current?.enabled) return undefined
    let cancelled = false
    fetch(`/api/me/alert-tests/latest?icao=${encodeURIComponent(icao)}`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : { test: null })
      .then((data) => { if (!cancelled) setLastTest(data.test) }).catch(() => {})
    return () => { cancelled = true }
  }, [user, icao, current?.enabled])

  const changes = useMemo(() => {
    if (!rules || !savedRules) return 0
    return Object.keys(rules).filter((key) => JSON.stringify(rules[key]) !== JSON.stringify(savedRules[key])).length
  }, [rules, savedRules])

  if (!authLoading && !user) return <main className="aa-page"><div className="aa-shell"><button type="button" onClick={onBack ?? onClose}>← 알림으로</button><h1>알림 설정</h1><p>감시 대상을 저장하려면 로그인하세요.</p><button type="button" onClick={onLogin}>로그인</button></div></main>
  if (!rules) return <main className="aa-page"><div className="aa-shell"><p role="status">{watches?.error || '설정을 불러오는 중…'}</p></div></main>

  const update = (key, patch) => setRules((r) => ({ ...r, [key]: { ...r[key], ...patch } }))
  const applyPreset = (preset) => setRules((r) => ({ ...r, visibility: { ...r.visibility, enabled: true, threshold: preset.visibility }, ceiling: { ...r.ceiling, enabled: true, threshold: preset.ceiling } }))
  const testOptions = current?.enabled ? [
    ...(['visibility', 'ceiling', 'wind', 'gust', 'temperature'].some((key) => current.rules[key]?.enabled) ? ['metar'] : []),
    ...(current.rules.windshear?.enabled ? ['windshear'] : []), ...(current.rules.fzra?.enabled ? ['fzra'] : []),
    ...(current.rules.tafNew?.enabled ? ['taf_new'] : []), ...(current.rules.tafAmd?.enabled ? ['taf_amd'] : []),
    ...(current.rules.airportWarning?.enabled ? ['airport_warning'] : []), ...(current.rules.lightning?.enabled ? ['lightning'] : []),
  ] : []

  async function save(nextEnabled, nextRules = rules) {
    if (nextEnabled && !Object.entries(nextRules).some(([key, rule]) => key !== 'channels' && rule.enabled)) { setMessage('감시할 조건을 하나 이상 고르세요.'); return }
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`${API}/${icao}`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled, rules: nextRules }) })
      if (!res.ok) throw new Error('설정을 저장하지 못했습니다. 입력값을 확인하세요.')
      await watches.changed()
      setRules(clone(nextRules))
      setMessage(!current ? '감시를 시작했습니다. 서버의 다음 확인에서 지금 관측을 봅니다.' : nextEnabled ? '저장했습니다.' : '감시를 일시정지했습니다.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`${API}/${icao}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('삭제하지 못했습니다.')
      await watches.changed()
      onBack?.()
    } catch (error) { setMessage(error.message); setBusy(false) }
  }
  async function runTest() {
    if (!testOptions.length) return
    setBusy(true); setMessage('')
    try {
      let endpoint
      if (pushEnabled) endpoint = (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint
      const res = await fetch('/api/me/alert-tests', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ icao, scenario: testScenario || testOptions[0], ...(endpoint ? { endpoint } : {}) }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error === 'device_not_subscribed' ? '이 기기의 푸시 구독이 만료됐습니다. 다시 켜 주세요.'
        : result.error === 'test_rate_limited' ? '짧은 시간에 시험을 많이 실행했습니다. 잠시 후 다시 시도하세요.'
          : result.error === 'condition_not_met' ? '현재 설정으로는 시험 조건이 발동하지 않습니다. 기준값을 확인하세요.' : '시험 알림을 만들지 못했습니다.')
      setLastTest(result.test)
      if (window.innerWidth > 719) window.dispatchEvent(new CustomEvent('airport-alert-preview', { detail: {
        id: `test:${result.test.id}`, testId: result.test.id, source: 'airport', test: true, airportIcao: icao,
        routeName: airport?.nameKo ?? icao, type: result.test.kind, payload: result.test.payload, detectedAt: result.test.createdAt } }))
      setMessage(result.test.pushStatus === 'sent' ? '시험 알림을 이 기기로 보냈습니다. 수신과 눌렀을 때 이동을 확인하세요.'
        : result.test.pushStatus === 'not_requested' ? '모의 판정이 발동했습니다. 휴대폰 푸시로 받아 보려면 휴대폰에서 푸시를 켠 뒤 그 휴대폰에서 시험하세요.'
          : '모의 판정은 발동했지만 푸시 발송에 실패했습니다. 구독 상태를 확인하세요.')
    } catch (error) { setMessage(error.message || '시험을 실행하지 못했습니다.') } finally { setBusy(false) }
  }

  const status = current ? (current.enabled ? '감시 중' : '일시정지') : '미등록'
  const lightning = rules.lightning
  return <main className="aa-page has-savebar"><div className="aa-shell">
    <header className="aa-head">
      <button type="button" className="aa-back" aria-label="감시 대상으로" onClick={onBack}><ArrowLeft size={18} /></button>
      <h1>{airport?.nameKo ?? icao}</h1><code className="aa-head-code">{icao}</code>
      <span className={`aa-pill${current?.enabled ? ' is-on' : ''}`}>{status}</span>
      {current && <Switch checked={current.enabled} label="이 공항 감시" disabled={busy} onChange={(next) => save(next, current.rules)} />}
      <button type="button" className="aa-close" aria-label="알림 패널 닫기" onClick={onClose}><X size={18} /></button>
    </header>
    <div className="aa-now">
      <span>{now?.category && <span className={`aa-cat is-${now.category === 'MVFR' ? 'vfr' : now.category.toLowerCase()}`}>{now.category === 'MVFR' ? 'VFR' : now.category}</span>}
        지금 METAR{now?.observedAt ? ` · ${clock(now.observedAt, tz)} ${tz === 'UTC' ? 'UTC' : 'KST'}` : ''}{current?.lastEvaluatedAt ? ` · ${clock(current.lastEvaluatedAt, tz)} 확인` : ''}</span>
      <code>{metars[icao]?.header?.raw_text ?? 'METAR 없음'}</code>
    </div>
    {message && <p className="aa-message" role="status">{message}</p>}

    <section className="aa-box" aria-labelledby="aa-metar-title">
      <div className="aa-box-head"><h2 id="aa-metar-title" className="aa-box-title">관측 기준 (METAR)</h2><small>기준에 들면 한 번, 벗어났다 다시 들면 또 알림</small></div>
      <div className="aa-presets" role="group" aria-label="기준 묶음">
        {METAR_PRESETS.map((preset) => <button key={preset.id} type="button" aria-pressed={presetMatches(rules, preset)} onClick={() => applyPreset(preset)}>{preset.label}<small>{preset.visibility}m · {preset.ceiling}ft</small></button>)}
      </div>
      {METRICS.map((m) => {
        const rule = rules[m.key]
        const state = ruleState(m.key, rule, now)
        return <div className={`aa-rule-row${rule.enabled ? '' : ' is-off'}`} key={m.key}>
          <input type="checkbox" checked={rule.enabled} aria-label={`${m.label} 사용`} onChange={(event) => update(m.key, { enabled: event.target.checked })} />
          <span className="aa-rule-name"><AlertIcon kind={m.icon} size={16} />{m.label}</span>
          <span className="aa-rule-value"><input type="number" aria-label={`${m.label} 기준`} value={rule.threshold} disabled={!rule.enabled}
            onChange={(event) => update(m.key, { threshold: event.target.value === '' ? '' : Number(event.target.value) })} />{m.unit}
            {m.fixed ? <span>{m.fixed}</span> : <select aria-label="기온 비교 방향" value={rule.direction} disabled={!rule.enabled} onChange={(event) => update(m.key, { direction: event.target.value })}><option value="above">이상</option><option value="below">이하</option></select>}</span>
          <span className={`aa-rule-now${state === 'hit' ? ' is-hit' : state === 'ok' ? ' is-ok' : ''}`}>{state === 'ok' && <Check size={12} aria-hidden="true" />}{nowText(m.key, now)}</span>
        </div>
      })}
      <div className="aa-toggle-chips">
        <label className={rules.windshear.enabled ? 'is-on' : undefined}><input type="checkbox" checked={rules.windshear.enabled} onChange={(event) => update('windshear', { enabled: event.target.checked })} />급변풍 (WS) 보고</label>
        <label className={rules.fzra?.enabled ? 'is-on' : undefined}><input type="checkbox" checked={rules.fzra?.enabled ?? false} onChange={(event) => update('fzra', { enabled: event.target.checked })} />어는 비 (FZRA) 보고</label>
      </div>
    </section>

    <section className="aa-box" aria-labelledby="aa-event-title">
      <h2 id="aa-event-title" className="aa-box-title">발표·경보</h2>
      {EVENTS.map((e) => <div className="aa-setting-row" key={e.key}>
        <AlertIcon kind={e.icon} size={18} />
        <span>{e.label}{e.note && <small>{e.note}</small>}</span>
        <Switch checked={rules[e.key]?.enabled ?? false} label={e.label} onChange={(next) => update(e.key, { enabled: next })} />
      </div>)}
      <div className="aa-setting-row">
        <AlertIcon kind="lightning" size={18} />
        <span>주변 낙뢰</span>
        <Switch checked={lightning.enabled} label="주변 낙뢰" onChange={(next) => update('lightning', { enabled: next })} />
      </div>
      {lightning.enabled && <p className="aa-sentence">반경 <input type="number" min="1" max="50" aria-label="반경 km" value={lightning.radiusKm} onChange={(event) => update('lightning', { radiusKm: Number(event.target.value) })} />km 안에서 최근
        <input type="number" min="5" max="120" aria-label="최근 분" value={lightning.windowMinutes} onChange={(event) => update('lightning', { windowMinutes: Number(event.target.value) })} />분 동안
        <input type="number" min="1" max="100" aria-label="최소 건수" value={lightning.minCount} onChange={(event) => update('lightning', { minCount: Number(event.target.value) })} />건 이상</p>}
    </section>

    <section className="aa-box" aria-labelledby="aa-test-title">
      <div className="aa-box-head"><h2 id="aa-test-title" className="aa-box-title">시험 알림</h2></div>
      <p className="aa-box-note">저장한 설정을 모의 자료로 판정해 이 기기로 보냅니다. 실제 알림 이력에는 남지 않습니다.</p>
      <div className="aa-test-row">
        <select aria-label="시험할 알림 종류" value={testOptions.includes(testScenario) ? testScenario : testOptions[0] ?? ''} disabled={busy || !testOptions.length} onChange={(event) => setTestScenario(event.target.value)}>
          {!testOptions.length && <option value="">저장한 감시가 있어야 시험할 수 있습니다</option>}
          {testOptions.map((scenario) => <option key={scenario} value={scenario}>{TEST_LABELS[scenario]}</option>)}
        </select>
        <button type="button" disabled={busy || !testOptions.length} onClick={runTest}><BellRing size={16} aria-hidden="true" />내 기기로 시험 받기</button>
        {lastTest && <a href={`/?alertTest=${encodeURIComponent(lastTest.id)}`}>마지막 시험 보기</a>}
      </div>
    </section>
    {current && <button type="button" className="aa-delete" disabled={busy} onClick={remove}>이 공항 감시 삭제</button>}
  </div>
  <div className="aa-savebar">
    <span>{!current ? '아직 감시하지 않는 공항입니다' : changes ? `저장하지 않은 변경 ${changes}개` : '저장됨'}</span>
    {current && changes > 0 && <button type="button" disabled={busy} onClick={() => setRules(clone(savedRules))}>되돌리기</button>}
    <button type="button" className="aa-primary" disabled={busy || (current && !changes)} onClick={() => save(current ? current.enabled : true)}>{current ? '변경사항 저장' : '공항 감시 시작'}</button>
  </div></main>
}
