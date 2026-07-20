import './RouteBriefing.css'
import { Button } from '../../shared/ui/fluent.js'
import { Snowflake, Waves, Wind, CloudLightning, Mountain, Minus } from 'lucide-react'
import { exposureNm } from './lib/routeComparison.js'

function constraintLabel(constraints) {
  if (constraints?.status === 'matched') {
    const floor = constraints.routeFloorFt == null ? Number.NaN : Number(constraints.routeFloorFt)
    const ceiling = constraints.routeCeilingFt == null ? Number.NaN : Number(constraints.routeCeilingFt)
    if (Number.isFinite(floor) && Number.isFinite(ceiling)) return `공표 비교 범위 ${formatAltitude(floor)}–${formatAltitude(ceiling)}`
    if (Number.isFinite(floor)) return `공표 비교 하한 ${formatAltitude(floor)}`
    if (Number.isFinite(ceiling)) return `공표 비교 상한 ${formatAltitude(ceiling)}`
    return '공표 고도 제한 없음'
  }
  if (constraints?.status === 'partial') return 'AIP 고도 제약 데이터 일부 없음'
  if (constraints?.status === 'conflicting') return '경로 구간별 고도 계열 확인 필요'
  return '공표 항공로 고도 제약 데이터 없음'
}

function formatAltitude(altitudeFt) {
  return altitudeFt <= 14000 ? `${altitudeFt.toLocaleString()} ft` : `FL${Math.round(altitudeFt / 100)}`
}

