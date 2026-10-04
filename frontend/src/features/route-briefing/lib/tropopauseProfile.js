import { isothermSegments, chainContourSegments } from '../../../shared/weather/gridContours.js'

const KT_PER_MS = 1.94384
export const TROPOPAUSE_BREAK_FT = 5000
// 등풍속선: 80 kt(SIGWX 제트 기준)는 굵게, 그 위로 20 kt 간격은 가늘게. 촘촘한 곳이 시어가 큰 곳이다.
export const JET_ISOTACH_KT = 80
export const ISOTACH_STEP_KT = 20

// 층(평균 고도)을 기압의 로그로 보간해 차트 고도(ft)로 바꾼다. 범위 밖이면 null.
export function altitudeAtPressure(levels, altFor, hPa) {
  if (!Number.isFinite(hPa)) return null
  const sorted = [...levels].filter(l => Number.isFinite(l.pressure) && Number.isFinite(altFor(l))).sort((a, b) => b.pressure - a.pressure)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (hPa <= a.pressure && hPa >= b.pressure) {
      const t = (Math.log(a.pressure) - Math.log(hPa)) / (Math.log(a.pressure) - Math.log(b.pressure))
      return altFor(a) + (altFor(b) - altFor(a)) * t
    }
  }
  return null
}

function gridChains(levels, xFor, yFor, altFor, valueOf, level) {
  const sampleCount = levels[0]?.values?.length ?? 0
  if (levels.length < 2 || sampleCount < 2) return []
  const xs = levels[0].values.map(v => xFor(v.distanceNm))
  const ys = levels.map(l => yFor(altFor(l)))
  const values = levels.flatMap(l => l.values.map(v => valueOf(v, l)))
  if (!values.some(Number.isFinite)) return []
  return chainContourSegments(isothermSegments({ nx: sampleCount, ny: levels.length, values, xs, ys }, level))
}

const speedKt = v => Number.isFinite(v?.u) && Number.isFinite(v?.v) ? Math.hypot(v.u, v.v) * KT_PER_MS : NaN

// 닫힌 80 kt 영역마다 가장 센 지점(제트 핵). 표본점×층 격자에서 이어진 영역을 찾는다.
// 핵이 차트 높이 밖이면 생략하고, 3칸 미만의 작은 영역은 잡음으로 본다.
function jetCores(levels, xFor, yFor, altFor, yMax) {
  const ny = levels.length, nx = levels[0]?.values?.length ?? 0
  if (ny < 2 || nx < 2) return []
  const speed = levels.map(l => l.values.map(speedKt))
  const seen = levels.map(() => new Uint8Array(nx))
  const cores = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (seen[j][i] || !(speed[j][i] >= JET_ISOTACH_KT)) continue
    let best = null, size = 0
    const stack = [[j, i]]; seen[j][i] = 1
    while (stack.length) {
      const [y, x] = stack.pop(); size++
      if (!best || speed[y][x] > best.kt) best = { kt: speed[y][x], j: y, i: x }
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const yy = y + dy, xx = x + dx
        if (yy >= 0 && yy < ny && xx >= 0 && xx < nx && !seen[yy][xx] && speed[yy][xx] >= JET_ISOTACH_KT) { seen[yy][xx] = 1; stack.push([yy, xx]) }
      }
    }
    const alt = altFor(levels[best.j])
    if (size < 3 || !Number.isFinite(alt) || alt > yMax) continue
    cores.push({ x: xFor(levels[best.j].values[best.i].distanceNm), y: yFor(alt), kt: Math.round(best.kt / 5) * 5, fl: Math.round(alt / 1000) * 10 })
  }
  return cores.sort((a, b) => b.kt - a.kt).map(c => ({ ...c, text: `${c.kt} kt FL${c.fl}` }))
}

// 등풍속선 단계: 80 kt부터 단면 최대풍까지 20 kt 간격.
function isotachLevels(levels) {
  const max = Math.max(0, ...levels.flatMap(l => l.values.map(speedKt)).filter(Number.isFinite))
  const out = []
  for (let kt = JET_ISOTACH_KT; kt <= max; kt += ISOTACH_STEP_KT) out.push({ kt, width: kt === JET_ISOTACH_KT ? 2 : 1, major: kt === JET_ISOTACH_KT })
  return out
}

