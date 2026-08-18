import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  TabList, Tab, Button, MessageBar, MessageBarBody, makeStyles,
} from '../../shared/ui/fluent.js'

import usePersonalSettings from './usePersonalSettings.js'
import { routeDistanceNm } from './lib/haversine.js'
import { computeEtaIso } from '../route-briefing/lib/etaCalc.js'
import { formatZAndKst, isoToLocalInputValue, localInputToIso } from './lib/timeFormat.js'

// 관제권 VFR 최저치(운고 1500ft·시정 5000m). flight-category.js의 IFR 경계와 같은 값이라
// 이 프리셋을 쓰면 "VFR로 못 가는 상태"가 곧 내 미니마 미만이 된다.
const VFR_PRESET = { ceilingFt: 1500, visibilityM: 5000 }
// CAT-I 정밀접근 최저치(DH 200ft · RVR 550m).
const CAT1_PRESET = { ceilingFt: 200, visibilityM: 550 }
const WATCH_OPTIONS = [
  { label: '2시간 전', minutes: 120 },
  { label: '3시간 전', minutes: 180 },
  { label: '4시간 전', minutes: 240 },
  { label: '5시간 전', minutes: 300 },
  { label: '6시간 전', minutes: 360 },
]

const useStyles = makeStyles({
  surface: { width: '520px', maxWidth: '94vw' },
  tabBody: { display: 'flex', flexDirection: 'column', gap: 'var(--space-m)', paddingTop: 'var(--space-m)' },
  row: { display: 'flex', gap: 'var(--space-m)', alignItems: 'flex-end', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--space-xxs)', flex: '1 1 140px' },
  label: { fontSize: 'var(--fs-200)', color: 'var(--text-2)', fontWeight: 'var(--fw-medium)' },
  input: {
    padding: 'var(--space-s)', border: '1px solid var(--stroke-1)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--fs-300)', minHeight: 'var(--touch-min)', fontFamily: 'var(--font-base)',
  },
  presetRow: { display: 'flex', gap: 'var(--space-s)' },
  hint: { fontSize: 'var(--fs-200)', color: 'var(--text-3)' },
  details: { border: '1px solid var(--stroke-2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-s) var(--space-m)' },
  summary: { cursor: 'pointer', fontSize: 'var(--fs-200)', color: 'var(--text-2)', fontWeight: 'var(--fw-medium)' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginTop: 'var(--space-s)', fontSize: 'var(--fs-200)' },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', maxHeight: '220px', overflowY: 'auto' },
  flightRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-s)', padding: 'var(--space-s)',
    border: '1px solid var(--stroke-2)', borderRadius: 'var(--radius-md)',
  },
  flightBody: { flex: 1, minWidth: 0 },
  flightName: { fontSize: 'var(--fs-200)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-1)' },
  flightTime: { fontSize: 'var(--fs-100)', color: 'var(--text-3)' },
  chip: {
    flex: '0 0 auto', fontSize: 'var(--fs-100)', fontWeight: 'var(--fw-semibold)',
    padding: '2px var(--space-xs)', borderRadius: 'var(--radius-sm)',
  },
  empty: { padding: 'var(--space-l)', textAlign: 'center', color: 'var(--text-3)', fontSize: 'var(--fs-200)' },
})

