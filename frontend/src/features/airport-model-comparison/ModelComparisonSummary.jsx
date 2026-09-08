import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useModelComparison from './useModelComparison.js'
import { buildComparisonViewModel, firstForecastHour } from './modelComparisonViewModel.js'
import './ModelComparison.css'

export function ModelComparisonSummary({ summary, compact = false }) {
  if (!summary) return <p className="mc-summary-wait">비교 자료를 불러오는 중입니다.</p>
  if (compact) return (
    <div className="mc-summary mc-summary--compact" aria-label="선택 시각 모델 비교 요약">
      <section className="mc-summary-metric" aria-label="바람 요약">
        <h2>바람 <span>모델 범위</span></h2>
        <div className={`mc-summary-wind${summary.compact.windRange ? '' : ' mc-summary-missing'}`}>{summary.compact.windRange || '자료 없음'}{summary.compact.windRange && <span> kt</span>}</div>
        {summary.compact.gustRange && <div className="mc-summary-gust">Gust <strong>{summary.compact.gustRange} kt</strong></div>}
      </section>
      {[{ key: 'precipitation', title: '강수량', unit: 'mm · 시간당' }, { key: 'ceiling', title: '운고', unit: 'ft AGL' }].map(item => (
        <section className="mc-summary-metric" aria-label={`${item.title} 요약`} key={item.key}>
          <h2>{item.title} <span>{item.unit}</span></h2>
          <div className="mc-summary-values">{summary.compact.models.map(model => <div key={model.id}>
            <span className="mc-summary-model"><i className="mc-series-key" style={{ '--series-color': model.color }} aria-hidden="true" />{model.label}</span>
            <strong className={`mc-summary-value${model[`${item.key}Missing`] ? ' mc-summary-missing' : ''}`}>{model[item.key]}</strong>
          </div>)}</div>
        </section>
      ))}
    </div>
  )
  return (
    <div className="mc-summary" aria-label="선택 시각 모델 비교 요약">
      <div className="mc-summary-heading"><strong>선택 시각 요약 <time dateTime={summary.valid_at}>{summary.valid_at_label || summary.valid_at}</time></strong><span>{summary.modelCount}개 모델 참여</span></div>
      <p><b>바람</b><span>{summary.wind}</span></p>
      <p><b>강수</b><span>{summary.precipitation}</span></p>
      <p><b>운고</b><span>{summary.ceiling}</span></p>
    </div>
  )
}

export function AirportModelComparisonSection({ icao }) {
  const { tz } = useTimeZone()
  const query = useModelComparison(icao)
  const vm = useMemo(() => query.data ? buildComparisonViewModel({ data: query.data, nowMs: Date.parse(query.data.effective_now), selectedValidAt: firstForecastHour(Date.parse(query.data.effective_now)), tz }) : null, [query.data, tz])
  const href = vm ? `/airport/${icao}/models?valid_at=${encodeURIComponent(vm.summary.valid_at)}` : `/airport/${icao}/models`
  return (
    <section className="mc-panel-entry" aria-label="상세 예보 분석 요약">
      {query.error && <p className="mc-inline-status" role="status">갱신 실패 · 마지막 성공 자료를 표시합니다.</p>}
      {vm && <div className="mc-panel-summary-time"><span>선택 시각</span><time dateTime={vm.summary.valid_at}>{vm.summary.valid_at_label}</time></div>}
      <ModelComparisonSummary summary={vm?.summary || null} compact />
      <a className="mc-open-link" href={href} aria-label="분석 화면 열기 ↗"><BarChart3 size={17} aria-hidden="true" />분석 화면 열기 <span aria-hidden="true">↗</span></a>
    </section>
  )
}
