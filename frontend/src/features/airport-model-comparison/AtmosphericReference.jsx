import { useEffect, useRef, useState } from 'react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

const SOUNDING_RUN = '2026-09-07T12:00:00.000Z'
const SOUNDING_SAMPLES = Array.from({ length: 13 }, (_, index) => {
  const hour = 18 + index * 3
  return {
    hour,
    validAt: new Date(Date.parse(SOUNDING_RUN) + hour * 3_600_000).toISOString(),
    image: `/briefing-charts/_kim_gdps_skew_47113_s${String(hour).padStart(3, '0')}_2026090712.png`,
  }
})
const KINDS = [{ id: 'profile', label: '연직시계열' }, { id: 'sounding', label: '단열선도' }]

function SampleTimeControl({ index, onSelect, label }) {
  return <div className="mc-step-control">
    <button className="mc-step-button" type="button" aria-label="이전 샘플 시각" disabled={index === 0} onClick={() => onSelect(index - 1)}>‹</button>
    <input type="range" min="0" max={SOUNDING_SAMPLES.length - 1} step="1" value={index} aria-label="샘플 시각" aria-valuetext={label} onChange={event => onSelect(Number(event.target.value))} />
    <button className="mc-step-button" type="button" aria-label="다음 샘플 시각" disabled={index === SOUNDING_SAMPLES.length - 1} onClick={() => onSelect(index + 1)}>›</button>
    <span className="mc-step-readout">{label}</span>
  </div>
}

export default function AtmosphericReference() {
  const { tz } = useTimeZone()
  const [kind, setKind] = useState('profile')
  const [sampleIndex, setSampleIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef(null)
  const tabRefs = useRef([])
  const sample = SOUNDING_SAMPLES[sampleIndex]
  const dateLabel = new Date(sample.validAt).toLocaleString('sv-SE', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).slice(5).replace('-', '.')
  const readout = `${dateLabel} ${tz} · KIM F${String(sample.hour).padStart(3, '0')}`
  const reference = kind === 'profile' ? {
    title: '연직시계열', description: '시간별 기온·습도·바람의 연직 구조',
    image: '/briefing-charts/kim_gdps_erly_city_47163_t072_2026070200.png',
    alt: 'KMA KIM 무안공항 연직시계열 샘플',
    caption: '무안공항 · KIM 연직시계열 샘플 · 2026.07.02 00:00 UTC 발표',
  } : {
    title: '단열선도', description: '기온·이슬점·상층 바람 및 안정도', image: sample.image,
    alt: `KMA KIM 인천공항 단열선도 샘플 F${String(sample.hour).padStart(3, '0')}`,
    caption: `인천공항 · ${readout} · 2026.09.07 12:00 UTC 발표`,
  }
  useEffect(() => {
    if (open && !dialogRef.current.open) dialogRef.current.showModal()
    if (!open && dialogRef.current.open) dialogRef.current.close()
  }, [open])
  const controls = () => <SampleTimeControl index={sampleIndex} onSelect={setSampleIndex} label={readout} />
  return <aside className="mc-reference mc-reference--single" aria-labelledby="mc-atmospheric-heading">
    <header className="mc-reference-heading"><h2 id="mc-atmospheric-heading">KIM 연직 참고</h2><span>샘플 이미지</span></header>
    <article className="mc-reference-card">
      <div className="mc-reference-tabs" role="tablist" aria-label="KIM 참고 자료">{KINDS.map((item, index) => <button
        key={item.id} ref={element => { tabRefs.current[index] = element }} id={`mc-reference-tab-${item.id}`} type="button" role="tab"
        aria-selected={kind === item.id} aria-controls="mc-reference-content" tabIndex={kind === item.id ? 0 : -1}
        onClick={() => setKind(item.id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? KINDS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + KINDS.length) % KINDS.length
          setKind(KINDS[next].id)
          tabRefs.current[next]?.focus()
        }}>{item.label}</button>)}</div>
      <div id="mc-reference-content" role="tabpanel" aria-labelledby={`mc-reference-tab-${kind}`}>
        <header><p>{reference.description}</p></header>
        <button type="button" className="mc-reference-figure" aria-label={`${reference.title} 크게 보기`} onClick={() => setOpen(true)}><img src={reference.image} alt={reference.alt} /></button>
        <p className="mc-reference-caption">{reference.caption}</p>
        <p className="mc-reference-sample-note">샘플 · 현재 공항 실행자료와 연결되지 않았습니다.</p>
        {kind === 'sounding' && controls()}
      </div>
    </article>
    <dialog ref={dialogRef} className="mc-reference-dialog" aria-labelledby="mc-reference-dialog-title" onClose={() => setOpen(false)}>{open && <>
      <header><div><h2 id="mc-reference-dialog-title">{reference.title}</h2><p>{reference.description}</p></div><button type="button" aria-label="닫기" onClick={() => setOpen(false)}>×</button></header>
      <img src={reference.image} alt={reference.alt} />
      <p>{reference.caption}</p>
      {kind === 'sounding' && controls()}
    </>}</dialog>
  </aside>
}
