import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useModelComparison from './useModelComparison.js'
import { buildComparisonViewModel, firstForecastHour } from './modelComparisonViewModel.js'
import './ModelComparison.css'

export function ModelComparisonSummary({ summary }) {
  if (!summary) return <p className="mc-summary-wait">비교 자료를 불러오는 중입니다.</p>
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
      <ModelComparisonSummary summary={vm?.summary || null} />
      <a className="mc-open-link" href={href} aria-label="분석 화면 열기 ↗"><BarChart3 size={17} aria-hidden="true" />분석 화면 열기 <span aria-hidden="true">↗</span></a>
    </section>
  )
}
