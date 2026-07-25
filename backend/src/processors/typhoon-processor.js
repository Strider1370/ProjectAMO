// KMA 태풍정보 수집.
//  ① typ_now?tm=<현재 UTC 정시>&mode=1 — 활성 태풍 전부의 과거 경로 + 최신 예보를 한 번에.
//  ② typ_lst?disp=1 — 이름을 태풍번호로 이어 붙인다.
// tm을 빼면 태풍이 있어도 빈 응답이 온다. mode=2를 쓰면 과거 경로가 빠진다. 둘 다 조용히 망가진다.
// 활성 태풍이 없으면 ①이 빈 응답이다 — 정상이며 실패가 아니다.
import path from 'path'
import config from '../config.js'
import store from '../store.js'
import { parseTyphoonText, parseTyphoonList, groupByTyphoonNumber } from '../parsers/typhoon-parser.js'
import { errorConePolygon, galePolygon, stormPolygon } from '../briefing/typhoon-geometry.js'

const TIMEOUT_MS = 15000
const TYPE = 'typhoon'

function decode(buffer) {
  try {
    return new TextDecoder('euc-kr').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`typhoon_http_${response.status}`)
    return decode(await response.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

// tm은 현재 UTC 정시. 빠지면 활동 중인 태풍이 있어도 빈 응답이 온다.
export function currentTm(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}00`
}

function tracksUrl(tm) {
  return `${config.api.typhoon_now_url}?tm=${tm}&mode=1&disp=0&help=0&authKey=${config.api.auth_key}`
}

function listUrl() {
  return `${config.api.typhoon_list_url}?disp=1&help=0&authKey=${config.api.auth_key}`
}

// 분석 행 중 분석시각이 가장 늦은 것이 현재 위치다.
function latestAnalysis(rows) {
  const analysis = rows.filter((row) => !row.forecast)
  const pool = analysis.length > 0 ? analysis : rows
  return pool.reduce((latest, row) => (latest === null || row.analyzedAt > latest.analyzedAt ? row : latest), null)
}

export function buildSnapshot({ activeRows, names = [], fetched_at }) {
  const nameByNumber = new Map(names.map((entry) => [entry.number, entry]))
  const grouped = groupByTyphoonNumber(activeRows)
  const typhoons = []
  for (const [number, rows] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const current = latestAnalysis(rows)
    if (!current) continue
    const named = nameByNumber.get(number)
    // 부채꼴은 예보 시점만 감싼다. 분석 시점의 오차반경은 0이라 어차피 원이 없다.
    const forecast = rows.filter((row) => row.forecast)
    typhoons.push({
      number,
      year: current.year,
      seq: Math.max(...rows.map((row) => row.seq)),
      analyzedAt: current.analyzedAt,
      // 이름을 못 받아도 태풍을 빠뜨리지 않는다. 화면이 번호만으로 표시한다.
      name: named?.name ?? null,
      nameEn: named?.nameEn ?? null,
      current,
      rows,
      // 강풍/폭풍은 현재 시점만(스펙 §9).
      geometry: {
        cone: errorConePolygon(forecast),
        gale: galePolygon(current),
        storm: stormPolygon(current),
      },
    })
  }
  return { fetched_at, status: 'ok', typhoons }
}

export async function process() {
  const dir = path.join(config.storage.base_path, TYPE)
  const fetched_at = new Date().toISOString()
  let activeRows
  try {
    activeRows = parseTyphoonText(await fetchText(tracksUrl(currentTm())))
  } catch (error) {
    // 수집 실패는 "태풍 없음"이 아니다. 직전 스냅샷을 유지하고 상태만 바꾼다.
    const previous = store.loadLatest(dir)
    const snapshot = { ...(previous ?? { typhoons: [] }), fetched_at, status: 'unavailable', reason: error.message }
    store.save(TYPE, snapshot)
    return snapshot
  }

  // 이름은 있으면 좋은 것이다. 목록 조회가 실패해도 경로 표시는 계속된다.
  let names = []
  if (activeRows.length > 0) {
    try {
      names = parseTyphoonList(await fetchText(listUrl()))
    } catch {
      names = []
    }
  }

  const snapshot = buildSnapshot({ activeRows, names, fetched_at })
  store.save(TYPE, snapshot)
  return snapshot
}

export default { process, buildSnapshot, currentTm }
