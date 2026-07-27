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
  return {
    granularity,
    visits: visitTrend(db, granularity),
    newVisitors: newVisitorTrend(db, granularity),
    signups: signupTrend(db, granularity),
  }
}

export default { bucketByDay, visitTrend, newVisitorTrend, signupTrend, readTrends }
