import { formatCopilotTime } from './floatingWindow.js'
import { SETTING_LABELS } from './RouteSettingsCard.jsx'

export default function RoutePlanCard({ result, timezone }) {
  const data = result.data ?? {}, flight = data.flight
  const planned = data.planningState === 'planned'
  return <section className="copilot-fact" aria-label="경로 계산 결과">
    <strong>{planned ? '계산된 경로 초안' : '경로 계산에 필요한 조건'}</strong>
    {planned ? <>
      <p>{flight.departureAirport} → {flight.arrivalAirport} · {flight.flightRule} · {flight.cruiseAltitudeFt.toLocaleString()} ft · TAS {flight.tasKt} kt</p>
      <p>출발 {formatCopilotTime(flight.etd, timezone, { year: true })}</p>
      <p>도착 {formatCopilotTime(flight.eta, timezone, { year: true })} · {data.assumptions?.etaBasis === 'user-specified' ? '사용자 지정' : '거리/TAS 추정, 바람 보정 없음'}</p>
      <p>{data.routeText}</p>
      <p>항공로 자료 {result.reference?.publicationId} · {flight.routeType}{data.assumptions?.routeTypeDefaulted ? ' (항로 종류 기본값)' : ''}</p>
      <p>절차·활주로는 보관 METAR와 기존 자동 생성 규칙으로 선택했습니다. 운항 허가·안전 판정이 아닙니다.</p>
      {data.assumptions?.missingWindAirports?.length > 0 && <p>풍향 미확인: {data.assumptions.missingWindAirports.join(', ')}. 첫 번째 가용 활주로 그룹을 사용했습니다.</p>}
      <p>화면 경로는 변경하지 않았습니다. 이어지는 브리핑의 ‘같은 결과 전체 보기’에서 확인하고 편집할 수 있습니다.</p>
    </> : <>
      {data.missingFields?.length > 0 && <p>필요한 입력: {data.missingFields.map((key) => key === 'tasKt' ? '진대기속도(TAS, kt)' : SETTING_LABELS[key] ?? key).join(' · ')}</p>}
      <p>경로를 계산하지 않았으며, 미지정 비행 조건을 임의로 채우지 않았습니다.</p>
      {(result.issues ?? []).map((issue, index) => <p key={index}>{issue.code}
        {issue.candidates?.length > 0 && ` — ${issue.candidates.map((candidate) => `${candidate.nameKo} (${candidate.icao})`).join(', ')}`}
        {issue.conditions?.length > 0 && ` — ${issue.conditions.join(', ')}`}</p>)}
    </>}
  </section>
}
