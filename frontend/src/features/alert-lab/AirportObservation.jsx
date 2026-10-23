import { ArrowLeft } from 'lucide-react'
import airports from '../../../../shared/airports.js'
import { FIELDS } from './model.js'

const valueText = (f, value) => value == null ? '자료 없음' : f.kind === 'event' ? value ? '보고 있음' : '보고 없음' : `${value.toLocaleString('ko-KR')} ${f.unit}`
export default function AirportObservation({ code, watch, event, onBack }) {
  const name = airports.find(a => a.icao === code)?.nameKo ?? code
  const values = watch?.values ?? {}
  const highlights = new Set(event?.metrics.map(m => m.key) ?? [])
  const date = watch ? new Date(watch.time) : null
  const stamp = date ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour:'2-digit', minute:'2-digit', hour12:false }).format(date) : '—'
  // Deliberately a decoded view: don't fabricate a full official METAR from partial inputs.
  return <section className="ad-airport-observation" aria-label="공항 METAR 패널">
    {onBack && <button className="ad-back" onClick={onBack}><ArrowLeft size={20} />뒤로</button>}
    <span className="ad-kicker">{code} · 모의 공항 패널</span><h1>{name}</h1>
    <div className="ad-observation-tab">METAR <span>관측값</span></div>
    <p className="ad-management-note">모의 관측 {stamp} KST · 실제 METAR 원문이 아닌 실험실 입력값입니다.</p>
    {event && <p className="ad-jump-context">알림 항목: {event.metrics.map(m => m.label).join(' · ')}<br /><small>강조된 값은 마지막 모의 관측입니다. 설정 기준은 알림 설정의 수정에서 확인할 수 있습니다.</small></p>}
    {!watch && <p>현재 모의 관측이 없습니다. 실험실의 임계값 초과 버튼으로 확인할 수 있습니다.</p>}
    <div className="ad-observation-grid">{FIELDS.map(f => <div key={f.key} className={highlights.has(f.key) ? 'is-highlighted' : ''}><span>{f.label}</span><strong>{valueText(f, values[f.key])}</strong>{highlights.has(f.key) && <small>알림에서 선택한 항목</small>}</div>)}</div>
  </section>
}
