const STATES = { valid: 'AIP 조건 일치', input_only: '입력 고도 · 조건 미확인', input_invalid: 'AIP 조건 불일치' }
const PROFILES = { applied: '계획 프로파일 적용', cruise_fallback: '프로파일 없음 · 순항고도 기준', not_assessed: '비교 제외' }
const GRADES = { 0: '없음', 1: 'LIGHT', 2: 'MODERATE', 3: 'SEVERE', none: '없음', light: 'LIGHT', moderate: 'MODERATE', severe: 'SEVERE' }

function grade(value) {
  if (value?.status !== 'available' || value.highestGrade == null) return '자료 없음'
  return GRADES[value.highestGrade] ?? `등급 ${value.highestGrade}`
}

export default function AltitudeComparisonCard({ result }) {
  const data = result.data
  if (!Array.isArray(data?.rows)) return null
  return <div className="copilot-altitudes">
    <p>같은 경로·기상자료 기준 비교입니다. 고도 추천이나 안전 순위가 아닙니다.</p>
    <table>
      <caption>요청 고도별 비교 · 절차 구간을 포함한 전체 경로</caption>
      <thead><tr><th scope="col">고도·조건</th><th scope="col">기상자료</th></tr></thead>
      <tbody>{data.rows.map((row) => <tr key={row.altitudeFt}>
        <th scope="row">{row.label ?? `${row.altitudeFt} ft`}<small>{STATES[row.status] ?? '조건 미확인'}</small>
          <small>{PROFILES[row.profileStatus] ?? '프로파일 미확인'}</small></th>
        <td>{row.status === 'input_invalid' ? '비교 제외' : <>
          <span>바람 {row.wind ? `${row.wind.directionDeg == null ? '방향 미상' : `${row.wind.directionDeg}°`} / ${row.wind.speedKt} kt` : '자료 없음'}</span>
          <span>착빙 {grade(row.icing?.summary)}</span>
          <span>난류 {grade(row.turbulence?.summary)}</span>
          <span>관련 경보 {row.hazards?.total ?? row.hazards?.length ?? 0}건 · NOTAM {row.notams?.total ?? row.notams?.length ?? 0}건</span>
        </>}</td>
      </tr>)}</tbody>
    </table>
    <p>경보 0건·조건 일치는 안전 확인이 아닙니다. AIP 조건은 항로 구간 기준이며, 자료 미확인 범위를 함께 확인하세요.</p>
  </div>
}
