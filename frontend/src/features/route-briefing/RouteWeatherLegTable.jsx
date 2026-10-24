import { Caption1, Subtitle2, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '../../shared/ui/fluent.js'
import { buildNavlogRows } from './lib/navlogRows.js'
import { legHazardChips, navlogSummary, procedureHazardChips } from './lib/navlogChips.js'

const noData = '자료 없음'
// 숫자 칸의 빈 값은 칸 폭을 넘지 않게 '—'로(읽는 이에게는 '자료 없음').
const Missing = () => <span className="bv-leg-missing" title={noData} aria-label={noData}>—</span>
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

// 다른 화면과 용어를 맞춘다(Headwind/Tailwind → 맞바람/뒷바람).
function componentText(kt) {
  return `${kt >= 0 ? '뒷바람' : '맞바람'} ${Math.abs(kt)}kt`
}

function formatWind(wind) {
  return wind ? componentText(wind.meanComponentKt) : <Missing />
}

// 실제 풍향·풍속. 성분만으로는 어느 쪽에서 부는지 알 수 없어 대체 고도 판단에 못 쓴다.
function formatWindVector(wind) {
  if (!wind || wind.speedKt == null) return <Missing />
  if (!wind.directionDeg) return `무풍` // 벡터 합이 0이면 방향이 없다
  return `${String(wind.directionDeg).padStart(3, '0')}/${String(wind.speedKt).padStart(2, '0')}kt`
}

function formatTemp(temp) {
  return temp ? `${temp.meanC}°C` : <Missing />
}

// ISA 대비 편차. 성능·결빙 판단은 절대기온이 아니라 이 값으로 한다.
function formatIsa(value) {
  if (value == null) return <Missing />
  return value > 0 ? `+${value}` : String(value)
}

function HazardCell({ chips }) {
  return (
    <TableCell data-label="위험기상">
      {chips.length === 0
        ? <span className="bv-leg-none" aria-label="위험기상 없음">—</span>
        : <div className="bv-leg-hazards">{chips.map((chip) => (
            <span key={chip.key} className={`bv-leg-chip is-${chip.level}`}>
              {chip.label}{chip.note ? <span className="bv-leg-chip-note">{chip.note}</span> : null}
            </span>
          ))}</div>}
    </TableCell>
  )
}

// 구간 하나 = 한 줄. 짝지은 값도 위아래로 쌓지 않고 칸을 나눠 한 줄에 둔다.
function LegDataCells({ leg, chips }) {
  return <>
    <TableCell data-label="구간" className="bv-leg-name">{leg.from ?? noData} → {leg.to ?? noData}</TableCell>
    <TableCell data-label="거리" className="bv-leg-num">{leg.distanceNm == null ? <Missing /> : leg.distanceNm}</TableCell>
    <TableCell data-label="방위" className="bv-leg-num bv-leg-dim">{leg.courseTrueDeg == null ? <Missing /> : `${leg.courseTrueDeg}°`}</TableCell>
    <TableCell data-label="바람성분" className={leg.wind?.meanComponentKt < 0 ? 'bv-leg-headwind' : 'bv-leg-tailwind'}>{formatWind(leg.wind)}</TableCell>
    <TableCell data-label="풍향/풍속" className="bv-leg-num bv-leg-dim">{formatWindVector(leg.wind)}</TableCell>
    <TableCell data-label="기온" className="bv-leg-num">{formatTemp(leg.temp)}</TableCell>
    <TableCell data-label="ISA" className="bv-leg-num bv-leg-dim">{formatIsa(leg.temp?.isaDevC)}</TableCell>
    <HazardCell chips={chips} />
  </>
}

function SummaryLine({ summary }) {
  const { meanComponentKt, maxHeadwind, isaRange } = summary
  if (meanComponentKt == null && !maxHeadwind && !isaRange) return null
  return (
    <p className="bv-leg-summary" data-testid="navlog-summary">
      {meanComponentKt != null && <span>평균 <b className={meanComponentKt < 0 ? 'bv-leg-headwind' : 'bv-leg-tailwind'}>{componentText(meanComponentKt)}</b></span>}
      {maxHeadwind && <span>최대 <b className="bv-leg-headwind">맞바람 {maxHeadwind.kt}kt</b> {maxHeadwind.from}→{maxHeadwind.to}</span>}
      {isaRange && <span>기온 <b>ISA {formatIsa(isaRange.min)}{isaRange.max !== isaRange.min ? ` ~ ${formatIsa(isaRange.max)}` : ''}</b></span>}
    </p>
  )
}

export default function RouteWeatherLegTable({ legs, procedures = [], selectedAltitudeFt, onHighlightLeg, pinnedLegKey = null }) {
  // 모든 구간이 똑같이 확인 불가면 줄마다 반복하지 않고 표 머리에 한 번만 알린다.
  const constraintUnavailable = legs.length > 0 && legs.every((leg) => leg.altitudeConstraint?.status !== 'matched')
  // startNm·endNm까지 같이 넘긴다 — 지도는 FIX 이름으로 선을 자르고, 연직단면도는 거리축을 쓴다.
  const highlight = (leg, index, pinned) => onHighlightLeg?.(leg
    ? { from: leg.from, to: leg.to, startNm: leg.startNm, endNm: leg.endNm, key: legKey(leg, index), pinned }
    : null)
  // 지점 경계 줄은 내지 않는다 — 구간 줄의 "A → B"가 이미 경계를 말한다.
  const navlogRows = buildNavlogRows(legs, procedures).filter((row) => row.kind !== 'waypoint')
  return (
    <section className="bv-leg-briefing" aria-label="NAVLOG">
      <div className="bv-leg-head">
        <div>
          <Subtitle2 as="h4">NAVLOG</Subtitle2>
          <Caption1 className="bv-leg-sub">선택 고도 {formatAltitude(selectedAltitudeFt)} 기준 · 행을 가리키면 미리보기, 누르면 지도와 연직단면도에 고정</Caption1>
        </div>
        <Caption1 className="bv-leg-disclaimer">
          ETA 또는 연료 계산은 포함하지 않습니다.
          {constraintUnavailable ? <><br />AIP 고도 제약 확인 불가</> : null}
        </Caption1>
      </div>
      <SummaryLine summary={navlogSummary(legs)} />
      <div className="bv-leg-scroll">
        <Table size="small" className="bv-leg-table bv-main-navlog-table">
          <TableHeader><TableRow>
            <TableHeaderCell>구간</TableHeaderCell>
            <TableHeaderCell className="bv-leg-num">거리(NM)</TableHeaderCell>
            <TableHeaderCell className="bv-leg-num">방위</TableHeaderCell>
            <TableHeaderCell>바람성분</TableHeaderCell>
            <TableHeaderCell className="bv-leg-num">풍향/풍속</TableHeaderCell>
            <TableHeaderCell className="bv-leg-num">기온</TableHeaderCell>
            <TableHeaderCell className="bv-leg-num">ISA</TableHeaderCell>
            <TableHeaderCell>위험기상</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{navlogRows.map((row) => {
            if (row.kind === 'procedure') {
              const { procedure } = row
              const displayName = procedureDisplayName(procedure)
              return (
                <TableRow
                  key={row.key}
                  className="bv-procedure-summary-row"
                  data-testid="procedure-navlog-summary"
                  aria-label={`절차 ${displayName} 요약`}
                >
                  <TableCell data-label="절차" className="bv-leg-name">
                    {procedure.from ?? noData} → {procedure.to ?? noData}
                  </TableCell>
                  <TableCell data-label="거리" className="bv-leg-num">{procedure.distanceNm == null ? <Missing /> : procedure.distanceNm}</TableCell>
                  <TableCell className="bv-procedure-empty" aria-hidden="true" />
                  <TableCell colSpan={4} className="bv-procedure-empty bv-leg-dim">{displayName}</TableCell>
                  <HazardCell chips={procedureHazardChips(procedure)} />
                </TableRow>
              )
            }

            const { leg, index } = row
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
                <LegDataCells leg={leg} chips={legHazardChips(leg)} />
              </TableRow>
            )
          })}</TableBody>
        </Table>
      </div>
    </section>
  )
}
