import { Caption1, Subtitle2, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '../../shared/ui/fluent.js'
import { phenomenonKo } from '../../shared/weather/phenomenonKo.js'
import { buildNavlogRows } from './lib/navlogRows.js'

const noData = '자료 없음'
const TURB_KO = { light: '약', moderate: '중', severe: '심' }

// 같은 FIX 쌍이 두 번 나올 수 있으므로 순번까지 넣어야 줄이 고유해진다.
const legKey = (leg, index) => `${leg.from}-${leg.to}-${index}`

function procedureDisplayName(procedure) {
  return (procedure?.procedureIds ?? [procedure?.id ?? noData])
    .map((id) => String(id).replace(/^[A-Z0-9]{4}-(?:SID|STAR|IAP)-/i, ''))
    .join(' · ')
}

function formatAltitude(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(value).toLocaleString()} ft` : noData
}

function formatWind(wind) {
  if (!wind) return noData
  // 다른 화면과 용어를 맞춘다(Headwind/Tailwind → 맞바람/뒷바람).
  const direction = wind.meanComponentKt >= 0 ? '뒷바람' : '맞바람'
  return `${direction} ${Math.abs(wind.meanComponentKt)}kt`
}

// 실제 풍향·풍속. 성분만으로는 어느 쪽에서 부는지 알 수 없어 대체 고도 판단에 못 쓴다.
function formatWindVector(wind) {
  if (!wind || wind.speedKt == null) return noData
  if (!wind.directionDeg) return `무풍` // 벡터 합이 0이면 방향이 없다
  return `${String(wind.directionDeg).padStart(3, '0')}/${String(wind.speedKt).padStart(2, '0')}kt`
}

function formatTemp(temp) {
  return temp ? `${temp.meanC}°C` : noData
}

// ISA 대비 편차. 성능·결빙 판단은 절대기온이 아니라 이 값으로 한다.
function formatIsa(temp) {
  if (!temp || temp.isaDevC == null) return noData
  return temp.isaDevC > 0 ? `ISA+${temp.isaDevC}` : temp.isaDevC < 0 ? `ISA${temp.isaDevC}` : 'ISA'
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
  for (const [i, hazard] of (leg.hazards ?? []).entries()) {
    const unknown = hazard.verticalStatus === 'unknown'
    chips.push({
      key: `h${i}`,
      label: phenomenonKo(hazard.code) || hazard.label || hazard.code,
      note: unknown ? '고도 판정 불가' : `${Math.round(hazard.routeDistanceNm * 10) / 10}NM`,
      level: unknown ? 'gray' : 'red',
    })
  }
  for (const [i, notam] of (leg.notams ?? []).entries()) {
    chips.push({
      key: `n${i}`,
      label: notam.summary ?? notam.id,
      // warn = 실제 경로 저촉만. 정보성(info)·판정 불가는 회색으로 둔다.
      note: notam.effect === 'undetermined' ? 'NOTAM 판정 불가' : 'NOTAM',
      level: notam.effect === 'warn' ? 'red' : 'gray',
    })
  }
  return chips
}

function procedureHazardChips(procedure) {
  const legs = procedure.legs ?? []
  const icingPeak = Math.max(0, ...legs.map((leg) => Number(leg.icing?.peakLevel) || 0))
  const icingExposures = legs.flatMap((leg) => leg.icing?.exposures ?? [])
  const turbulenceRank = { light: 1, moderate: 2, severe: 3 }
  const turbulencePeak = legs.reduce((peak, leg) => (turbulenceRank[leg.turbulence?.peakLevel] ?? 0) > (turbulenceRank[peak] ?? 0) ? leg.turbulence.peakLevel : peak, null)
  const turbulenceExposures = legs.flatMap((leg) => leg.turbulence?.exposures ?? [])
  const summaryChips = [
    icingChip(icingPeak ? { peakLevel: icingPeak, exposures: icingExposures } : null),
    turbulenceChip(turbulencePeak ? { peakLevel: turbulencePeak, exposures: turbulenceExposures } : null),
  ].filter(Boolean)
  const seen = new Set()
  const otherChips = legs.flatMap((leg) => hazardChips(leg))
    .filter((chip) => chip.key !== 'icing' && chip.key !== 'turb')
    .filter((chip) => {
      const key = `${chip.label}-${chip.note}-${chip.level}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((chip) => ({ ...chip, key: `procedure-${chip.label}-${chip.note}-${chip.level}` }))
  return [...summaryChips, ...otherChips]
}

function LegDataCells({ leg, chips }) {
  return <>
    <TableCell rowSpan={2} data-label="거리">
      <span className="bv-leg-distance"><i className="bv-leg-direction" aria-hidden="true" />{leg.distanceNm == null ? noData : `${leg.distanceNm} NM`}</span>
    </TableCell>
    <TableCell rowSpan={2} data-label="Bearing">{leg.courseTrueDeg == null ? noData : `${leg.courseTrueDeg}°T`}</TableCell>
    <TableCell rowSpan={2} data-label="바람성분" className={leg.wind?.meanComponentKt < 0 ? 'bv-leg-headwind' : 'bv-leg-tailwind'}>{formatWind(leg.wind)}</TableCell>
    <TableCell rowSpan={2} data-label="풍향/풍속">{formatWindVector(leg.wind)}</TableCell>
    <TableCell rowSpan={2} data-label="기온">{formatTemp(leg.temp)}</TableCell>
    <TableCell rowSpan={2} data-label="ISA">{formatIsa(leg.temp)}</TableCell>
    <TableCell rowSpan={2} data-label="위험기상">
      {chips.length === 0
        ? <span className="bv-leg-none" aria-label="위험기상 없음">—</span>
        : <div className="bv-leg-hazards">{chips.map((chip) => (
            <span key={chip.key} className={`bv-leg-chip is-${chip.level}`}>
              {chip.label}{chip.note ? <span className="bv-leg-chip-note">{chip.note}</span> : null}
            </span>
          ))}</div>}
    </TableCell>
  </>
}

