import { Caption1, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '../../shared/ui/fluent.js'

const noData = '자료 없음'

function formatAltitude(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(value).toLocaleString()} ft` : noData
}

function formatWind(wind) {
  if (!wind) return noData
  const direction = wind.meanComponentKt >= 0 ? 'Tailwind' : 'Headwind'
  return `${direction} ${Math.abs(wind.meanComponentKt)}kt (${wind.minComponentKt}~${wind.maxComponentKt})`
}

function formatTemp(temp) {
  return temp ? `${temp.meanC}°C (${temp.minC}~${temp.maxC})` : noData
}

function formatExposure(name, summary) {
  if (!summary) return `${name} ${noData}`
  if (!summary.peakLevel) return `${name} 해당 없음`
  const distance = summary.exposures.map((item) => `${item.level} ${item.distanceNm}NM`).join(', ')
  return `${name} ${distance}`
}

function hazardFacts(leg) {
  const facts = [formatExposure('착빙', leg.icing), formatExposure('난류', leg.turbulence)]
  for (const hazard of leg.hazards) facts.push(`${hazard.label ?? hazard.code}${hazard.verticalStatus === 'unknown' ? ' · 고도 판정 불가' : ''}`)
  for (const notam of leg.notams) facts.push(`${notam.summary ?? notam.id}${notam.effect === 'undetermined' ? ' · NOTAM 판정 불가' : ''}`)
  if (leg.altitudeConstraint?.applicability === 'not_applicable') facts.push('DCT · AIP 고도 제약 해당 없음')
  else if (leg.altitudeConstraint?.status !== 'matched') facts.push('AIP 고도 제약 확인 불가')
  return facts
}

export default function RouteWeatherLegTable({ legs, selectedAltitudeFt }) {
  return (
    <section className="bv-leg-briefing" aria-label="경로 구간 기상 브리핑">
      <div className="bv-leg-head">
        <div>
          <Caption1 as="h4">경로 구간 기상 브리핑</Caption1>
          <Caption1 className="bv-leg-sub">선택 고도 {formatAltitude(selectedAltitudeFt)} 기준</Caption1>
        </div>
        <Caption1 className="bv-leg-disclaimer">ETA 또는 연료 계산은 포함하지 않습니다.</Caption1>
      </div>
      <div className="bv-leg-scroll">
        <Table size="small" className="bv-leg-table">
          <TableHeader><TableRow>
            <TableHeaderCell>구간</TableHeaderCell><TableHeaderCell>거리</TableHeaderCell><TableHeaderCell>Course</TableHeaderCell>
            <TableHeaderCell>선택고도</TableHeaderCell><TableHeaderCell>바람</TableHeaderCell><TableHeaderCell>기온</TableHeaderCell><TableHeaderCell>위험기상</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{legs.map((leg, index) => (
            <TableRow key={`${leg.from}-${leg.to}-${index}`} className="bv-leg-row" data-testid="route-weather-leg-card">
              <TableCell data-label="구간"><b>{leg.from ?? noData} → {leg.to ?? noData}</b></TableCell>
              <TableCell data-label="거리">{leg.distanceNm == null ? noData : `${leg.distanceNm} NM`}</TableCell>
              <TableCell data-label="Course">{leg.courseTrueDeg == null ? noData : `${leg.courseTrueDeg}°T`}</TableCell>
              <TableCell data-label="선택고도">{formatAltitude(leg.selectedAltitudeFt)}</TableCell>
              <TableCell data-label="바람" className={leg.wind?.meanComponentKt < 0 ? 'bv-leg-headwind' : 'bv-leg-tailwind'}>{formatWind(leg.wind)}</TableCell>
              <TableCell data-label="기온">{formatTemp(leg.temp)}</TableCell>
              <TableCell data-label="위험기상"><div className="bv-leg-hazards">{hazardFacts(leg).map((fact) => <span key={fact}>{fact}</span>)}</div></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </section>
  )
}
