import './RouteBriefing.css'
import { Button, Spinner } from '../../shared/ui/fluent.js'
import { Snowflake, Waves, Wind, CloudLightning } from 'lucide-react'
import { exposureNm, mergeExposureNm, windLabel, phenomenonLabelKo } from './lib/routeComparison.js'
import HazardIcon from './lib/HazardIcon.jsx'

function constraintLabel(constraints) {
  if (constraints?.status === 'matched') {
    const floor = constraints.routeFloorFt == null ? Number.NaN : Number(constraints.routeFloorFt)
    const ceiling = constraints.routeCeilingFt == null ? Number.NaN : Number(constraints.routeCeilingFt)
    if (Number.isFinite(floor) && Number.isFinite(ceiling)) return `이 항로는 ${formatAltitude(floor)}~${formatAltitude(ceiling)} 사이 고도만 비교할 수 있습니다`
    if (Number.isFinite(floor)) return `이 항로는 ${formatAltitude(floor)} 이상 고도만 비교할 수 있습니다`
    if (Number.isFinite(ceiling)) return `이 항로는 ${formatAltitude(ceiling)} 이하 고도만 비교할 수 있습니다`
    return '이 항로는 고도 제한 없이 비교할 수 있습니다'
  }
  if (constraints?.status === 'partial') return 'AIP 고도 제약 데이터 일부 없음'
  if (constraints?.status === 'conflicting') return '경로 구간별 고도 계열 확인 필요'
  return '공표 항공로 고도 제약 데이터 없음'
}

function formatAltitude(altitudeFt) {
  return altitudeFt <= 14000 ? `${altitudeFt.toLocaleString()} ft` : `FL${Math.round(altitudeFt / 100)}`
}

function warningMessages(row) {
  const items = []
  if (row.notams?.some((notam) => (notam.effect ?? notam.status) === 'undetermined')) items.push('NOTAM 판정 불가')
  if (row.timeStatus === 'not_provided') items.push('시간 판단 불가')
  if (row.candidateStatus === 'input_only' || row.status === 'input_only') {
    items.push('공표 고도 제약 미확인 · 입력 고도 기상만 표시')
  } else if (row.candidateStatus === 'input_invalid' || row.status === 'input_invalid') {
    items.push('이 항로의 공표 고도 방향 규칙상 비교 대상 아님')
  } else if (row.weatherStatus === 'weather_unavailable') {
    items.push('KIM 고도 기상 자료가 없어 비교할 수 없음')
  }
  return items
}

const SEVERITY_LABEL = {
  0: { code: 'NIL', ko: '없음' },
  1: { code: 'LGT', ko: '약함' },
  2: { code: 'MOD', ko: '보통' },
  3: { code: 'SVR', ko: '심함' },
}

function severityBadge(grade) {
  if (grade == null) return { code: '?', ko: '자료 없음' }
  const entry = SEVERITY_LABEL[Number(grade)]
  return entry ?? { code: '?', ko: '자료 없음' }
}

// NIL(등급 0)은 "관측했지만 없음"이라 "관측 안 됨"과 시각적으로 구분하지 않는다 —
// 둘 다 조종사가 신경 쓸 게 없다는 점은 같으므로 배지 대신 "없음"으로 통일한다.
function hasSeverity(summary) {
  return !!summary && Number(summary.highestGrade) > 0
}

