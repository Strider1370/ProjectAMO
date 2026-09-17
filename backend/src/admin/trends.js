// 관리자 콘솔: 일/주/월 단위 추이. 세 지표(재방문 포함 접속·신규 방문자·신규 가입)가 전부
// "날짜별 개수"라는 같은 모양이라, SQL은 하루 단위로만 집계하고 주/월 묶기는 여기서 한다 —
// SQLite의 ISO 주차 계산이 까다로워서, 대신 가져온 일별 행을 자바스크립트로 묶는 쪽이 더 명확하고
// 실수하기 어렵다(가져오는 기간 자체가 최대 몇백 일이라 성능도 문제없다).
const WINDOW_DAYS = { day: 14, week: 8 * 7, month: 6 * 31 }

function sinceDay(granularity) {
  const days = WINDOW_DAYS[granularity] ?? WINDOW_DAYS.day
  return new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10)
}

// day 문자열('YYYY-MM-DD')의 일요일 시작 주 키.
function weekStartOf(day) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

export function bucketByDay(rows, granularity) {
  if (granularity === 'day') return rows.map((r) => ({ period: r.day, n: r.n }))
  const keyOf = granularity === 'week' ? weekStartOf : (day) => day.slice(0, 7)
  const bucket = new Map()
  for (const r of rows) bucket.set(keyOf(r.day), (bucket.get(keyOf(r.day)) || 0) + r.n)
  return [...bucket.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, n]) => ({ period, n }))
}

// 재방문 포함 — visit_days(방문자당 하루 최대 한 줄)를 날짜별로 세기만 하면 된다.
export function visitTrend(db, granularity = 'day') {
  const rows = db.prepare('SELECT day, COUNT(*) n FROM visit_days WHERE day >= ? GROUP BY day ORDER BY day').all(sinceDay(granularity))
  return bucketByDay(rows, granularity)
}

// 신규 방문자 — visits.first_seen은 그 방문자가 처음 나타났을 때 딱 한 번만 찍힌다.
export function newVisitorTrend(db, granularity = 'day') {
  const rows = db.prepare("SELECT substr(first_seen,1,10) day, COUNT(*) n FROM visits WHERE first_seen >= ? GROUP BY day ORDER BY day")
    .all(sinceDay(granularity))
  return bucketByDay(rows, granularity)
}

// 신규 가입 — users.created_at.
export function signupTrend(db, granularity = 'day') {
  const rows = db.prepare("SELECT substr(created_at,1,10) day, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY day ORDER BY day")
    .all(sinceDay(granularity))
  return bucketByDay(rows, granularity)
}

export function readTrends(db, granularity = 'day') {
  const selected = ['day', 'week', 'month'].includes(granularity) ? granularity : 'day'
  return {
    granularity: selected,
    visits: visitTrend(db, selected),
    newVisitors: newVisitorTrend(db, selected),
    signups: signupTrend(db, selected),
    measurement: {
      timezone: 'UTC',
      businessDay: 'UTC_calendar_day',
      granularity: selected,
      // visit_days는 browser cookie 기준의 일별 unique이며, request-event heatmap과 다르다.
      visits: { unit: 'unique_browser_cookie_visitor_ids_per_utc_day', retentionMs: 400 * 24 * 60 * 60 * 1000 },
      // visits 표는 90일 후 정리된다. 월 차트의 6개월 선택창은 요청 범위일 뿐,
      // 90일보다 오래된 신규 방문자를 완전하게 재구성한다는 뜻이 아니다.
      newVisitors: { unit: 'first_seen_browser_cookie_visitor_ids_per_utc_day', retentionMs: 90 * 24 * 60 * 60 * 1000, historicalCompleteness: 'limited_to_retained_visits' },
      signups: { unit: 'new_authenticated_user_accounts_per_utc_day', retentionMs: null },
    },
  }
}

export default { bucketByDay, visitTrend, newVisitorTrend, signupTrend, readTrends }