export default function RouteWeatherLegTable({ legs, procedures = [], selectedAltitudeFt, onHighlightLeg, pinnedLegKey = null }) {
  // 모든 구간이 똑같이 확인 불가면 줄마다 반복하지 않고 표 머리에 한 번만 알린다.
  const constraintUnavailable = legs.length > 0 && legs.every((leg) => leg.altitudeConstraint?.status !== 'matched')
  // startNm·endNm까지 같이 넘긴다 — 지도는 FIX 이름으로 선을 자르고, 연직단면도는 거리축을 쓴다.
  const highlight = (leg, index, pinned) => onHighlightLeg?.(leg
    ? { from: leg.from, to: leg.to, startNm: leg.startNm, endNm: leg.endNm, key: legKey(leg, index), pinned }
    : null)
  const navlogRows = buildNavlogRows(legs, procedures)
  return (
    <section className="bv-leg-briefing" aria-label="NAVLOG">
      <div className="bv-leg-head">
        <div>
          <Subtitle2 as="h4">NAVLOG</Subtitle2>
          <Caption1 className="bv-leg-sub">경로 구간 기상 · 선택 고도 {formatAltitude(selectedAltitudeFt)} 기준 · 항로 구간 행을 가리키면 미리보기, 클릭하면 지도와 연직단면도에 고정</Caption1>
        </div>
        <Caption1 className="bv-leg-disclaimer">
          ETA 또는 연료 계산은 포함하지 않습니다.
          {constraintUnavailable ? <><br />AIP 고도 제약 확인 불가</> : null}
        </Caption1>
      </div>
      <div className="bv-leg-scroll">
        <Table size="small" className="bv-leg-table bv-main-navlog-table">
          <TableHeader><TableRow>
            <TableHeaderCell>웨이포인트</TableHeaderCell><TableHeaderCell>거리</TableHeaderCell><TableHeaderCell>Bearing</TableHeaderCell>
            <TableHeaderCell>바람성분</TableHeaderCell><TableHeaderCell>풍향/풍속</TableHeaderCell>
            <TableHeaderCell>기온</TableHeaderCell><TableHeaderCell>ISA</TableHeaderCell><TableHeaderCell>위험기상</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{navlogRows.map((row, rowIndex) => {
            if (row.kind === 'waypoint') {
              const waypoint = row.waypoint ?? noData
              const waypointRowSpan = navlogRows[rowIndex + 1]?.kind === 'leg' ? 2 : 1
              return (
                <TableRow
                  key={row.key}
                  className="bv-waypoint-row"
                  aria-label={`웨이포인트 ${waypoint}`}
                  data-testid="route-weather-waypoint"
                >
                  <TableCell rowSpan={waypointRowSpan} className="bv-waypoint-cell">
                    <span className="bv-waypoint-label"><i aria-hidden="true" /> <b>{waypoint}</b></span>
                  </TableCell>
                </TableRow>
              )
            }

            if (row.kind === 'procedure') {
              const { procedure } = row
              const displayName = procedureDisplayName(procedure)
              const chips = procedureHazardChips(procedure)
              return (
                <TableRow
                  key={row.key}
                  className="bv-procedure-summary-row"
                  data-testid="procedure-navlog-summary"
                  aria-label={`절차 ${displayName} 요약`}
                >
                  <TableCell data-label="절차">
                    <b>{displayName}</b>
                  </TableCell>
                  <TableCell data-label="거리">{procedure.distanceNm == null ? noData : `${procedure.distanceNm} NM`}</TableCell>
                  {Array.from({ length: 5 }, (_, index) => <TableCell key={index} className="bv-procedure-empty" aria-hidden="true" />)}
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
            }

            const { leg, index } = row
            const chips = hazardChips(leg)
            if (!constraintUnavailable && leg.altitudeConstraint?.status !== 'matched' && leg.altitudeConstraint?.applicability !== 'not_applicable') {
              chips.push({ key: 'aip', label: 'AIP 고도 제약', note: '확인 불가', level: 'gray' })
            }
            const interactiveProps = {
              onMouseEnter: () => { if (!pinnedLegKey) highlight(leg, index, false) },
              onMouseLeave: () => { if (!pinnedLegKey) highlight(null) },
              onClick: () => (pinnedLegKey === legKey(leg, index) ? highlight(null) : highlight(leg, index, true)),
            }
            return (
              <TableRow
                key={row.key}
                className={`bv-leg-row${pinnedLegKey === legKey(leg, index) ? ' is-pinned' : ''}`}
                data-testid="route-weather-leg-card"
                aria-label={`${leg.from ?? noData}에서 ${leg.to ?? noData}까지 구간`}
                // 지도에서 이 구간이 어디인지 보여준다. 호버는 미리보기, 클릭은 고정(다시 누르면 해제).
                {...interactiveProps}
              >
                <LegDataCells leg={leg} chips={chips} />
              </TableRow>
            )
          })}</TableBody>
        </Table>
      </div>
    </section>
  )
}
