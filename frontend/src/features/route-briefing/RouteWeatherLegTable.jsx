import { Caption1, Subtitle2, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '../../shared/ui/fluent.js'
import { phenomenonKo } from '../../shared/weather/phenomenonKo.js'

const noData = '자료 없음'
const TURB_KO = { light: '약', moderate: '중', severe: '심' }

function formatAltitude(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(value).toLocaleString()} ft` : noData
}

function formatWind(wind) {
  if (!wind) return noData
  // 다른 화면과 용어를 맞춘다(Headwind/Tailwind → 맞바람/뒷바람).
  const direction = wind.meanComponentKt >= 0 ? '뒷바람' : '맞바람'
  return `${direction} ${Math.abs(wind.meanComponentKt)}kt`
}

function formatTemp(temp) {
  return temp ? `${temp.meanC}°C` : noData
}

function totalNm(exposures) {
  return Math.round(exposures.reduce((sum, item) => sum + item.distanceNm, 0) * 10) / 10
}

// 노출 요약 → 칩. peakLevel이 없으면(=해당 없음) 칩을 만들지 않는다.
function icingChip(summary) {
  if (!summary?.peakLevel) return null
  return { key: 'icing', label: `착빙 ${summary.peakLevel}`, note: `${totalNm(summary.exposures)}NM`, level: Number(summary.peakLevel) >= 3 ? 'red' : 'amber' }
}

function turbulenceChip(summary) {
  if (!summary?.peakLevel) return null
  const level = summary.peakLevel === 'severe' ? 'red' : summary.peakLevel === 'moderate' ? 'amber' : 'gray'
  return { key: 'turb', label: `난류 ${TURB_KO[summary.peakLevel] ?? summary.peakLevel}`, note: `${totalNm(summary.exposures)}NM`, level }
}

function hazardChips(leg) {
  const chips = [icingChip(leg.icing), turbulenceChip(leg.turbulence)].filter(Boolean)
  for (const [i, hazard] of leg.hazards.entries()) {
    const unknown = hazard.verticalStatus === 'unknown'
    chips.push({
      key: `h${i}`,
      label: phenomenonKo(hazard.code) || hazard.label || hazard.code,
      note: unknown ? '고도 판정 불가' : `${Math.round(hazard.routeDistanceNm * 10) / 10}NM`,
      level: unknown ? 'gray' : 'red',
    })
  }
  for (const [i, notam] of leg.notams.entries()) {
    chips.push({
      key: `n${i}`,
      label: notam.summary ?? notam.id,
      note: notam.effect === 'undetermined' ? 'NOTAM 판정 불가' : 'NOTAM',
      level: notam.effect === 'warn' ? 'red' : 'gray',
    })
  }
  return chips
}

export default function RouteWeatherLegTable({ legs, selectedAltitudeFt }) {
  // 모든 구간이 똑같이 확인 불가면 줄마다 반복하지 않고 표 머리에 한 번만 알린다.
  const constraintUnavailable = legs.length > 0 && legs.every((leg) => leg.altitudeConstraint?.status !== 'matched')
  return (
    <section className="bv-leg-briefing" aria-label="NAVLOG">
      <div className="bv-leg-head">
        <div>
          <Subtitle2 as="h4">NAVLOG</Subtitle2>
          <Caption1 className="bv-leg-sub">경로 구간 기상 · 선택 고도 {formatAltitude(selectedAltitudeFt)} 기준</Caption1>
        </div>
        <Caption1 className="bv-leg-disclaimer">
          ETA 또는 연료 계산은 포함하지 않습니다.
          {constraintUnavailable ? <><br />AIP 고도 제약 확인 불가</> : null}
        </Caption1>
      </div>
      <div className="bv-leg-scroll">
        <Table size="small" className="bv-leg-table">
          <TableHeader><TableRow>
            <TableHeaderCell>구간</TableHeaderCell><TableHeaderCell>거리</TableHeaderCell><TableHeaderCell>Bearing</TableHeaderCell>
            <TableHeaderCell>바람</TableHeaderCell><TableHeaderCell>기온</TableHeaderCell><TableHeaderCell>위험기상</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{legs.map((leg, index) => {
            const chips = hazardChips(leg)
            if (!constraintUnavailable && leg.altitudeConstraint?.status !== 'matched' && leg.altitudeConstraint?.applicability !== 'not_applicable') {
              chips.push({ key: 'aip', label: 'AIP 고도 제약', note: '확인 불가', level: 'gray' })
            }
            return (
              <TableRow key={`${leg.from}-${leg.to}-${index}`} className="bv-leg-row" data-testid="route-weather-leg-card">
                <TableCell data-label="구간"><b>{leg.from ?? noData} → {leg.to ?? noData}</b></TableCell>
                <TableCell data-label="거리">{leg.distanceNm == null ? noData : `${leg.distanceNm} NM`}</TableCell>
                <TableCell data-label="Bearing">{leg.courseTrueDeg == null ? noData : `${leg.courseTrueDeg}°T`}</TableCell>
                <TableCell data-label="바람" className={leg.wind?.meanComponentKt < 0 ? 'bv-leg-headwind' : 'bv-leg-tailwind'}>{formatWind(leg.wind)}</TableCell>
                <TableCell data-label="기온">{formatTemp(leg.temp)}</TableCell>
                <TableCell data-label="위험기상">
                  {chips.length === 0
                    ? <span className="bv-leg-none" aria-label="위험기상 없음">—</span>
                    : <div className="bv-leg-hazards">{chips.map((chip) => (
                        <span key={chip.key} className={`bv-leg-chip is-${chip.level}`}>
                          {chip.label}{chip.note ? <span className="bv-leg-chip-note">{chip.note}</span> : null}
                        </span>
                      ))}</div>}
                </TableCell>
              </TableRow>
            )
          })}</TableBody>
        </Table>
      </div>
    </section>
  )
}