function MinimaTab({ s, minima, saveMinima }) {
  const [ceilingFt, setCeilingFt] = useState('')
  const [visibilityM, setVisibilityM] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    setCeilingFt(minima?.ceilingFt != null ? String(minima.ceilingFt) : '')
    setVisibilityM(minima?.visibilityM != null ? String(minima.visibilityM) : '')
  }, [minima])

  function applyPreset(p) { setCeilingFt(String(p.ceilingFt)); setVisibilityM(String(p.visibilityM)) }

  async function handleSave() {
    const c = ceilingFt === '' ? null : Number(ceilingFt)
    const v = visibilityM === '' ? null : Number(visibilityM)
    const result = await saveMinima(c, v)
    setMsg(result.ok ? { intent: 'success', text: '저장했습니다.' } : { intent: 'error', text: result.error })
  }

  const unset = minima != null && minima.ceilingFt == null && minima.visibilityM == null

  return (
    <div className={s.tabBody}>
      {unset && <div className={s.hint}>미설정 — 기본 VFR 기준(운고 1000ft / 시정 5000m) 적용 중</div>}
      <div className={s.row}>
        <label className={s.field}>
          <span className={s.label}>운고 (ft)</span>
          <input className={s.input} type="number" min="0" max="60000" value={ceilingFt}
            onChange={(e) => setCeilingFt(e.target.value)} aria-label="개인 미니마 운고(ft)" />
        </label>
        <label className={s.field}>
          <span className={s.label}>시정 (m)</span>
          <input className={s.input} type="number" min="0" max="10000" value={visibilityM}
            onChange={(e) => setVisibilityM(e.target.value)} aria-label="개인 미니마 시정(m)" />
        </label>
      </div>
      <div className={s.presetRow}>
        <Button size="small" onClick={() => applyPreset(VFR_PRESET)}>VFR (1500ft/5000m)</Button>
        <Button size="small" onClick={() => applyPreset(CAT1_PRESET)}>CAT-I (200ft/550m)</Button>
      </div>
      {msg && (
        <MessageBar intent={msg.intent}><MessageBarBody>{msg.text}</MessageBarBody></MessageBar>
      )}
      <Button appearance="primary" onClick={handleSave}>저장</Button>
    </div>
  )
}

