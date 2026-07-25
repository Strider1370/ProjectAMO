// 실제 강수 사례에서 개별 화살표의 정오답을 실측한다. 합성 데이터를 쓰지 않는다.
// 게이트 A: --mode=baseline (기본). 게이트 B: --mode=mtrec.
import config from '../src/config.js'
import { parseRadarBinary } from '../src/parsers/radar-echo-parser.js'
import { fetchWithTimeout } from '../src/lib/fetchWithTimeout.js'
import { createMotionInput } from '../src/processors/radar-motion.js'

const CASES = ['202607180635', '202607180035', '202607210335', '202607200935']
const STRIDE = 4
const CELL_KM = STRIDE * 0.5
const MIN_REFL = 2000
const PATCH = 6
const NO_DATA = -25000

const mode = (process.argv.find((a) => a.startsWith('--mode=')) || '--mode=baseline').split('=')[1]

const pad = (n) => String(n).padStart(2, '0')
const tmAt = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}` }
const tmToMs = (tm) => Date.UTC(+tm.slice(0, 4), +tm.slice(4, 6) - 1, +tm.slice(6, 8), +tm.slice(8, 10), +tm.slice(10, 12))

async function fetchGrid(tm, { clamp }) {
  const url = `${config.api.radar_url}?${new URLSearchParams({
    tm, data: 'bin', cmp: config.radar_echo.cmp, authKey: config.api.radar_satellite_auth_key,
  })}`
  const res = await fetchWithTimeout(url, config.radar_echo.timeout_ms)
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10000 || buf[0] !== 0x1f || buf[1] !== 0x8b) return null
  const { refl, nx, ny } = parseRadarBinary(buf)
  const grid = createMotionInput(refl, { nx, ny }, { stride: STRIDE, tm })
  if (clamp) return grid
  // 클램프 효과를 재기 위해 원본 no-data를 되살린 사본도 만든다.
  const values = Int16Array.from(grid.values)
  const width = Math.ceil(nx / STRIDE)
  for (let row = 0; row < grid.height; row += 1) {
    for (let col = 0; col < grid.width; col += 1) {
      let max = -32768
      for (let y = row * STRIDE; y < Math.min((row + 1) * STRIDE, ny); y += 1) {
        for (let x = col * STRIDE; x < Math.min((col + 1) * STRIDE, nx); x += 1) max = Math.max(max, refl[y * nx + x])
      }
      values[row * width + col] = max
    }
  }
  return { ...grid, values }
}

const at = (g, x, y) => (x < 0 || y < 0 || x >= g.width || y >= g.height) ? 0 : g.values[y * g.width + x]

function sad(a, b, ax, ay, bx, by, half) {
  let sum = 0, n = 0
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) { sum += Math.abs(at(a, ax + dx, ay + dy) - at(b, bx + dx, by + dy)); n += 1 }
  }
  return sum / n
}

const parab = (m, c, p) => { const d = m - 2 * c + p; return d <= 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (m - p) / d)) }

function bestOffset(prev, curr, x, y, search, half) {
  let best = null
  const score = new Map()
  for (let dy = -search; dy <= search; dy += 1) {
    for (let dx = -search; dx <= search; dx += 1) {
      const s = sad(prev, curr, x - dx, y - dy, x, y, half)
      score.set(`${dx}:${dy}`, s)
      if (!best || s < best.s) best = { dx, dy, s }
    }
  }
  const get = (dx, dy) => score.get(`${dx}:${dy}`) ?? best.s
  return {
    ...best,
    subDx: best.dx + parab(get(best.dx - 1, best.dy), best.s, get(best.dx + 1, best.dy)),
    subDy: best.dy + parab(get(best.dx, best.dy - 1), best.s, get(best.dx, best.dy + 1)),
  }
}

function scoreCase(g1, g2, g3, useSub) {
  const search = Math.ceil(100 * (5 / 60) / CELL_KM)
  let total = 0, correct = 0
  for (let y = PATCH; y < g2.height - PATCH; y += 4) {
    for (let x = PATCH; x < g2.width - PATCH; x += 4) {
      if (at(g2, x, y) < MIN_REFL) continue
      const v = bestOffset(g1, g2, x, y, search, PATCH)
      const dx = Math.round(useSub ? v.subDx : v.dx)
      const dy = Math.round(useSub ? v.subDy : v.dy)
      total += 1
      if (sad(g2, g3, x - dx, y - dy, x, y, PATCH) < sad(g2, g3, x, y, x, y, PATCH)) correct += 1
    }
  }
  return { total, correct }
}

console.log(`모드: ${mode}`)
for (const tm of CASES) {
  const base = tmToMs(tm)
  const clamped = [], raw = []
  for (const step of [-10, -5, 0]) {
    clamped.push(await fetchGrid(tmAt(base + step * 60000), { clamp: true }))
    raw.push(await fetchGrid(tmAt(base + step * 60000), { clamp: false }))
  }
  if (clamped.some((g) => !g)) { console.log(`${tm}: 프레임 수신 실패, 건너뜀`); continue }
  const pct = (r) => `${(r.correct / r.total * 100).toFixed(1)}%`
  const c = scoreCase(...clamped, false)
  const cSub = scoreCase(...clamped, true)
  // 정답(T+5 관측)은 세 열 모두 클램프된 g3로 고정한다. no-data 무늬가 ~89-91%를
  // 차지하고 프레임 간 98.8% 고정이라, g3까지 raw로 두면 무늬-대-무늬 자기정합으로
  // 점수가 부풀려진다. g1/g2만 클램프 여부로 바꿔 화살표 산출 방식만 비교한다.
  const r = scoreCase(raw[0], raw[1], clamped[2], false)
  console.log(`${tm}  화살표 ${c.total}개 | 클램프+정수 ${pct(c)} | 클램프+소수점 ${pct(cSub)} | 클램프없음 ${pct(r)}`)
}