export default function AltitudeWeatherComparison({
  comparison,
  loading,
  error,
  selectedAltitudeFt,
  onSelect,
  onBack,
  onContinue,
  profileLoading,
  profileError,
  hideStepActions = false,
}) {
  // 세 상태가 같은 옷을 입고 있었다 — 기다리는 중인지, 실패했는지, 원래 없는지를
  // 구분할 수 없으면 이용자는 그대로 다음 단계로 넘어가거나 처음부터 다시 한다.
  if (loading) {
    return (
      <p className="rb-alternatives-status rb-status-busy" role="status">
        <Spinner size="tiny" />
        <span>고도별 기상 비교를 불러오는 중…</span>
      </p>
    )
  }
  if (error) return <p className="rb-alternatives-status rb-status-error" role="alert">고도별 기상 비교를 확인할 수 없습니다: {error}</p>
  if (!comparison) return <p className="rb-alternatives-status">고도별 기상 비교 자료 없음</p>

  const rows = comparison.rows ?? []
  const selectedRow = rows.find((row) => (row.altFt ?? row.altitudeFt) === selectedAltitudeFt)
  const validAltitudeLabels = rows
    .filter((row) => (row.candidateStatus ?? row.status) === 'valid')
    .map((row) => row.label ?? row.fl ?? `FL${Math.round((row.altFt ?? row.altitudeFt) / 100)}`)
  const excludedInput = rows.find((row) => (row.candidateStatus ?? row.status) === 'input_invalid')
  return (
    <div className="rb-altitude-comparison">
      <p className="rb-alternatives-status">{constraintLabel(comparison.constraints)}</p>
      {!selectedRow && Number.isFinite(selectedAltitudeFt) && <p className="rb-altitude-selection">선택 고도 {formatAltitude(selectedAltitudeFt)} · 비교 후보에 없음</p>}
      {excludedInput && validAltitudeLabels.length > 0 && (
        <p className="rb-alert-banner">
          {`${excludedInput.label ?? `FL${Math.round((excludedInput.altFt ?? excludedInput.altitudeFt) / 100)}`}은 이 항로의 공표 고도 방향 규칙에 맞지 않습니다. 비교 가능한 고도: ${validAltitudeLabels.join(', ')}`}
        </p>
      )}
      {rows.map((row) => {
        const altitudeFt = row.altFt ?? row.altitudeFt
        const status = row.candidateStatus ?? row.status
        const selected = altitudeFt === selectedAltitudeFt
        const selectable = (status === 'valid' || status === 'input_only') && row.weatherStatus !== 'weather_unavailable'
        const warnings = warningMessages(row)

        const windKt = row.wind?.meanComponentKt ?? row.wind?.averageKt
        const icingItem = row.icing?.summary?.status === 'available' ? row.icing.summary : null
        const turbulenceItem = row.turbulence?.summary?.status === 'available' ? row.turbulence.summary : null
        const hazards = row.hazards ?? []
        const hazardExposureNm = Math.round(mergeExposureNm(hazards))
        const hasAnyData = Number.isFinite(windKt) || icingItem || turbulenceItem || hazards.length > 0 || warnings.length > 0

        return (
          <button key={`${altitudeFt}-${status}`} type="button" aria-selected={selected} disabled={!selectable} className={`rb-alternative-card${selected ? ' is-selected' : ''}`} onClick={() => onSelect(altitudeFt)}>
            <strong className="rb-card-fl">{row.label ?? row.fl ?? `FL${Math.round(altitudeFt / 100)}`}{selected && <small>현재 선택</small>}</strong>

            <span className="rb-route-stats rb-altitude-stats">
              <span className="rb-route-stat">
                <span className="rb-route-stat-label"><Wind size={16} />바람</span>
                <span className="rb-route-stat-value">{windLabel(windKt) ?? <span className="rb-stat-muted">자료 없음</span>}</span>
              </span>
              <span className="rb-route-stat">
                <span className="rb-route-stat-label"><Snowflake size={16} />착빙</span>
                <span className="rb-route-stat-value">
                  {hasSeverity(icingItem)
                    ? <span className={`sev-${severityBadge(icingItem.highestGrade).code.toLowerCase()}`}>{severityBadge(icingItem.highestGrade).ko}{icingItem.highestGradeExposureNm > 0 ? ` ${Math.round(icingItem.highestGradeExposureNm)} NM` : ''}</span>
                    : <span className="rb-stat-muted">없음</span>}
                </span>
              </span>
              <span className="rb-route-stat">
                <span className="rb-route-stat-label"><Waves size={16} />난류</span>
                <span className="rb-route-stat-value">
                  {hasSeverity(turbulenceItem)
                    ? <span className={`sev-${severityBadge(turbulenceItem.highestGrade).code.toLowerCase()}`}>{severityBadge(turbulenceItem.highestGrade).ko}{turbulenceItem.highestGradeExposureNm > 0 ? ` ${Math.round(turbulenceItem.highestGradeExposureNm)} NM` : ''}</span>
                    : <span className="rb-stat-muted">없음</span>}
                </span>
              </span>
              <span className={`rb-route-stat rb-card-total-exposure${hazards.length === 0 ? ' is-zero' : ''}`}>
                <span className="rb-route-stat-label" title="겹치는 구간은 한 번만 계산합니다"><CloudLightning size={16} />위험기상</span>
                <span className="rb-route-stat-value">{hazardExposureNm} NM · {hazards.length}건</span>
              </span>
            </span>

            {hazards.length > 0 && (
              <span className="rb-card-hazard" title="고도와 시간이 모두 맞으면 실제 조우, 하나라도 어긋나거나 확인 안 되면 인근">
                {hazards.map((hazard) => {
                  const isOn = hazard.encounter === 'on'
                  const nm = Math.round(exposureNm(hazard))
                  return (
                    <span key={`${hazard.source}-${hazard.sourceId}`} className={`hz-chip ${isOn ? 'hz-on' : 'hz-near'}`}>
                      <HazardIcon source={hazard.source} />
                      {hazard.source} · {phenomenonLabelKo(hazard.label)}{nm > 0 ? ` · ${nm} NM` : ''} · {isOn ? '실제 조우' : '인근'}
                    </span>
                  )
                })}
              </span>
            )}

            {warnings.map((message) => <span key={message} className="rb-card-warning">{message}</span>)}
            {!hasAnyData && <span className="rb-card-note">{row.reasons?.[0] ?? 'KIM 고도 기상 자료가 없어 비교할 수 없음'}</span>}
            {row.weatherLevel?.mode === 'interpolated' && <span className="rb-card-note">{`KIM FL${Math.round(row.weatherLevel.lowerAltFt / 100)}–FL${Math.round(row.weatherLevel.upperAltFt / 100)} 보간`}</span>}
          </button>
        )
      })}
      {!rows.length && <p className="rb-alternatives-status">{comparison.constraints?.reasons?.[0] ?? '비교 가능한 공표 고도 없음'}</p>}
      {profileLoading && (
        <p className="rb-alternatives-status rb-status-busy" role="status">
          <Spinner size="tiny" />
          <span>오른쪽 연직단면도를 불러오는 중…</span>
        </p>
      )}
      {profileError && <p className="rb-alternatives-status rb-status-error" role="alert">연직단면도를 확인할 수 없습니다: {profileError}</p>}
      <p className="rb-alternatives-note">공표 항공로 제약을 기준으로 한 기상 비교 정보이며, 관제 허가·항공기 성능·연료·운항 제한을 결정하지 않습니다.</p>
      {!hideStepActions && <div className="rb-step-actions">
        <Button appearance="secondary" type="button" onClick={onBack}>이전 단계</Button>
        <Button appearance="primary" type="button" onClick={onContinue}>브리핑 준비로</Button>
      </div>}
    </div>
  )
}
