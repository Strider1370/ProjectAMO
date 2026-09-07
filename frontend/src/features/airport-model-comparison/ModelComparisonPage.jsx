import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CloudSun, RefreshCw } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { MODEL_COMPARISON_AIRPORTS } from '../../api/modelComparisonApi.js'
import useModelComparison from './useModelComparison.js'
import { buildComparisonViewModel, firstForecastHour } from './modelComparisonViewModel.js'
import { ModelComparisonSummary } from './ModelComparisonSummary.jsx'
import ModelComparisonTable from './ModelComparisonTable.jsx'
import ModelComparisonChart from './ModelComparisonChart.jsx'
import './ModelComparison.css'

const SECTIONS = [
  { id: 'wind', label: '바람', title: '지상 바람', note: '풍속 실선 · 돌풍 점선', unit: 'kt' },
  { id: 'precipitation', label: '강수', title: '강수량', note: '시간당 표 · 표시 구간 누적 그래프', unit: 'mm' },
  { id: 'ceiling', label: '운고·운량', title: '운고 · 운량', note: '운고 ft AGL · 운량은 표 셀을 펼쳐 확인', unit: 'ft' },
  { id: 'temperatureRh', label: '기온·RH', title: '기온 · 상대습도', note: '기온 °C · 상대습도 % · 공통 시간축', unit: '°C', secondaryUnit: 'RH %' },
]

const STATIC_REFERENCES = {
  profile: { title: '연직시계열', image: '/briefing-charts/kim_gdps_erly_city_47163_t072_2026070200.png', caption: '무안 47163 · KIM 예보 시계열 샘플' },
  sounding: { title: '단열선도', image: '/briefing-charts/kim_gdps_skew_47163_s000_2026070200.png', caption: '무안 47163 · KIM Skew-T 샘플' },
  synoptic: { title: '지상일기도', image: '/briefing-charts/surf_2026070112.png', caption: 'KMA 종관 지상분석 샘플 · 01일 12Z' },
}

function StaticReferenceCard({ kind }) {
  const reference = STATIC_REFERENCES[kind]
  return <article className="mc-reference-card"><header><CloudSun size={18} aria-hidden="true" /><div><h3>{reference.title}</h3><p>실제 이미지 · 임시 예시</p></div></header><img src={reference.image} alt={reference.caption} loading="lazy" /><p className="mc-reference-caption">{reference.caption}</p><p className="mc-disconnected">임시 예시 — 현재 공항·실행자료와 연결되지 않음</p></article>
}