function rowDetails(row) {
  const items = []
  const windKt = row.wind?.meanComponentKt ?? row.wind?.averageKt
  if (Number.isFinite(windKt)) items.push({ text: `평균 ${windKt >= 0 ? '순풍 +' : '맞바람 '}${Math.round(windKt)}kt`, kind: 'info' })
  if (row.icing?.summary?.status === 'available') items.push({ kind: 'severity', type: 'icing', grade: row.icing.summary.highestGrade, exposureNm: row.icing.summary.highestGradeExposureNm, exposureNmByGrade: row.icing.summary.exposureNmByGrade })
  if (row.turbulence?.summary?.status === 'available') items.push({ kind: 'severity', type: 'turbulence', grade: row.turbulence.summary.highestGrade, exposureNm: row.turbulence.summary.highestGradeExposureNm, exposureNmByGrade: row.turbulence.summary.exposureNmByGrade })
  if (row.hazards?.length) items.push({ text: hazardSummary(row.hazards), kind: 'hazard' })
  if (row.notams?.some((notam) => (notam.effect ?? notam.status) === 'undetermined')) items.push({ text: 'NOTAM 판정 불가', kind: 'warning' })
  if (row.timeStatus === 'not_provided') items.push({ text: '시간 판단 불가', kind: 'warning' })
  if (row.candidateStatus === 'input_invalid' || row.status === 'input_invalid') {
    items.push({ text: '이 항로의 공표 고도 방향 규칙상 비교 대상 아님', kind: 'warning' })
  } else if (row.weatherStatus === 'weather_unavailable') {
    items.push({ text: 'KIM 고도 기상 자료가 없어 비교할 수 없음', kind: 'warning' })
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


function secondaryGrades(exposureNmByGrade, highestGrade) {
  return Object.entries(exposureNmByGrade ?? {})
    .map(([grade, nm]) => ({ grade: Number(grade), nm }))
    .filter(({ grade, nm }) => grade !== Number(highestGrade) && nm > 0)
    .sort((a, b) => b.grade - a.grade)
}

function hazardSummary(hazards) {
  return [...new Set(hazards.map((hazard) => `${hazard.source} ${hazard.label}`))].join(' · ')
}

function altitudeLabel(altitude) {
  const lower = altitude?.lower_fl ?? altitude?.lower
  const upper = altitude?.upper_fl ?? altitude?.upper
  if (lower == null && upper == null) return '고도 범위 없음'
  if (lower == null) return `지상–FL${upper}`
  if (upper == null) return `FL${lower} 이상`
  return `FL${lower}–FL${upper}`
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
  if (loading) return <p className="rb-alternatives-status">고도별 기상 비교를 불러오는 중…</p>
  if (error) return <p className="rb-alternatives-status">고도별 기상 비교를 확인할 수 없습니다: {error}</p>
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
      {rows.length > 0 && (
        <div className="rb-altitude-row rb-altitude-row-head" aria-hidden="true">
          <span className="rb-card-fl">고도</span>
          <span className="rb-card-column rb-card-wind"><Wind size={14} />바람</span>
          <span className="rb-card-column rb-card-icing"><Snowflake size={14} />착빙</span>
          <span className="rb-card-column rb-card-turbulence"><Waves size={14} />난류</span>
          <span className="rb-card-hazard"><CloudLightning size={14} />위험기상</span>
          <span className="rb-card-total-exposure">노출</span>
        </div>
      )}
      {rows.map((row) => {
        const altitudeFt = row.altFt ?? row.altitudeFt
        const status = row.candidateStatus ?? row.status
        const selected = altitudeFt === selectedAltitudeFt
        const selectable = status === 'valid' && row.weatherStatus !== 'weather_unavailable'
        const details = rowDetails(row)

        const windKt = row.wind?.meanComponentKt ?? row.wind?.averageKt
        const icingItem = details.find(d => d.kind === 'severity' && d.type === 'icing')
        const turbulenceItem = details.find(d => d.kind === 'severity' && d.type === 'turbulence')
        const warningItems = details.filter(d => d.kind === 'warning')
        const totalExposureNm = Math.round(
          (icingItem?.exposureNm ?? 0) + (turbulenceItem?.exposureNm ?? 0) + (row.hazards ?? []).reduce((sum, h) => sum + exposureNm(h), 0)
        )

        return (
          <button key={`${altitudeFt}-${status}`} type="button" disabled={!selectable} className={`rb-alternative-card rb-altitude-row${selected ? ' is-selected' : ''}`} onClick={() => onSelect(altitudeFt)}>
            <strong className="rb-card-fl">{row.label ?? row.fl ?? `FL${Math.round(altitudeFt / 100)}`}{selected && <small>현재 선택</small>}</strong>

            {/* Wind column */}
            <span className="rb-card-column rb-card-wind">
              <Wind size={16} style={{ flex: '0 0 auto' }} />
              {Number.isFinite(windKt) ? `${Math.round(windKt)}kt ${windKt >= 0 ? '순' : '맞'}` : <Minus size={16} style={{ opacity: 0.5 }} />}
            </span>

            {/* Icing column — collapsed: 등급 배지만. 정확한 NM·등급별 분해는 선택 시 상세에 표시(사이드바 폭 제약). */}
            <span className="rb-card-column rb-card-icing">
              <Snowflake size={16} style={{ flex: '0 0 auto' }} />
              {icingItem ? <span className={`sev-${severityBadge(icingItem.grade).code.toLowerCase()}`}>{severityBadge(icingItem.grade).code}</span> : <Minus size={16} style={{ opacity: 0.5 }} />}
            </span>

            {/* Turbulence column — collapsed: 등급 배지만. */}
            <span className="rb-card-column rb-card-turbulence">
              <Waves size={16} style={{ flex: '0 0 auto' }} />
              {turbulenceItem ? <span className={`sev-${severityBadge(turbulenceItem.grade).code.toLowerCase()}`}>{severityBadge(turbulenceItem.grade).code}</span> : <Minus size={16} style={{ opacity: 0.5 }} />}
            </span>

            {/* Hazards — fixed column, always visible. 출처만 축약 표시, 현상명·거리는 선택 시 상세에. */}
            <span className="rb-card-column rb-card-hazard">
              <CloudLightning size={16} style={{ flex: '0 0 auto' }} />
              {row.hazards?.length ? row.hazards.map((hazard) => {
                const isOn = hazard.encounter === 'on'
                return (
                  <span key={`${hazard.source}-${hazard.sourceId}`} className={`hz-chip ${isOn ? 'hz-on' : 'hz-near'}`}>{hazard.source}</span>
                )
              }) : <Minus size={16} style={{ opacity: 0.5 }} />}
            </span>

            {/* 선택 시 상세 — 착빙·난류 등급별 노출과 위험기상 개별 정보를 전부 펼침. */}
            {selected && (icingItem || turbulenceItem || row.hazards?.length > 0) && (
              <span className="rb-card-hazard-detail">
                {icingItem && (
                  <span className="rb-card-detail-line">
                    <Snowflake size={14} style={{ flex: '0 0 auto' }} />
                    착빙 <span className={`sev-${severityBadge(icingItem.grade).code.toLowerCase()}`}>{severityBadge(icingItem.grade).ko}</span>
                    {icingItem.exposureNm > 0 ? ` ${Math.round(icingItem.exposureNm)} NM` : ''}
                    {secondaryGrades(icingItem.exposureNmByGrade, icingItem.grade).map(({ grade, nm }) => (
                      <span key={grade} className="rb-card-subgrade">{severityBadge(grade).ko} {Math.round(nm)} NM</span>
                    ))}
                  </span>
                )}
                {turbulenceItem && (
                  <span className="rb-card-detail-line">
                    <Waves size={14} style={{ flex: '0 0 auto' }} />
                    난류 <span className={`sev-${severityBadge(turbulenceItem.grade).code.toLowerCase()}`}>{severityBadge(turbulenceItem.grade).ko}</span>
                    {turbulenceItem.exposureNm > 0 ? ` ${Math.round(turbulenceItem.exposureNm)} NM` : ''}
                    {secondaryGrades(turbulenceItem.exposureNmByGrade, turbulenceItem.grade).map(({ grade, nm }) => (
                      <span key={grade} className="rb-card-subgrade">{severityBadge(grade).ko} {Math.round(nm)} NM</span>
                    ))}
                  </span>
                )}
                {row.hazards?.map((hazard) => {
                  const isOn = hazard.encounter === 'on'
                  const nm = Math.round(exposureNm(hazard))
                  return (
                    <span key={`${hazard.source}-${hazard.sourceId}-detail`} className={`rb-card-detail-line ${isOn ? 'enc-on' : 'enc-near'}`}>
                      {hazard.source.includes('SIGMET') || hazard.source.includes('AIRMET') ? <CloudLightning size={14} style={{ flex: '0 0 auto' }} /> : <Mountain size={14} style={{ flex: '0 0 auto' }} />}
                      {hazard.source} · {hazard.label} · {altitudeLabel(hazard.altitude)}{nm > 0 ? ` · ${nm} NM` : ''} · {isOn ? '실제 조우' : '인근'}
                    </span>
                  )
                })}
              </span>
            )}

            {/* Total exposure — 열 헤더가 "노출"로 이미 라벨링돼 있어 접두어 없이 숫자만. */}
            <span className={`rb-card-column rb-card-total-exposure${totalExposureNm === 0 ? ' is-zero' : ''}`}>
              {totalExposureNm} NM
            </span>

            {/* Warnings and other status messages */}
            {warningItems.map((w) => <span key={w.text} className="rb-card-warning">{w.text}</span>)}
            {!details.length && <span className="rb-card-note">{row.reasons?.[0] ?? 'KIM 고도 기상 자료가 없어 비교할 수 없음'}</span>}
            {row.weatherLevel?.mode === 'interpolated' && <span className="rb-card-note">{`KIM FL${Math.round(row.weatherLevel.lowerAltFt / 100)}–FL${Math.round(row.weatherLevel.upperAltFt / 100)} 보간`}</span>}
          </button>
        )
      })}
      {!rows.length && <p className="rb-alternatives-status">{comparison.constraints?.reasons?.[0] ?? '비교 가능한 공표 고도 없음'}</p>}
      {profileLoading && <p className="rb-alternatives-status">오른쪽 연직단면도를 불러오는 중…</p>}
      {profileError && <p className="rb-alternatives-status">연직단면도를 확인할 수 없습니다: {profileError}</p>}
      <p className="rb-alternatives-note">공표 항공로 제약을 기준으로 한 기상 비교 정보이며, 관제 허가·항공기 성능·연료·운항 제한을 결정하지 않습니다.</p>
      {!hideStepActions && <div className="rb-step-actions">
        <Button appearance="secondary" type="button" onClick={onBack}>이전 단계</Button>
        <Button appearance="primary" type="button" onClick={onContinue}>브리핑 준비로</Button>
      </div>}
    </div>
  )
}