// 선마다 라벨 하나. 가운데부터 1/4·3/4 지점 순으로 시도해, 다른 라벨(50 px)이나 핵 라벨 상자와 겹치면 다음 자리로.
function isotachLabels(isotachs, cores = []) {
  const placed = []
  const hitsCore = p => cores.some(c => p.x > c.x - 12 && p.x < c.x + 20 + c.text.length * 6.6 && p.y > c.y - 30 && p.y < c.y + 12)
  for (const { kt, chains } of isotachs) for (const pts of chains) {
    if (pts.length < 2) continue
    const p = [0.5, 0.25, 0.75, 0.1, 0.9].map(f => pts[Math.floor((pts.length - 1) * f)])
      .find(q => !hitsCore(q) && !placed.some(r => Math.hypot(r.x - q.x, r.y - q.y) < 50))
    if (p) placed.push({ x: p.x, y: p.y, text: String(kt) })
  }
  return placed
}

/** 단면 차트 상층 요소: 성층권 면(권계면 위)과 경계선(+차트 위 표기), 80 kt부터 20 kt 간격 등풍속선과 제트 핵.
 * 권계면은 같은 표본점의 KIM 결과(기압)를 층 평균 고도로 보간한다. FL 라벨은 기압고도다. */
export function buildTropopauseProfileLayers({ crossSection, xFor, yFor, altFor, yMax }) {
  const levels = (crossSection?.levels ?? []).filter(l => Array.isArray(l.values) && l.values.length)
  // 제트 표시는 상층(500 hPa 위)만 그려 하층의 구름·착빙·난류 표시와 겹치지 않게 한다.
  // 권계면 자료에 붙어 오는 100·70 hPa 바람을 더해 150 hPa 위에서도 80 kt 선이 닫히게 한다.
  const extra = (crossSection?.tropopause?.upperLevels ?? []).filter(l => l.values?.length === levels[0]?.values?.length)
  const upper = [...levels.filter(l => l.pressure <= 500), ...extra].sort((a, b) => b.pressure - a.pressure)
  // 권계면 기압→차트 고도 보간도 100·70 hPa 층까지 쓴다(그래야 FL500대 열대 권계면이 차트 안에 그려진다).
  const heightLevels = [...levels, ...extra]
  const samples = crossSection?.tropopause?.available ? crossSection.tropopause.samples ?? [] : []
  // 권계면 단절: 이웃한 표본점 사이에서 5,000 ft 넘게 뛰면 선과 면을 끊어 두 권계면을 따로 그린다.
  const chains = [], above = []
  let current = []
  const close = () => { if (current.length > 1) chains.push(current); current = [] }
  for (const s of samples) {
    const alt = altitudeAtPressure(heightLevels, altFor, s.tropopauseHpa)
    const inside = Number.isFinite(alt) && alt <= yMax
    if (inside) {
      if (current.length && Math.abs(alt - current.at(-1).alt) > TROPOPAUSE_BREAK_FT) close()
      current.push({ x: xFor(s.distanceNm), y: yFor(alt), alt, ft: s.tropopauseFt })
    } else {
      close()
      if (s.tropopauseAboveTop || Number.isFinite(s.tropopauseFt)) above.push(s)
    }
  }
  close()
  const fl = ft => Math.round(ft / 1000) * 10
  // 구간마다 가운데에 라벨 하나(짧은 구간은 생략).
  const labels = chains.filter(pts => pts.at(-1).x - pts[0].x > 60).map(pts => {
    const mid = pts[Math.floor(pts.length / 2)]
    return { x: mid.x, y: mid.y, text: `TROP ${fl(mid.ft)}` }
  })
  let aboveLabel = null
  if (above.length > samples.length * 0.2) {
    const known = above.filter(s => Number.isFinite(s.tropopauseFt)).map(s => fl(s.tropopauseFt))
    const text = known.length ? `TROP ${Math.min(...known)}${Math.max(...known) > Math.min(...known) ? `–${Math.max(...known)}` : ''} ▲` : 'TROP ▲'
    aboveLabel = { x: xFor(above[Math.floor(above.length / 2)].distanceNm), text }
  }
  const cores = jetCores(upper, xFor, yFor, altFor, yMax)
  const isotachs = isotachLevels(upper).map(step => ({ ...step, chains: gridChains(upper, xFor, yFor, altFor, speedKt, step.kt) }))
  // 성층권 면: 권계면 경계선 각 구간에서 차트 상단까지 닫은 다각형.
  const top = yFor(yMax)
  const areas = chains.map(pts => [...pts, { x: pts.at(-1).x, y: top }, { x: pts[0].x, y: top }])
  return {
    tropopause: { chains, areas, labels, aboveLabel },
    isotachs,
    isotachLabels: isotachLabels(isotachs, cores),
    jetCores: cores,
  }
}