export default function ModelComparisonPage({ icao }) {
  const airportIcao = String(icao || '').toUpperCase()
  const { tz, setTz } = useTimeZone()
  const query = useModelComparison(airportIcao)
  const initial = new URLSearchParams(window.location.search).get('valid_at')
  const [selectedValidAt, setSelectedValidAt] = useState(() => Number.isFinite(Date.parse(initial)) ? new Date(initial).toISOString() : null)
  const [mode, setMode] = useState('all')
  const [section, setSection] = useState('wind')
  const effectiveNow = query.data ? Date.parse(query.data.effective_now) : Date.now()
  const selected = selectedValidAt || firstForecastHour(effectiveNow)
  const vm = useMemo(() => query.data ? buildComparisonViewModel({ data: query.data, nowMs: effectiveNow, selectedValidAt: selected, tz }) : null, [query.data, effectiveNow, selected, tz])

  const humiditySeries = useMemo(() => vm?.charts.temperatureRh.map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: point.secondary, secondary: undefined })) })) || [], [vm])

  useEffect(() => {
    if (!vm) return
    setSelectedValidAt(current => current || vm.selectedValidAt)
    const url = new URL(window.location.href)
    url.searchParams.set('valid_at', vm.selectedValidAt)
    window.history.replaceState(null, '', url)
  }, [vm?.selectedValidAt])

  if (!MODEL_COMPARISON_AIRPORTS.includes(airportIcao)) return <main className="mc-page"><a href="/" className="mc-back"><ArrowLeft size={17} />지도로 돌아가기</a><h1>지원하지 않는 공항입니다.</h1></main>
  return (
    <main className="mc-page">
      <header className="mc-page-head"><div><a href={`/?airport=${airportIcao}`} className="mc-back"><ArrowLeft size={17} aria-hidden="true" />공항 패널로 돌아가기</a><p className="mc-eyebrow">공항 상세 예보 분석</p><h1>{vm?.airport?.name || airportIcao} 상세 예보 분석 <span>{airportIcao}</span></h1><p>실황·TAF와 모델 격자값을 같은 UTC 유효시각으로 비교합니다.</p></div><div className="mc-timezone" role="group" aria-label="표시 시간대"><button type="button" className={tz === 'KST' ? 'is-active' : ''} onClick={() => setTz('KST')}>KST</button><button type="button" className={tz === 'UTC' ? 'is-active' : ''} onClick={() => setTz('UTC')}>UTC</button></div></header>
      {query.loading && !vm && <div className="mc-state" role="status"><RefreshCw className="mc-spin" />상세 예보 자료를 불러오는 중입니다.</div>}
      {query.error && <div className="mc-state mc-state--error" role="status">갱신에 실패했습니다.{vm ? ' 마지막 성공 자료를 계속 표시합니다.' : ''}</div>}
      {vm && <>
        <section className="mc-toolbar" aria-label="분석 기준"><div><span>선택 유효시각</span><strong>{vm.timeLabels[vm.times.indexOf(vm.selectedValidAt)] || `${vm.selectedValidAt} · 표시 범위 밖`}</strong></div><div><span>자료 상태</span><strong>{vm.status === 'ready' ? '4개 모델 준비' : vm.status === 'partial' ? '일부 모델 준비' : '모델 자료 없음'}</strong></div>{query.refreshing && <span className="mc-refreshing"><RefreshCw size={14} className="mc-spin" />갱신 중</span>}</section>
        <section className="mc-model-chips" aria-label="자료별 기준시각">{vm.observationChips.map(chip => <span key={chip.id} className={`mc-model-chip mc-model-chip--${chip.at ? 'available' : 'missing'}`}><b>{chip.label}</b>{chip.at ? ` ${chip.at.slice(5, 16).replace('T', ' ')}Z` : ' 자료 없음'}</span>)}{vm.modelChips.map(chip => <span key={chip.model} className={`mc-model-chip mc-model-chip--${chip.status}`}><b>{chip.label}</b>{chip.run_at ? <><span>Run {chip.run_at.slice(5, 16).replace('T', ' ')}Z</span><span>{chip.available_at ? `이용 ${chip.available_at.slice(5, 16).replace('T', ' ')}Z` : '이용시각 미기록'}</span></> : ' 자료 없음'}</span>)}</section>
        <ModelComparisonSummary summary={vm.summary} />
        <div className="mc-view-controls"><div role="group" aria-label="표시 방식"><button type="button" className={mode === 'all' ? 'is-active' : ''} onClick={() => setMode('all')}>전체 보기</button><button type="button" className={mode === 'single' ? 'is-active' : ''} onClick={() => setMode('single')}>요소별 보기</button></div>{mode === 'single' && <div role="tablist" aria-label="비교 요소">{SECTIONS.map(item => <button type="button" role="tab" aria-selected={section === item.id} className={section === item.id ? 'is-active' : ''} onClick={() => setSection(item.id)} key={item.id}>{item.label}</button>)}</div>}</div>
        <div className="mc-layout"><div className="mc-sections">{SECTIONS.filter(item => mode === 'all' || item.id === section).map(item => <section className="mc-section" data-section={item.id} key={item.id} aria-labelledby={`mc-${item.id}-title`}><header><div><h2 id={`mc-${item.id}-title`}>{item.title}</h2><p>{item.note}</p></div><span>공통 유효시각 축 · {tz}</span></header><div className="mc-comparison-scroll" role="region" aria-label={`${item.label} 시간축 스크롤`} tabIndex="0"><div className="mc-comparison-canvas" style={{ minWidth: 128 + vm.times.length * 72 }}><ModelComparisonTable section={item.id} rows={vm.rows[item.id]} times={vm.times} timeLabels={vm.timeLabels} selectedValidAt={vm.selectedValidAt} onSelectTime={setSelectedValidAt} />{item.id === 'temperatureRh' ? <><section aria-label="기온 그래프"><h3 className="mc-chart-heading">기온 (°C)</h3><ModelComparisonChart series={vm.charts.temperatureRh} times={vm.times} timeLabels={vm.timeLabels} unit={"°C"} secondaryUnit={undefined} selectedValidAt={vm.selectedValidAt} /></section><section aria-label="상대습도 그래프"><h3 className="mc-chart-heading">상대습도 (%)</h3><ModelComparisonChart series={humiditySeries} times={vm.times} timeLabels={vm.timeLabels} unit={"%"} secondaryUnit={undefined} selectedValidAt={vm.selectedValidAt} /></section></> : <ModelComparisonChart series={vm.charts[item.id]} times={vm.times} timeLabels={vm.timeLabels} unit={item.unit} secondaryUnit={item.secondaryUnit} selectedValidAt={vm.selectedValidAt} />}</div></div></section>)}</div><aside className="mc-reference" aria-label="임시 참고 자료"><StaticReferenceCard kind="profile" /><StaticReferenceCard kind="sounding" /><StaticReferenceCard kind="synoptic" /></aside></div>
      </>}
      {!query.loading && !vm && <div className="mc-state">표시할 비교 자료가 없습니다. 공항 패널로 돌아가 다른 공항을 선택할 수 있습니다.</div>}
    </main>
  )
}
