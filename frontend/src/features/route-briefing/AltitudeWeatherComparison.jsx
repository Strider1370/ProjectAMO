import './RouteBriefing.css'

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
  if (Number.isFinite(windKt)) items.push(`평균 ${windKt >= 0 ? '순풍 +' : '맞바람 '}${Math.round(windKt)}kt`)
  if (row.icing?.summary?.status === 'available') items.push(`착빙 ${gradeLabel(row.icing.summary.highestGrade)}${exposureLabel(row.icing.summary.highestGradeExposureNm)}`)
  if (row.turbulence?.summary?.status === 'available') items.push(`난류 ${gradeLabel(row.turbulence.summary.highestGrade)}${exposureLabel(row.turbulence.summary.highestGradeExposureNm)}`)
  if (row.hazards?.length) items.push(hazardSummary(row.hazards))
  if (row.notams?.some((notam) => (notam.effect ?? notam.status) === 'undetermined')) items.push('NOTAM 판정 불가')
  if (row.timeStatus === 'not_provided') items.push('시간 판단 불가')
  if (row.candidateStatus === 'input_invalid' || row.status === 'input_invalid') {
    items.push('이 항로의 공표 고도 방향 규칙상 비교 대상 아님')
  } else if (row.weatherStatus === 'weather_unavailable') {
    items.push('KIM 고도 기상 자료가 없어 비교할 수 없음')
  }
  return items
}

function gradeLabel(grade) {
  return ({ 0: '없음', 1: '약', 2: '중', 3: '심' }[Number(grade)] ?? '판정 불가')
}

function exposureLabel(distanceNm) {
  return Number.isFinite(distanceNm) && distanceNm > 0 ? ` ${Math.round(distanceNm)} NM` : ''
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
  profileOpen,
  onShowProfile,
}) {
  if (loading) return <p className="rb-alternatives-status">고도별 기상 비교를 불러오는 중…</p>
  if (error) return <p className="rb-alternatives-status">고도별 기상 비교를 확인할 수 없습니다: {error}</p>
  if (!comparison) return <p className="rb-alternatives-status">고도별 기상 비교 자료 없음</p>

  const rows = comparison.rows ?? []
  const validAltitudeLabels = rows
    .filter((row) => (row.candidateStatus ?? row.status) === 'valid')
    .map((row) => row.label ?? row.fl ?? `FL${Math.round((row.altFt ?? row.altitudeFt) / 100)}`)
  const excludedInput = rows.find((row) => (row.candidateStatus ?? row.status) === 'input_invalid')
  return (
    <div className="rb-altitude-comparison">
      <p className="rb-alternatives-status">{constraintLabel(comparison.constraints)}</p>
      {excludedInput && validAltitudeLabels.length > 0 && (
        <p className="rb-alternatives-status">
          {`${excludedInput.label ?? `FL${Math.round((excludedInput.altFt ?? excludedInput.altitudeFt) / 100)}`}은 이 항로의 공표 고도 방향 규칙에 맞지 않습니다. 비교 가능한 고도: ${validAltitudeLabels.join(', ')}`}
        </p>
      )}
      {rows.map((row) => {
        const altitudeFt = row.altFt ?? row.altitudeFt
        const status = row.candidateStatus ?? row.status
        const selected = altitudeFt === selectedAltitudeFt
        const selectable = status === 'valid' && row.weatherStatus !== 'weather_unavailable'
        const details = rowDetails(row)
        return (
          <button key={`${altitudeFt}-${status}`} type="button" disabled={!selectable} className={`rb-alternative-card${selected ? ' is-selected' : ''}`} onClick={() => onSelect(altitudeFt)}>
            <strong>{row.label ?? row.fl ?? `FL${Math.round(altitudeFt / 100)}`}{selected ? ' · 현재 선택' : ''}</strong>
            {details.map((detail) => <span key={detail}>{detail}</span>)}
            {selected && row.hazards?.map((hazard) => <span key={`${hazard.source}-${hazard.sourceId}`}>{`${hazard.source} · ${hazard.label} · ${altitudeLabel(hazard.altitude)} · ${hazard.timeStatus === 'matched' ? '비행 시간과 겹침' : '시간 확인 필요'}`}</span>)}
            {!details.length && <span>{row.reasons?.[0] ?? 'KIM 고도 기상 자료가 없어 비교할 수 없음'}</span>}
            {row.weatherLevel?.mode === 'interpolated' && <span>{`KIM FL${Math.round(row.weatherLevel.lowerAltFt / 100)}–FL${Math.round(row.weatherLevel.upperAltFt / 100)} 보간`}</span>}
          </button>
        )
      })}
      {!rows.length && <p className="rb-alternatives-status">{comparison.constraints?.reasons?.[0] ?? '비교 가능한 공표 고도 없음'}</p>}
      {profileLoading && <p className="rb-alternatives-status">오른쪽 연직단면도를 불러오는 중…</p>}
      {profileError && <p className="rb-alternatives-status">연직단면도를 확인할 수 없습니다: {profileError}</p>}
      {!profileLoading && !profileError && !profileOpen && <button type="button" className="route-check-secondary-button" onClick={onShowProfile}>연직단면도 다시 보기</button>}
      <p className="rb-alternatives-note">공표 항공로 제약을 기준으로 한 기상 비교 정보이며, 관제 허가·항공기 성능·연료·운항 제한을 결정하지 않습니다.</p>
      <div className="rb-step-actions">
        <button type="button" className="route-check-secondary-button" onClick={onBack}>이전 단계</button>
        <button type="button" className="route-check-search-button" onClick={onContinue}>브리핑 준비로</button>
      </div>
    </div>
  )
}
