import { useState } from 'react'
import airports from '../../../../shared/airports.js'
import { FIELDS, initialRules, initialValues, evaluate } from './model.js'
import DevicePreview from './DevicePreview.jsx'
import AlertDeviceApp from './AlertDeviceApp.jsx'
import RuleFields from './RuleFields.jsx'
import './AlertLabPage.css'

const labels = { active: '조건 해당', clear: '조건 해당 없음', unknown: '자료 없음', off: '사용 안 함' }
const stamp = time => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(time) + ' KST'
const utcPart = value => String(value).padStart(2, '0')
const tafHour = value => {
  const date = new Date(value)
  return `${utcPart(date.getUTCDate())}${utcPart(date.getUTCHours())}`
}
const tafIssue = value => `${tafHour(value)}${utcPart(new Date(value).getUTCMinutes())}Z`
const tafPeriod = (from, to) => `${tafHour(from)}/${tafHour(to)}`
const mockTafText = (icao, issuedAt, validFrom, validTo, amendment) => [
  `TAF${amendment ? ' AMD' : ''} ${icao} ${tafIssue(issuedAt)} ${tafPeriod(validFrom, validTo)}`,
  '  24008KT 9999 SCT030',
  `  TEMPO ${tafPeriod(validFrom + 4 * 60 * 60_000, validFrom + 8 * 60 * 60_000)} 4000 -RA BKN015`,
  `  BECMG ${tafPeriod(validFrom + 10 * 60 * 60_000, validFrom + 12 * 60 * 60_000)} 27012KT=`,
].join('\n')
const metricsFor = (keys, rules, values) => FIELDS.filter(f => keys.includes(f.key)).map(f => ({
  ...f, value: values[f.key], threshold: rules[f.key].threshold, direction: rules[f.key].direction ?? f.direction,
}))

