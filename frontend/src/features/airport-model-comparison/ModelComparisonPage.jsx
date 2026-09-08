import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { MODEL_COMPARISON_AIRPORTS } from '../../api/modelComparisonApi.js'
import useModelComparison from './useModelComparison.js'
import { buildComparisonViewModel, firstForecastHour } from './modelComparisonViewModel.js'
import { ModelComparisonSummary } from './ModelComparisonSummary.jsx'
import ModelComparisonTable from './ModelComparisonTable.jsx'
import ModelComparisonChart from './ModelComparisonChart.jsx'
import AtmosphericReference from './AtmosphericReference.jsx'
import './ModelComparison.css'

const SECTIONS = [
  { id: 'wind', label: '바람', title: '지상 바람', note: '풍속 실선 · 돌풍 점선', unit: 'kt' },
  { id: 'precipitation', label: '강수', title: '강수량', note: '시간당 표 · 공통 시작 시각부터 누적 막대', unit: 'mm' },
  { id: 'ceiling', label: '운고·운량', title: '운고 · 운량', note: '계단형 운고 ft AGL · 운량은 표 셀을 펼쳐 확인', unit: 'ft' },
  { id: 'temperatureRh', label: '기온·RH', title: '기온 · 상대습도', note: '기온 °C · 상대습도 % · 공통 시간축', unit: '°C', secondaryUnit: 'RH %' },
]

const runStamp = value => value.slice(5, 16).replace('T', ' ') + 'Z'

function ModelRunInformation({ chips }) {
  const commonRun = chips[0]?.run_at && chips.every(chip => chip.run_at === chips[0].run_at) ? chips[0].run_at : null
  return <details className="mc-run-info">
    <summary>{commonRun
      ? <><b>모델 Run</b> {runStamp(commonRun)} · {chips.length}개 모델</>
      : chips.map(chip => <span key={chip.model}><b>{chip.label}</b> {chip.run_at ? `Run ${runStamp(chip.run_at)}` : '자료 없음'}</span>)}</summary>
    <div className="mc-run-popover">{chips.map(chip => <div key={chip.model}><b>{chip.label}</b> · {chip.run_at ? `Run ${runStamp(chip.run_at)}` : '자료 없음'}<span>{chip.available_at ? `이용 ${runStamp(chip.available_at)}` : '이용시각 미기록'}</span></div>)}</div>
  </details>
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

  const humiditySeries = vm?.charts.humidity || []

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
      <header className="mc-page-head mc-page-head--compact">
        <div className="mc-page-identity"><a href={`/?airport=${airportIcao}`} className="mc-back" aria-label="공항 패널로 돌아가기"><ArrowLeft size={22} aria-hidden="true" /></a><h1 aria-label={`${vm?.airport?.name || airportIcao} 상세 예보 분석 ${airportIcao}`}>{vm?.airport?.name || airportIcao}<span>{airportIcao}</span><span className="mc-page-subtitle">상세 예보 분석</span></h1></div>
        <div className="mc-timezone" role="group" aria-label="표시 시간대"><button type="button" aria-pressed={tz === 'KST'} className={tz === 'KST' ? 'is-active' : ''} onClick={() => setTz('KST')}>KST</button><button type="button" aria-pressed={tz === 'UTC'} className={tz === 'UTC' ? 'is-active' : ''} onClick={() => setTz('UTC')}>UTC</button></div>
      </header>
      {query.loading && !vm && <div className="mc-state" role="status"><RefreshCw className="mc-spin" />상세 예보 자료를 불러오는 중입니다.</div>}
      {query.error && <div className="mc-state mc-state--error" role="status">갱신에 실패했습니다.{vm ? ' 마지막 성공 자료를 계속 표시합니다.' : ''}</div>}
      {vm && <>
        <div className="mc-header-controls">
          <section className="mc-toolbar" aria-label="분석 기준"><div><span>선택 시각</span><strong>{vm.timeLabels[vm.times.indexOf(vm.selectedValidAt)] || `${vm.selectedValidAt} · 표시 범위 밖`}</strong></div></section>
          <div className="mc-view-controls"><div role="group" aria-label="표시 방식"><button type="button" aria-pressed={mode === 'all'} className={mode === 'all' ? 'is-active' : ''} onClick={() => setMode('all')}>전체 보기</button><button type="button" aria-pressed={mode === 'single'} className={mode === 'single' ? 'is-active' : ''} onClick={() => setMode('single')}>요소별 보기</button></div>{mode === 'single' && <div role="tablist" aria-label="비교 요소">{SECTIONS.map(item => <button type="button" role="tab" aria-selected={section === item.id} className={section === item.id ? 'is-active' : ''} onClick={() => setSection(item.id)} key={item.id}>{item.label}</button>)}</div>}</div>
          {query.refreshing && <span className="mc-refreshing" role="status"><RefreshCw size={14} className="mc-spin" />갱신 중</span>}
        </div>
        <section className="mc-source-line" aria-label="자료별 기준시각">{vm.observationChips.map(chip => <span key={chip.id}><b>{chip.label}</b>{chip.at ? ` ${runStamp(chip.at)}` : ' 자료 없음'}</span>)}<ModelRunInformation chips={vm.modelChips} /></section>
        <ModelComparisonSummary summary={vm.summary} compact />
        <div className="mc-layout"><div className="mc-sections">{SECTIONS.filter(item => mode === 'all' || item.id === section).map(item => <section className="mc-section" data-section={item.id} key={item.id} aria-labelledby={`mc-${item.id}-title`}><header><div><h2 id={`mc-${item.id}-title`}>{item.title}</h2><p>{item.note}</p></div><span>공통 유효시각 축 · {tz}</span></header><div className="mc-comparison-scroll" role="region" aria-label={`${item.label} 시간축 스크롤`} tabIndex="0"><div className="mc-comparison-canvas" style={{ minWidth: 128 + vm.times.length * 72 }}><ModelComparisonTable section={item.id} rows={vm.rows[item.id]} times={vm.times} timeLabels={vm.timeLabels} selectedValidAt={vm.selectedValidAt} onSelectTime={setSelectedValidAt} />{item.id === 'temperatureRh' ? <><section aria-label="기온 그래프"><h3 className="mc-chart-heading">기온 (°C)</h3><ModelComparisonChart series={vm.charts.temperatureRh} times={vm.times} timeLabels={vm.timeLabels} unit={"°C"} secondaryUnit={undefined} selectedValidAt={vm.selectedValidAt} /></section><section aria-label="상대습도 그래프"><h3 className="mc-chart-heading">상대습도 (%)</h3><ModelComparisonChart series={humiditySeries} times={vm.times} timeLabels={vm.timeLabels} unit={"%"} secondaryUnit={undefined} selectedValidAt={vm.selectedValidAt} /></section></> : <ModelComparisonChart series={vm.charts[item.id]} times={vm.times} timeLabels={vm.timeLabels} unit={item.unit} secondaryUnit={item.secondaryUnit} emptyState={vm.chartEmptyStates[item.id]} cumulativeLabel={item.id === 'precipitation' ? vm.precipitationStartLabel : undefined} selectedValidAt={vm.selectedValidAt} />}</div></div></section>)}</div><AtmosphericReference /></div>
      </>}
      {!query.loading && !vm && <div className="mc-state">표시할 비교 자료가 없습니다. 공항 패널로 돌아가 다른 공항을 선택할 수 있습니다.</div>}
    </main>
  )
}
