// 관리자 콘솔: "이 속도면 며칠 남았나". 처음과 끝 두 점의 기울기만 본다 — 회귀를 넣어도
// 이 화면이 답하는 질문("대충 언제 위험한가")의 정확도는 나아지지 않는다.
// ponytail: 두 점 기울기. 계단식 증가가 문제되면 그때 회귀로 올린다.
export function forecastDiskFull(series) {
  if (!Array.isArray(series) || series.length < 2) return null
  const first = series[0]
  const last = series[series.length - 1]
  const spanMs = Date.parse(last.ts) - Date.parse(first.ts)
  if (!(spanMs > 0)) return null

  const grown = last.disk_used - first.disk_used
  if (!(grown > 0)) return null

  const perDayBytes = grown / (spanMs / 86400000)
  const remaining = last.disk_total - last.disk_used
  if (!(remaining > 0)) return { perDayBytes, daysLeft: 0, fullAt: last.ts }

  const daysLeft = Math.floor(remaining / perDayBytes)
  return { perDayBytes, daysLeft, fullAt: new Date(Date.now() + daysLeft * 86400000).toISOString() }
}

export default { forecastDiskFull }