export default function AlertLabPage() {
  const [icao, setIcao] = useState('RKSI')
  const [draft, setDraft] = useState(initialRules)
  const [popupEnabled, setPopupEnabled] = useState(true)
  const [watches, setWatches] = useState({})
  const [values, setValues] = useState(initialValues)
  const [history, setHistory] = useState([])
  const [popup, setPopup] = useState(null)
  const [message, setMessage] = useState('')
  const watch = watches[icao]
  const airport = airports.find(a => a.icao === icao)

  function selectAirport(code) {
    setIcao(code)
    setDraft(watches[code]?.rules ?? initialRules())
    setValues(watches[code]?.values ?? initialValues())
    setPopupEnabled(watches[code]?.popupEnabled ?? true)
    setMessage('')
  }
  function apply(rules, enabled, resume = false, target = icao, input = values, pushEnabled = watches[target]?.pushEnabled ?? true) {
    const values = input
    const icao = target
    const watch = watches[target]
    const airport = airports.find(a => a.icao === target)
    if (FIELDS.some(f => values[f.key] != null && (!Number.isFinite(values[f.key]) || values[f.key] < (f.min ?? 0) || values[f.key] > f.max))) {
      setMessage('모의 관측값의 입력 범위를 확인하세요.'); return
    }
    const now = Date.now()
    const result = evaluate(rules, values, resume ? {} : watch?.memory)
    const entry = { id: crypto.randomUUID(), icao, name: airport.nameKo, time: now,
      metrics: metricsFor(result.entered, rules, values), resolvedKeys: [], read: false }
    setHistory(prev => {
      const updated = prev.map(item => {
        if (item.icao !== icao || item.resolved) return item
        const resolvedKeys = [...new Set([...item.resolvedKeys, ...item.metrics.filter(m => result.states[m.key] === 'clear').map(m => m.key)])]
        const resolved = item.metrics.every(m => resolvedKeys.includes(m.key))
        return { ...item, resolvedKeys, resolved, resolvedAt: resolved ? now : null }
      })
      return result.entered.length ? [entry, ...updated].slice(0, 100) : updated
    })
    if (result.entered.length && (enabled || pushEnabled)) setPopup(entry)
    setWatches(prev => ({ ...prev, [icao]: { rules: structuredClone(rules), values: { ...values }, ...result, popupEnabled: enabled, pushEnabled, paused: false, time: now } }))
    setMessage(result.entered.length ? '새 알림이 발생했습니다.' : result.resolved.length ? '조건이 해소되었습니다.' : '관측을 평가했습니다. 새 알림은 없습니다.')
  }
  function showExampleAlert() {
    const now = Date.now()
    const rules = structuredClone(watch?.rules ?? initialRules())
    const exampleValues = Object.fromEntries(FIELDS.map(f => [f.key,
      f.kind === 'event' ? 1 : Math.max(f.min ?? 0, Math.min(f.max, rules[f.key].threshold + (['미만', '이하'].includes(rules[f.key].direction ?? f.direction) ? -1 : 1) * (f.key === 'visibility' ? 300 : f.key === 'ceiling' ? 100 : 3)))
    ]))
    const result = evaluate(rules, exampleValues)
    if (!result.entered.length) {
      setMessage('현재 조건으로는 입력 범위 안에서 알림을 만들 수 없습니다. 임계값을 확인하세요.')
      return
    }
    const entry = { id: crypto.randomUUID(), icao, name: airport.nameKo, time: now,
      metrics: metricsFor(result.entered, rules, exampleValues), resolvedKeys: [], read: false }
    setHistory(prev => [entry, ...prev].slice(0, 100))
    setPopup(entry)
    setDraft(rules)
    setValues(exampleValues)
    setPopupEnabled(watch?.popupEnabled ?? true)
    setWatches(prev => ({ ...prev, [icao]: { rules, values: exampleValues, ...result, popupEnabled: watch?.popupEnabled ?? true, pushEnabled: watch?.pushEnabled ?? true, paused: false, time: now } }))
    setMessage('설정된 조건에 해당하는 모의 관측으로 알림을 만들었습니다.')
  }
  function save(event) {
    event.preventDefault()
    if (!FIELDS.some(f => draft[f.key].enabled)) { setMessage('감시할 항목을 하나 이상 선택하세요.'); return }
    apply(draft, popupEnabled, true)
  }
  function acknowledge(id) {
    setHistory(prev => prev.map(item => item.id === id ? { ...item, read: true } : item))
    setPopup(null)
  }
  function preset(kind) {
    const rules = watch?.rules ?? draft
    setValues(Object.fromEntries(FIELDS.map(f => [f.key, kind === 'missing' ? null :
      kind === 'boundary' ? rules[f.key].threshold :
      f.kind === 'event' ? (kind === 'hit' ? 1 : 0) : Math.max(f.min ?? 0, rules[f.key].threshold + (['미만', '이하'].includes(rules[f.key].direction ?? f.direction) ? -1 : 1) * (kind === 'hit' ? 1 : -1))])))
  }
  function saveWatch(code, rules, channels) {
    apply(rules, channels.popup, false, code, watches[code]?.values ?? initialValues(), channels.push)
    setIcao(code); setDraft(rules); setPopupEnabled(channels.popup); setValues(watches[code]?.values ?? initialValues())
  }
  function pauseWatch(code) { setWatches(prev => ({ ...prev, [code]: { ...prev[code], paused: !prev[code].paused } })) }
  function deleteWatch(code) {
    setWatches(prev => { const next = { ...prev }; delete next[code]; return next })
    setPopup(null)
    setHistory(prev => prev.map(item => item.icao === code ? { ...item, ended: true } : item))
  }
  function showSigmetExample() {
    const now = Date.now()
    const entry = { id: crypto.randomUUID(), type: 'route', routeId: 'demo-rkss-rkpc', name: '김포국제공항 → 제주국제공항', time: now, read: false, metrics: [], resolvedKeys: [],
      sigmetMessage: '심한 난류 · 설정 경로와 영역 겹침', validFrom: now, validTo: now + 4 * 60 * 60_000 }
    setHistory(prev => [entry, ...prev.filter(item => item.routeId !== entry.routeId)].slice(0, 100))
    setPopup(entry)
    setMessage('김포국제공항 → 제주국제공항 경로와 겹치는 모의 SIGMET 알림을 만들었습니다.')
  }
  function showTafPublicationExample(amendment = false) {
    const now = Date.now()
    const validFrom = Math.ceil(now / (60 * 60_000)) * 60 * 60_000
    const validTo = validFrom + 24 * 60 * 60_000
    const entry = { id: crypto.randomUUID(), type: 'taf_publication', icao, name: airport.nameKo,
      time: now, read: false, metrics: [], resolvedKeys: [], headline: amendment ? 'TAF AMD 발표' : '새 TAF 발표',
      tafText: mockTafText(icao, now, validFrom, validTo, amendment), validFrom, validTo }
    setHistory(prev => [entry, ...prev.filter(item => !(item.type === entry.type && item.icao === icao))].slice(0, 100))
    setPopup(entry)
    setMessage(`${airport.nameKo}의 모의 ${amendment ? 'TAF AMD' : '새 TAF'} 발표 알림을 만들었습니다.`)
  }
  function showWeatherPhenomenonExample() {
    const entry = { id: crypto.randomUUID(), type: 'weather_phenomenon', icao, name: airport.nameKo,
      time: Date.now(), read: false, metrics: [], resolvedKeys: [], headline: '어는 비(FZRA) 관측',
      summary: 'METAR 현재 기상' }
    setHistory(prev => [entry, ...prev.filter(item => !(item.type === entry.type && item.icao === icao))].slice(0, 100))
    setPopup(entry)
    setMessage(`${airport.nameKo}의 모의 METAR 특이기상 알림을 만들었습니다.`)
  }
  function showAirportWarningExample() {
    const now = Date.now()
    const entry = {
      id: crypto.randomUUID(), type: 'airport_warning', icao, name: airport.nameKo,
      time: now, read: false, metrics: [], resolvedKeys: [], warningName: '강풍경보',
      validFrom: now, validTo: now + 2 * 60 * 60_000,
    }
    setHistory(prev => [entry, ...prev.filter(item => !(item.type === entry.type && item.icao === entry.icao))].slice(0, 100))
    setPopup(entry)
    setMessage(`${airport.nameKo}의 모의 강풍경보 알림을 만들었습니다.`)
  }
  function showLightningExample() {
    const entry = {
      id: crypto.randomUUID(), type: 'lightning', icao, name: airport.nameKo,
      time: Date.now(), read: false, metrics: [], resolvedKeys: [],
      windowMinutes: 30, radiusKm: 10, count: 3, nearestDistanceKm: 5.2,
    }
    setHistory(prev => [entry, ...prev.filter(item => !(item.type === entry.type && item.icao === entry.icao))].slice(0, 100))
    setPopup(entry)
    setMessage(`${airport.nameKo} 주변의 모의 낙뢰 관측 알림을 만들었습니다.`)
  }
  const activePopup = history.find(item => item.id === popup?.id && !item.resolved && !item.ended) ?? null
  const deviceProps = { watches, history, onAcknowledge: acknowledge, onDismiss: () => setPopup(null), onSaveWatch: saveWatch, onPauseWatch: pauseWatch, onDeleteWatch: deleteWatch }
  const popupFor = phone => {
    if (!activePopup) return null
    return activePopup.type || watches[activePopup.icao]?.[phone ? 'pushEnabled' : 'popupEnabled'] ? activePopup : null
  }
  const scenarios = [
    { label: 'METAR', description: '관측 임계값 또는 선택한 기상현상', actions: [['임계값 초과', showExampleAlert], ['어는 비(FZRA)', showWeatherPhenomenonExample]] },
    { label: 'TAF', description: '예보 내용의 악화 판정 없이 발표만 알림', actions: [['새 TAF 발표', () => showTafPublicationExample()], ['TAF AMD 발표', () => showTafPublicationExample(true)]] },
    { label: '공항경보', description: '감시 공항에 발효된 경보', actions: [['공항경보 발표', showAirportWarningExample]] },
    { label: '낙뢰', description: '감시 공항 주변의 관측 낙뢰', actions: [['공항 주변 낙뢰', showLightningExample]] },
    { label: 'SIGMET', description: '설정 경로와 겹치는 SIGMET 영역', actions: [['경로상 SIGMET', showSigmetExample]] },
  ]
  const standalone = new URLSearchParams(window.location.search).get('preview')
  if (standalone === 'phone' || standalone === 'desktop') return <div className="alert-lab al-standalone">
    <div className="al-demo-toolbar"><a href="/concepts/alerts">← 실험실</a><span>모의 화면</span>{scenarios.flatMap(scenario => scenario.actions).map(([label, show]) => <button key={label} onClick={show}>{label}</button>)}</div>
    <AlertDeviceApp {...deviceProps} phone={standalone === 'phone'} popup={popupFor(standalone === 'phone')} />
  </div>
  return <main className="alert-lab">
    <header><div><p className="al-eyebrow">알림 실험실</p><h1>다섯 가지 알림 확인</h1>
      <p>METAR · TAF 발표 · 공항경보 · 낙뢰 · 경로상 SIGMET을 PC와 휴대폰에서 시험합니다. 모든 자료는 모의이며 실제 푸시는 발송하지 않습니다.</p></div><a href="/">지도로 돌아가기</a></header>
    <div className="al-workbench">
      <div className="al-controls">
        <section className="al-panel al-scenarios" aria-label="알림 시험">
          <h2>알림 띄워보기</h2>
          <label className="al-airport">감시 공항<select value={icao} onChange={e => selectAirport(e.target.value)}>{airports.map(a => <option key={a.icao} value={a.icao}>{a.nameKo} · {a.icao}</option>)}</select></label>
          <p className="al-hint">SIGMET은 예시 경로 김포국제공항 → 제주국제공항을 사용합니다.</p>
          <div className="al-scenario-list">{scenarios.map(scenario => <div className="al-scenario" key={scenario.label}>
            <strong>{scenario.label}</strong><p>{scenario.description}</p>
            <div className="al-scenario-actions">{scenario.actions.map(([label, show]) => <button key={label} onClick={show}>{label}</button>)}</div>
          </div>)}</div>
          <p className="al-feedback" role="status">{message}</p>
        </section>
        <details className="al-panel al-metars-test">
          <summary>METAR 조건·관측값 직접 조정</summary>
          <p className="al-hint">선택한 공항의 수치 임계값과 모의 관측을 바꿔 재발·해소를 확인할 수 있습니다.</p>
          <form onSubmit={save}>
            <RuleFields rules={draft} onChange={setDraft} />
            <label className="al-channel-check"><input type="checkbox" checked={popupEnabled} onChange={e => setPopupEnabled(e.target.checked)} />PC 팝업 표시</label>
            <button className="al-primary" type="submit">{watch ? '조건 적용' : '감시 시작'}</button>
          </form>
          <h3>모의 관측</h3>
          <div className="al-presets">{[['clear', '조건 해소값'], ['hit', '조건 해당값'], ['boundary', '경계값'], ['missing', '자료 없음']].map(([key, label]) => <button key={key} onClick={() => preset(key)}>{label}</button>)}</div>
          <form onSubmit={e => { e.preventDefault(); apply(watch.rules, watch.popupEnabled) }}>
            {FIELDS.map(f => <label className="al-rule" key={f.key}><span>{f.label} ({f.unit})</span><input type="number" min={f.min ?? 0} max={f.max} step="1" placeholder="자료 없음" value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value === '' ? null : Number(e.target.value) })} /></label>)}
            <button className="al-primary" disabled={!watch || watch.paused}>이 관측으로 평가</button>
            {watch && <button type="button" onClick={() => { setWatches(prev => ({ ...prev, [icao]: { ...watch, paused: !watch.paused } })); setMessage(watch.paused ? '감시를 재개했습니다. 관측을 평가하세요.' : '감시를 일시정지했습니다.') }}>{watch.paused ? '감시 재개' : '일시정지'}</button>}
          </form>
          {watch && <div className="al-evaluation"><h3>마지막 평가 · {stamp(watch.time)}</h3>
            {FIELDS.filter(f => watch.rules[f.key].enabled).map(f => <div className={`al-state ${watch.states[f.key] === 'active' ? 'is-active' : ''}`} key={f.key}><strong>{f.label} · {labels[watch.states[f.key]]}</strong><span>{watch.values[f.key] ?? '—'} {f.unit} / 기준 {watch.rules[f.key].threshold} {f.unit} {f.direction}</span></div>)}
            <p className="al-hint">자료 없음은 조건 해소로 처리하지 않습니다.</p>
          </div>}
        </details>
      </div>
      <section className="al-preview-stage" aria-label="기기별 알림 미리보기">
        <div className="al-stage-heading"><h2>수신 화면</h2><p>왼쪽에서 알림을 선택하면 PC 팝업과 휴대폰 푸시 모양을 함께 확인할 수 있습니다.</p></div>
        <DevicePreview {...deviceProps} kind="desktop" popup={popupFor(false)} />
        <DevicePreview {...deviceProps} kind="phone" popup={popupFor(true)} />
      </section>
    </div>
  </main>
}