function AlertsTab({ s, templates, flights, registerAlert, deleteAlert }) {
  const [templateId, setTemplateId] = useState('')
  const [etdLocal, setEtdLocal] = useState('')
  const [etaLocal, setEtaLocal] = useState('')
  const [watchMin, setWatchMin] = useState(120)
  const [confirmNoChange, setConfirmNoChange] = useState(false)
  const [msg, setMsg] = useState(null)
  const lastAutoEta = useRef('')

  // ETD/템플릿 변경 시 ETA 자동계산(geometry+속도 있을 때만). 사용자가 손댄 값은 덮지 않음.
  useEffect(() => {
    const tpl = templates.find((t) => String(t.id) === String(templateId))
    if (!tpl || !etdLocal) return
    const distanceNm = routeDistanceNm(tpl.routeGeometry?.coordinates)
    if (!distanceNm || !tpl.cruiseSpeedKt) return
    const etdIso = localInputToIso(etdLocal)
    const etaIso = computeEtaIso(etdIso, distanceNm, tpl.cruiseSpeedKt)
    if (!etaIso) return
    const local = isoToLocalInputValue(etaIso)
    if (etaLocal === '' || etaLocal === lastAutoEta.current) {
      setEtaLocal(local)
      lastAutoEta.current = local
    }
  }, [templateId, etdLocal, templates]) // eslint-disable-line react-hooks/exhaustive-deps

  function templateLabel(t) {
    if (t.name) return t.name
    const rf = t.routeForm || {}
    return `${rf.departureAirport || '?'}→${rf.arrivalAirport || '?'}`
  }

  async function handleRegister() {
    if (!templateId || !etdLocal) { setMsg({ intent: 'error', text: '템플릿과 ETD를 입력하세요.' }); return }
    const body = {
      templateId: Number(templateId),
      etd: localInputToIso(etdLocal),
      eta: localInputToIso(etaLocal),
      alertStartMinBeforeEtd: watchMin,
      sendNoChangeConfirm: confirmNoChange,
    }
    const result = await registerAlert(body)
    if (!result.ok) { setMsg({ intent: 'error', text: result.error }); return }
    setMsg({ intent: 'success', text: '등록했습니다.' })
    setTemplateId(''); setEtdLocal(''); setEtaLocal(''); lastAutoEta.current = ''
  }

  return (
    <div className={s.tabBody}>
      <div className={s.row}>
        <label className={s.field}>
          <span className={s.label}>경로 템플릿</span>
          <select className={s.input} value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="경로 템플릿 선택">
            <option value="">선택하세요</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{templateLabel(t)}</option>)}
          </select>
        </label>
        <label className={s.field}>
          <span className={s.label}>ETD</span>
          <input className={s.input} type="datetime-local" value={etdLocal}
            onChange={(e) => setEtdLocal(e.target.value)} aria-label="출발 예정시각 ETD" />
        </label>
        <label className={s.field}>
          <span className={s.label}>ETA (예상·수정)</span>
          <input className={s.input} type="datetime-local" value={etaLocal}
            onChange={(e) => setEtaLocal(e.target.value)} aria-label="도착 예정시각 ETA, 예상값 수정 가능" />
        </label>
      </div>

      <details className={s.details}>
        <summary className={s.summary}>고급 설정</summary>
        <div className={s.row} style={{ marginTop: 'var(--space-s)' }}>
          <label className={s.field}>
            <span className={s.label}>감시 시작</span>
            <select className={s.input} value={watchMin} onChange={(e) => setWatchMin(Number(e.target.value))} aria-label="감시 시작 시점">
              {WATCH_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <label className={s.checkRow}>
          <input type="checkbox" checked={confirmNoChange} onChange={(e) => setConfirmNoChange(e.target.checked)} />
          <span>변화 없어도 이상없음 확인 알림 받기</span>
        </label>
      </details>

      {msg && <MessageBar intent={msg.intent}><MessageBarBody>{msg.text}</MessageBarBody></MessageBar>}
      <Button appearance="primary" onClick={handleRegister}>등록</Button>

      <div className={s.list}>
        {flights.length === 0
          ? <div className={s.empty}>등록된 비행 알림이 없습니다</div>
          : flights.map((f) => (
            <div key={f.id} className={s.flightRow}>
              <span className={s.flightBody}>
                <div className={s.flightName}>{f.name}</div>
                <div className={s.flightTime}>
                  ETD {formatZAndKst(f.etd)}{f.eta ? ` · ETA ${formatZAndKst(f.eta)}` : ''}
                </div>
              </span>
              <span
                className={s.chip}
                style={f.active
                  ? { color: 'var(--level-amber)', background: 'var(--level-amber-bg)' }
                  : { color: 'var(--level-gray)', background: 'var(--level-gray-bg)' }}
              >
                {f.active ? '감시중' : '대기'}
              </span>
              <Button size="small" onClick={() => deleteAlert(f.id)} aria-label={`${f.name} 알림 삭제`}>삭제</Button>
            </div>
          ))}
      </div>
    </div>
  )
}

// #13 개인설정 콘텐츠 — 설정 모달의 개인설정 탭에서 렌더링.
export function PersonalSettingsContent() {
  const s = useStyles()
  const [tab, setTab] = useState('minima')
  const { minima, templates, flights, saveMinima, registerAlert, deleteAlert } = usePersonalSettings()

  return (
    <>
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value)}>
        <Tab value="minima">기상 미니마</Tab>
        <Tab value="alerts">비행 알림</Tab>
      </TabList>
      {tab === 'minima' && <MinimaTab s={s} minima={minima} saveMinima={saveMinima} />}
      {tab === 'alerts' && <AlertsTab s={s} templates={templates} flights={flights} registerAlert={registerAlert} deleteAlert={deleteAlert} />}
    </>
  )
}

// 기존 단독 진입 호환용. 새 UI에서는 SettingsModal의 개인설정 탭을 사용한다.
export default function PersonalSettingsPanel({ open, onOpenChange }) {
  const s = useStyles()
  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogTitle>개인설정</DialogTitle>
          <DialogContent><PersonalSettingsContent /></DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
