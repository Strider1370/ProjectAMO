// 관리자 콘솔의 서식·정렬 로직. 그리기(JSX)와 분리해 둔 이유는 이 저장소의 프런트 테스트가
// node:test라 JSX를 파싱하지 못해서다. 화면에 실제로 그려지는 모습은 Playwright 계약으로 본다.

// 서버가 내려주는 상태는 다섯 가지뿐이다(backend/src/admin/freshness.js).
// 색만으로 뜻을 전하지 않기 위해 글자를 항상 함께 쓴다.
export const STATUS_WORD = {
  ok: '정상',
  late: '지연',
  stopped: '멈춤',
  never: '자료 없음',
  quiet: '쉬는 시간',
  disabled: '꺼둠',
}

export const STATUS_TONE = {
  ok: 'ok',
  late: 'warn',
  stopped: 'bad',
  never: 'bad',
  quiet: 'quiet',
  disabled: 'quiet',
}

export const EXECUTION_WORD = {
  succeeded: '성공',
  failed: '실패',
  skipped: '건너뜀',
  missed: '미실행',
  unknown: '기록 없음',
}

export function executionProblems(entries = []) {
  return entries.filter((entry) => entry?.isProblem || entry?.outcome === 'failed' || entry?.outcome === 'missed')
}

const SEVERITY = { never: 3, stopped: 3, late: 2, quiet: 1, disabled: 1, ok: 0 }

// "6분 / 2시간 / 64일". 분 미만은 "방금" — 초 단위를 보여줘도 판단이 달라지지 않는다.
export function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간`
  return `${Math.floor(hours / 24)}일`
}

// 정상 주기 표기. 5분·10분·6시간처럼 사람이 말하는 단위로 되돌린다.
export function formatInterval(ms) {
  if (!Number.isFinite(ms)) return '—'
  if (ms >= 3_600_000) {
    const hours = ms / 3_600_000
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}시간`
  }
  return `${Math.round(ms / 60_000)}분`
}

// null은 "아직 판단할 자료가 없다"이고 0은 "전부 실패했다"이다 — 둘을 같은 모양으로 그리면 안 된다.
export function formatRate(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

export function formatMs(value) {
  if (value == null) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(1)}초` : `${Math.round(value)} ms`
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function percent(used, total) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

// 확인이 필요한 것만, 심각한 순으로. 쉬는 시간과 정상은 화면에 올리지 않는다 —
// 조용한 것을 알리면 진짜 사건이 묻힌다.
export function attentionItems(rows = []) {
  return rows
    .filter((row) => row.status === 'stopped' || row.status === 'never' || row.status === 'late')
    .slice()
    .sort((a, b) => (SEVERITY[b.status] - SEVERITY[a.status]) || String(a.label).localeCompare(String(b.label)))
}

// 세 계열(총 접속·신규 방문자·신규 가입)을 날짜로 합쳐 같은 축에 놓는다.
// 따로 그리면 각자 제 최댓값에 맞춰 늘어나서 위아래를 비교하면 틀린 결론이 나온다.
export function trendGroups(trends) {
  if (!trends) return []
  const byPeriod = new Map()
  const put = (rows, index) => {
    for (const row of rows || []) {
      if (!byPeriod.has(row.period)) byPeriod.set(row.period, [0, 0, 0])
      byPeriod.get(row.period)[index] = row.n
    }
  }
  put(trends.visits, 0)
  put(trends.newVisitors, 1)
  put(trends.signups, 2)
  return [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, values]) => ({ label, values }))
}

// 임계값 근거: 관리자 콘솔 기존 규칙(<70 정상·70~89 주의·90+ 위험).
export function levelTone(pct) {
  return pct < 70 ? 'ok' : pct < 90 ? 'warn' : 'bad'
}

export default {
  STATUS_WORD, STATUS_TONE, EXECUTION_WORD, executionProblems, formatAge, formatInterval, formatRate, formatMs,
  formatBytes, percent, attentionItems, trendGroups, levelTone,
}
