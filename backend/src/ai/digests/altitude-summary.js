// Model-facing altitude comparison. The code computes each hazard's exposure per
// altitude and the differences between altitudes, turns status codes into plain
// words and lists data gaps; the model only phrases them. Facts, not advice.

const SEVERITY = { 1: 'LIGHT', 2: 'MODERATE', 3: 'SEVERE' }
const STATUS = {
  valid: '공시 항로고도와 일치',
  input_only: '공시 항로고도와 대조 안 됨',
  input_invalid: '공시 항로고도 아님, 기상 비교 제외',
}
const PROFILE = { applied: '상승·강하 단면 반영', cruise_fallback: '상승·강하 단면 없이 순항고도만 적용' }

export const ALTITUDE_SUMMARY_NOTE = '코드가 고도별 착빙·난류 노출 거리와 고도 간 차이, 항로 방향 바람을 계산한 결과다. 값을 다시 계산하지 말고 그대로 쓰고, 착빙·난류라는 용어를 쓴다. '
  + '위험 종류마다 comparison 문장을 먼저 말하고, 고도 상태는 status 문구로 말한다. 사실 비교이며 고도를 추천하지 않는다.'

const nm = (value) => Math.round(value)

function exposure(summary) {
  if (summary?.status !== 'available') return null
  const grades = Object.entries(summary.exposureNmByGrade ?? {})
    .filter(([grade, distance]) => Number(grade) > 0 && distance > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
  return { totalNm: grades.reduce((sum, [, distance]) => sum + distance, 0),
    text: grades.length ? grades.map(([grade, distance]) => `${SEVERITY[grade] ?? grade} ${nm(distance)}NM`).join(', ') : '없음' }
}

function hazardComparison(rows, key) {
  const measured = rows.map((row) => ({ label: row.label, value: exposure(row[key]?.summary) }))
  const perAltitude = measured.map(({ label, value }) => `${label}: ${value ? value.text : '자료 없음'}`)
  const known = measured.filter((m) => m.value)
  if (known.length < 2) return { perAltitude, comparison: known.length ? '비교할 고도가 하나뿐' : '자료 없음' }
  const totals = known.map((m) => nm(m.value.totalNm))
  const least = Math.min(...totals), most = Math.max(...totals)
  const texts = new Set(known.map((m) => m.value.text))
  if (texts.size === 1) return { perAltitude, comparison: `모든 고도 같음(${known[0].value.text})` }
  const at = (total) => known.filter((_, i) => totals[i] === total).map((m) => m.label).join('·')
  return { perAltitude, comparison: least === most
    ? `노출 거리는 모두 약 ${least}NM로 같고 강도 분포만 다름`
    : `${at(least)}이 가장 짧음(${least}NM), ${at(most)}보다 ${most - least}NM 짧음` }
}

function windText(wind) {
  if (!wind) return '자료 없음'
  const along = (kt) => (kt < 0 ? `맞바람 ${-kt}kt` : kt > 0 ? `뒷바람 ${kt}kt` : '성분 0kt')
  return `항로 방향 평균 ${along(wind.averageKt)} (구간별 ${along(wind.minKt)}~${along(wind.maxKt)}), 평균 ${wind.directionDeg ?? '가변'}° ${wind.speedKt}kt`
}

function windComparison(rows) {
  const known = rows.filter((row) => Number.isFinite(row.wind?.averageKt))
  if (known.length < 2) return known.length ? '비교할 고도가 하나뿐' : '자료 없음'
  const values = known.map((row) => row.wind.averageKt)
  if (new Set(values).size === 1) return `모든 고도 항로 방향 평균 성분이 같음(${values[0]}kt)`
  // Along-track component: positive is tailwind, negative is headwind. Stated as a range, not a ranking.
  const best = Math.max(...values), worst = Math.min(...values)
  const at = (value) => known.filter((row) => row.wind.averageKt === value).map((row) => row.label).join('·')
  const word = (kt) => (kt < 0 ? `맞바람 ${-kt}kt` : kt > 0 ? `뒷바람 ${kt}kt` : '성분 0kt')
  return `항로 방향 평균 바람: ${at(best)} ${word(best)} ~ ${at(worst)} ${word(worst)}`
}

export function altitudeComparisonSummary(data, reference = {}) {
  const rows = data?.rows ?? []
  const altitudes = rows.map((row) => ({ altitude: row.label, status: STATUS[row.status] ?? row.status,
    ...(row.profileStatus && PROFILE[row.profileStatus] ? { profile: PROFILE[row.profileStatus] } : {}) }))
  const statuses = new Set(altitudes.map((a) => a.status))
  const compared = rows.filter((row) => ['valid', 'input_only'].includes(row.status) && row.weatherStatus === 'available')
  const gaps = []
  if (data?.modelTimeCoverage && data.modelTimeCoverage.status !== 'within_available_frames') gaps.push('모델 예보 시각이 비행 시간을 모두 덮지 않음')
  for (const row of rows) {
    if (['valid', 'input_only'].includes(row.status) && row.weatherStatus !== 'available') gaps.push(`${row.label} 기상 자료 없음`)
  }
  if (rows.some((row) => row.profileStatus === 'cruise_fallback')) gaps.push('일부 고도는 상승·강하 없이 순항고도만 적용')
  const advisories = compared.flatMap((row) => (row.hazards?.items ?? []).map((h) => `${row.label}: ${h.source} ${h.label}${h.encounter === 'on' ? '(고도·시간 겹침)' : '(인근)'}`))
  const notamCounts = compared.map((row) => row.notams?.total ?? 0)
  const notams = !notamCounts.some(Boolean) ? [] : new Set(notamCounts).size === 1 && compared.length > 1
    ? [`모든 고도: 경로 관련 NOTAM ${notamCounts[0]}건`]
    : compared.filter((row) => row.notams?.total).map((row) => `${row.label}: 경로 관련 NOTAM ${row.notams.total}건`)
  return {
    note: ALTITUDE_SUMMARY_NOTE,
    ...(statuses.size === 1 && altitudes.length > 1 ? { statusForAll: [...statuses][0] } : {}),
    altitudes: statuses.size === 1 && altitudes.length > 1 ? altitudes.map(({ status: _status, ...rest }) => rest) : altitudes,
    // Korean keys carry the product terms (착빙·난류) into the answer.
    착빙: hazardComparison(compared, 'icing'),
    난류: hazardComparison(compared, 'turbulence'),
    바람: { perAltitude: compared.map((row) => `${row.label}: ${windText(row.wind)}`), comparison: windComparison(compared) },
    advisories: advisories.length ? advisories : '겹치는 SIGMET·AIRMET 없음',
    ...(notams.length ? { notams } : {}),
    ...(gaps.length ? { gaps } : {}),
    scope: '출발·도착 절차 구간을 포함한 경로 전체, 같은 기상 자료와 같은 시각 기준',
    modelRun: reference.crossSectionRun ?? data?.modelTimeCoverage?.selectedKimRun ?? null,
  }
}
