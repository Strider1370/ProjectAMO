#!/usr/bin/env node
// Skew-T log-P 프로토타입.
// 이미 수집된 KIM 격자(backend/data/kim_nwp)에서 한 지점의 연직 프로파일을 뽑아
// 자체 완결형 HTML(인라인 SVG)로 그린다. 새 API 호출 없음.
//
// 사용:
//   node prototypes/skewt/skewt.mjs --lat 37.46 --lon 126.44 --label RKSI --hf 0
//   node prototypes/skewt/skewt.mjs --check     (열역학 자체검증)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const KIM_DIR = path.join(ROOT, 'backend/data/kim_nwp')

// ---------------------------------------------------------------- 열역학

const Rd = 287.04      // J/(kg K)
const cpd = 1005.7     // J/(kg K)
const Lv = 2.501e6     // J/kg
const EPS = 0.622
const KAPPA = Rd / cpd // 0.2854
const K0 = 273.15

// Bolton(1980) eq.10 — 물에 대한 포화수증기압 (hPa, T in degC)
const es = (Tc) => 6.112 * Math.exp((17.67 * Tc) / (Tc + 243.5))

// 수증기압 e(hPa) -> 이슬점(degC), es의 역함수
function dewpointFromE(e) {
  if (!(e > 0)) return NaN
  const l = Math.log(e / 6.112)
  return (243.5 * l) / (17.67 - l)
}

// 혼합비 (kg/kg)
const mixingRatio = (e, p) => (EPS * e) / Math.max(p - e, 1e-6)

// 가온도 (K) — CAPE에서 부력을 제대로 잡으려면 필요하다
const virtualT = (Tk, r) => Tk * (1 + r / EPS) / (1 + r)

// 온위 (K)
const theta = (Tk, p) => Tk * (1000 / p) ** KAPPA

// 건조단열: 온위 보존
const dryAdiabatT = (thetaK, p) => thetaK * (p / 1000) ** KAPPA

// Bolton(1980) eq.15 — LCL 온도 (K). T, Td는 K
function lclTemperature(Tk, Tdk) {
  return 1 / (1 / (Tdk - 56) + Math.log(Tk / Tdk) / 800) + 56
}

// 습윤(가단열) 단열선 기울기 dT/dp (K/hPa)
function moistLapseDTdp(Tk, p) {
  const r = mixingRatio(es(Tk - K0), p)
  const num = Rd * Tk + Lv * r
  const den = cpd + (Lv * Lv * r * EPS) / (Rd * Tk * Tk)
  return num / den / p
}

// p0에서 T0(K)인 기괴를 p까지 가단열로 올린 온도. dp는 음수 방향으로 적분
function moistAdiabatT(T0k, p0, pTarget, step = 2) {
  let T = T0k
  let p = p0
  const dir = pTarget < p0 ? -1 : 1
  while ((dir < 0 && p > pTarget) || (dir > 0 && p < pTarget)) {
    const dp = dir * Math.min(step, Math.abs(p - pTarget))
    // RK2
    const k1 = moistLapseDTdp(T, p)
    const k2 = moistLapseDTdp(T + k1 * dp, p + dp)
    T += ((k1 + k2) / 2) * dp
    p += dp
  }
  return T
}

// 습구온위 theta_w(degC)로 정의되는 습윤단열선 위의 온도
function moistAdiabatFromThetaW(thetaWc, p) {
  return moistAdiabatT(thetaWc + K0, 1000, p)
}

// 혼합비 w(g/kg)가 되는 등포화혼합비선 위의 온도(degC)
function tempFromMixingRatio(wgkg, p) {
  const w = wgkg / 1000
  const e = (w * p) / (EPS + w)
  return dewpointFromE(e)
}

// ---------------------------------------------------------------- 격자 읽기

function latestRunDir() {
  const runsDir = path.join(KIM_DIR, 'runs')
  const runs = fs.readdirSync(runsDir).filter((d) => /^KIMG_/.test(d)).sort()
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const dir = path.join(runsDir, runs[i])
    if (fs.existsSync(path.join(dir, 'normalized'))) return dir
  }
  throw new Error(`사용 가능한 KIM 런이 없다: ${runsDir}`)
}

function decode(variable, index) {
  // 층마다 수집 변수가 다르다 (착빙용 rh_liq/구름량은 300hPa 이상만)
  if (!variable || !Array.isArray(variable.values)) return NaN
  const raw = variable.values[index]
  if (raw === null || raw === undefined || raw === -32768) return NaN
  return raw * variable.scale + variable.offset
}

// 격자에서 lat/lon에 가장 가까운 점의 인덱스. 원자료 순서는 남->북, 서->동
function gridIndex(grid, lat, lon) {
  const ix = Math.round((lon - grid.lonMin) / grid.dx)
  const iy = Math.round((lat - grid.latMin) / grid.dy)
  if (ix < 0 || ix >= grid.nx || iy < 0 || iy >= grid.ny) {
    throw new Error(`영역 밖 지점: ${lat}, ${lon} (영역 ${grid.latMin}~${grid.latMax}N / ${grid.lonMin}~${grid.lonMax}E)`)
  }
  return {
    index: iy * grid.nx + ix,
    lat: grid.latMin + iy * grid.dy,
    lon: grid.lonMin + ix * grid.dx,
  }
}

function readProfile({ lat, lon, hf }) {
  const runDir = latestRunDir()
  const hfDir = path.join(runDir, 'normalized', `hf${String(hf).padStart(3, '0')}`)
  if (!fs.existsSync(hfDir)) throw new Error(`예보시간 없음: ${hfDir}`)

  const levelDirs = fs
    .readdirSync(hfDir)
    .filter((d) => /hPa$/.test(d))
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10)) // 1000 -> 150

  const levels = []
  let meta = null
  let point = null

  for (const levelDir of levelDirs) {
    const file = path.join(hfDir, levelDir, 'grid.json')
    if (!fs.existsSync(file)) continue
    const g = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!point) point = gridIndex(g.grid, lat, lon)
    if (!meta) meta = { tmfc: g.tmfc, hf: g.hf, validTime: g.validTime, model: g.model, runId: path.basename(runDir) }

    const i = point.index
    const Tk = decode(g.variables.T, i)
    const rhLiq = decode(g.variables.rh_liq, i)
    const p = g.level.value
    if (!Number.isFinite(Tk)) continue

    const Tc = Tk - K0
    const rh = decode(g.variables.rh, i)
    // 비습 q가 있으면 그것으로 이슬점을 낸다. 물/빙정 기준 구분이 없어 전 층에서 편향이 없다.
    // q가 없는 옛 런은 rh_liq(물 기준, 300hPa 아래만) -> rh(빙정 혼합) 순으로 물러선다.
    const q = decode(g.variables.q, i)
    let Tdc = NaN
    let tdSource = 'none'
    if (Number.isFinite(q) && q > 0) {
      // q -> 혼합비 -> 수증기압 -> 이슬점
      const w = q / (1 - q)
      Tdc = Math.min(dewpointFromE((w * p) / (EPS + w)), Tc)
      tdSource = 'q'
    } else {
      const rhUsed = Number.isFinite(rhLiq) ? rhLiq : rh
      if (Number.isFinite(rhUsed)) {
        Tdc = Math.min(dewpointFromE((Math.min(Math.max(rhUsed, 0.1), 100) / 100) * es(Tc)), Tc)
        tdSource = Number.isFinite(rhLiq) ? 'rh_liq' : 'rh'
      }
    }

    levels.push({
      p,
      Tc,
      Tdc,
      q: Number.isFinite(q) && q > 0 ? q : NaN,
      tdSource,
      tdFromIceRh: tdSource === 'rh',
      rh,
      rhLiq,
      hgt: decode(g.variables.hgt, i),
      u: decode(g.variables.u, i),
      v: decode(g.variables.v, i),
    })
  }
  if (levels.length < 5) throw new Error('연직층이 너무 적다')
  return { meta, point, levels }
}

// ---------------------------------------------------------------- 지수 계산

// ln(p) 선형보간
function interpAtP(levels, p, key) {
  const sorted = [...levels].sort((a, b) => b.p - a.p)
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (p <= a.p && p >= b.p) {
      const f = (Math.log(a.p) - Math.log(p)) / (Math.log(a.p) - Math.log(b.p))
      return a[key] + f * (b[key] - a[key])
    }
  }
  return NaN
}

function computeParcel(levels) {
  const base = levels[0] // 최하층 = 1000hPa
  const p0 = base.p
  const T0 = base.Tc + K0
  const Td0 = base.Tdc + K0

  const Tlcl = lclTemperature(T0, Td0)
  const pLcl = p0 * (Tlcl / T0) ** (1 / KAPPA)
  const th = theta(T0, p0)

  // 기괴 경로: 지면~LCL 건조단열, 그 위 가단열
  const path = []
  for (let p = p0; p >= 150; p -= 5) {
    const Tk = p >= pLcl ? dryAdiabatT(th, p) : moistAdiabatT(Tlcl, pLcl, p)
    path.push({ p, Tc: Tk - K0 })
  }

  // 부력 적분 (가온도 기준)
  const rParcelBelowLcl = mixingRatio(es(Td0 - K0), p0)
  let cape = 0
  let cin = 0
  let pLfc = NaN
  let pEl = NaN
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    const pm = (a.p + b.p) / 2
    const Tp = ((a.Tc + b.Tc) / 2) + K0
    const Te = interpAtP(levels, pm, 'Tc') + K0
    const Tde = interpAtP(levels, pm, 'Tdc') + K0
    if (!Number.isFinite(Te)) continue

    const rp = pm >= pLcl ? rParcelBelowLcl : mixingRatio(es(Tp - K0), pm)
    const re = Number.isFinite(Tde) ? mixingRatio(es(Tde - K0), pm) : 0
    const dTv = virtualT(Tp, rp) - virtualT(Te, re)
    const dlnp = Math.log(a.p) - Math.log(b.p)
    const contrib = Rd * dTv * dlnp

    if (dTv > 0) {
      if (!Number.isFinite(pLfc) && pm < pLcl) pLfc = pm
      if (Number.isFinite(pLfc)) cape += contrib
    } else {
      if (Number.isFinite(pLfc) && !Number.isFinite(pEl) && cape > 0) pEl = pm
      if (!Number.isFinite(pLfc)) cin += contrib
    }
  }

  return { path, pLcl, tLcl: Tlcl - K0, pLfc, pEl, cape, cin: Math.min(cin, 0) }
}

function computeIndices(levels, parcel) {
  const T500 = interpAtP(levels, 500, 'Tc')
  const T700 = interpAtP(levels, 700, 'Tc')
  const T850 = interpAtP(levels, 850, 'Tc')
  const Td700 = interpAtP(levels, 700, 'Tdc')
  const Td850 = interpAtP(levels, 850, 'Tdc')

  const parcelAt500 = parcel.path.reduce((best, pt) => (Math.abs(pt.p - 500) < Math.abs(best.p - 500) ? pt : best))
  const li = T500 - parcelAt500.Tc

  const kIndex = (T850 - T500) + Td850 - (T700 - Td700)
  const showalter = T500 - (moistAdiabatT(
    lclTemperature(T850 + K0, Td850 + K0),
    850 * (lclTemperature(T850 + K0, Td850 + K0) / (T850 + K0)) ** (1 / KAPPA),
    500,
  ) - K0)
  const totalTotals = (T850 - T500) + (Td850 - T500)

  // 가강수량 (mm) = (1/g)∫q dp. 비습 q를 그대로 적분하는 것이 정의에 맞다.
  // q가 없는 옛 런은 이슬점에서 혼합비를 되짚어 쓰는데, 혼합비는 비습보다 (1+w)배 커서
  // 약 2% 과대가 된다.
  const specificHumidity = (level) => {
    if (Number.isFinite(level.q)) return level.q
    if (!Number.isFinite(level.Tdc)) return NaN
    const w = mixingRatio(es(level.Tdc), level.p)
    return w / (1 + w)
  }
  let pw = 0
  let pwFromQ = true
  for (let i = 0; i < levels.length - 1; i += 1) {
    const a = levels[i]
    const b = levels[i + 1]
    const qa = specificHumidity(a)
    const qb = specificHumidity(b)
    if (!Number.isFinite(qa) || !Number.isFinite(qb)) continue
    if (!Number.isFinite(a.q) || !Number.isFinite(b.q)) pwFromQ = false
    pw += ((qa + qb) / 2) * (a.p - b.p) * 100 / 9.80665 // kg/m2 = mm
  }

  // 결빙고도 / -20degC 고도
  const crossing = (target) => {
    for (let i = 0; i < levels.length - 1; i += 1) {
      const a = levels[i]
      const b = levels[i + 1]
      if ((a.Tc - target) * (b.Tc - target) <= 0 && a.Tc !== b.Tc) {
        const f = (a.Tc - target) / (a.Tc - b.Tc)
        return a.hgt + f * (b.hgt - a.hgt)
      }
    }
    return NaN
  }

  return {
    li, kIndex, showalter, totalTotals, pw, pwFromQ,
    freezingM: crossing(0),
    minus20M: crossing(-20),
  }
}

// ---------------------------------------------------------------- 그리기

const P_BOT = 1050
const P_TOP = 150
// 아래쪽 가장자리에서 보이는 기온 범위. 위로 갈수록 스큐만큼 왼쪽(추운 쪽)으로 창이 이동한다.
const T_MIN = -40
const T_MAX = 40
const PLOT = { x: 78, y: 40, w: 620, h: 660 }
// 등온선을 화면상 45도로 눕힌다. 가로 이동량 = 세로 높이.
const SKEW_PX = 660

const yFrac = (p) => (Math.log(p) - Math.log(P_TOP)) / (Math.log(P_BOT) - Math.log(P_TOP))
const py = (p) => PLOT.y + yFrac(p) * PLOT.h
const px = (Tc, p) =>
  PLOT.x + ((Tc - T_MIN) / (T_MAX - T_MIN)) * PLOT.w + (1 - yFrac(p)) * SKEW_PX
const PLOT_RIGHT = PLOT.x + PLOT.w

function polyline(points, attrs) {
  const d = points
    .filter((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`)
    .join(' ')
  return d ? `<path d="${d}" ${attrs}/>` : ''
}

function curveFor(fn, opts = {}) {
  const pts = []
  for (let p = P_BOT; p >= P_TOP; p -= 5) {
    const Tc = fn(p)
    if (!Number.isFinite(Tc)) continue
    pts.push([px(Tc, p), py(p)])
  }
  return polyline(pts, opts.attrs)
}

function windBarb(x, y, u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return ''
  const spdKt = Math.hypot(u, v) * 1.94384
  // 바람이 불어오는 쪽으로 깃대가 뻗는다
  const dirRad = Math.atan2(-u, -v)
  const L = 26
  const dx = Math.sin(dirRad)
  const dy = -Math.cos(dirRad)
  const tipX = x + dx * L
  const tipY = y + dy * L
  let out = `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${tipX.toFixed(1)}" y2="${tipY.toFixed(1)}" stroke="#111" stroke-width="1.1"/>`

  let remaining = Math.round(spdKt / 5) * 5
  if (remaining < 5) {
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="none" stroke="#111"/>`
  }
  // 깃은 깃대 끝에서 안쪽으로
  const px_ = -dx
  const py_ = -dy
  const perpX = dy
  const perpY = -dx
  let offset = 0
  const step = 5
  const barbLen = 10
  const draw = (len, at, half) => {
    const bx = tipX + px_ * at
    const by = tipY + py_ * at
    const ex = bx + perpX * len + px_ * (half ? 0 : 0)
    const ey = by + perpY * len
    return `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#111" stroke-width="1.1"/>`
  }
  while (remaining >= 50) {
    const bx = tipX + px_ * offset
    const by = tipY + py_ * offset
    const b2x = tipX + px_ * (offset + step)
    const b2y = tipY + py_ * (offset + step)
    out += `<polygon points="${bx.toFixed(1)},${by.toFixed(1)} ${(bx + perpX * barbLen).toFixed(1)},${(by + perpY * barbLen).toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}" fill="#111"/>`
    remaining -= 50
    offset += step + 2
  }
  while (remaining >= 10) {
    out += draw(barbLen, offset, false)
    remaining -= 10
    offset += step
  }
  if (remaining >= 5) out += draw(barbLen / 2, offset, true)
  return out
}

function renderSvg({ meta, point, levels, parcel, indices, label }) {
  const W = 1010
  const H = 790
  const clip = `<clipPath id="plot"><rect x="${PLOT.x}" y="${PLOT.y}" width="${PLOT.w}" height="${PLOT.h}"/></clipPath>`

  let bg = ''

  // 등압선
  const isobars = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150]
  for (const p of isobars) {
    const y = py(p)
    bg += `<line x1="${PLOT.x}" y1="${y.toFixed(1)}" x2="${PLOT_RIGHT}" y2="${y.toFixed(1)}" stroke="#9aa3ad" stroke-width="0.7"/>`
    bg += `<text x="${PLOT.x - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#4a5560">${p}</text>`
    const h = interpAtP(levels, p, 'hgt')
    if (Number.isFinite(h)) {
      bg += `<text x="${PLOT.x - 8}" y="${(y - 6).toFixed(1)}" text-anchor="end" font-size="9" fill="#93a">${Math.round(h / 30.48) * 100}ft</text>`
    }
  }

  let grid = ''
  // 등온선 (기울어진). 눈금 글자는 클립 밖(bg)에 둬야 잘리지 않는다.
  for (let T = -140; T <= 50; T += 10) {
    const pts = [[px(T, P_BOT), py(P_BOT)], [px(T, P_TOP), py(P_TOP)]]
    const major = T === 0
    grid += polyline(pts, `stroke="${major ? '#2f7fd0' : '#b8c2cc'}" stroke-width="${major ? 1.6 : 0.7}" fill="none"`)
    const xb = px(T, P_BOT)
    if (xb >= PLOT.x - 2 && xb <= PLOT_RIGHT + 2) {
      bg += `<text x="${xb.toFixed(1)}" y="${(PLOT.y + PLOT.h + 17).toFixed(1)}" text-anchor="middle" font-size="11" fill="#4a5560">${T}</text>`
    }
  }
  // 건조단열선
  for (let th = -30; th <= 200; th += 10) {
    grid += curveFor((p) => dryAdiabatT(th + K0, p) - K0, {
      attrs: 'stroke="#d98d3a" stroke-width="0.65" fill="none" opacity="0.75"',
    })
  }
  // 습윤단열선
  for (let tw = -20; tw <= 40; tw += 5) {
    grid += curveFor((p) => moistAdiabatFromThetaW(tw, p) - K0, {
      attrs: 'stroke="#2e9e6b" stroke-width="0.7" fill="none" opacity="0.8" stroke-dasharray="1,0"',
    })
  }
  // 포화혼합비선
  for (const w of [0.4, 1, 2, 3, 5, 8, 12, 20, 30]) {
    grid += curveFor((p) => tempFromMixingRatio(w, p), {
      attrs: 'stroke="#8a4fbf" stroke-width="0.7" fill="none" stroke-dasharray="4,3" opacity="0.8"',
    })
  }

  // CAPE / CIN 음영
  let shade = ''
  if (Number.isFinite(parcel.pLfc)) {
    const top = Number.isFinite(parcel.pEl) ? parcel.pEl : P_TOP
    const up = []
    const down = []
    for (const pt of parcel.path) {
      if (pt.p > parcel.pLfc || pt.p < top) continue
      const Te = interpAtP(levels, pt.p, 'Tc')
      up.push([px(pt.Tc, pt.p), py(pt.p)])
      down.push([px(Te, pt.p), py(pt.p)])
    }
    const ring = [...up, ...down.reverse()]
    if (ring.length > 3) {
      shade += `<polygon points="${ring.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')}" fill="#e2574c" opacity="0.20"/>`
    }
  }

  // 프로파일 곡선
  const tPts = levels.map((l) => [px(l.Tc, l.p), py(l.p)])
  const withTd = levels.filter((l) => Number.isFinite(l.Tdc))
  const toPt = (l) => [px(l.Tdc, l.p), py(l.p)]
  // rh_liq(물 기준)로 낸 구간과 rh(빙정 기준)로 대체한 구간을 나눠 그린다.
  const firstFallback = withTd.findIndex((l) => l.tdFromIceRh)
  const tdSolid = firstFallback < 0 ? withTd : withTd.slice(0, firstFallback)
  const tdDashed = firstFallback < 0 ? [] : withTd.slice(Math.max(firstFallback - 1, 0))
  const parcelPts = parcel.path.map((pt) => [px(pt.Tc, pt.p), py(pt.p)])

  let curves = ''
  curves += polyline(parcelPts, 'stroke="#e2574c" stroke-width="1.6" fill="none" stroke-dasharray="6,4"')
  curves += polyline(tdDashed.map(toPt), 'stroke="#1f9d55" stroke-width="2.2" fill="none" stroke-dasharray="5,4" opacity="0.75" stroke-linejoin="round"')
  curves += polyline(tdSolid.map(toPt), 'stroke="#1f9d55" stroke-width="2.6" fill="none" stroke-linejoin="round"')
  curves += polyline(tPts, 'stroke="#c62828" stroke-width="2.6" fill="none" stroke-linejoin="round"')

  // LCL / LFC / EL 표시
  let marks = ''
  const mark = (p, text, color) => {
    if (!Number.isFinite(p)) return ''
    const y = py(p)
    return `<line x1="${PLOT.x}" y1="${y.toFixed(1)}" x2="${PLOT_RIGHT}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="7,5" opacity="0.85"/>`
      + `<text x="${(PLOT.x + 6).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="11" font-weight="600" fill="${color}">${text} ${Math.round(p)}hPa</text>`
  }
  marks += mark(parcel.pLcl, 'LCL', '#0b7285')
  marks += mark(parcel.pLfc, 'LFC', '#e2574c')
  marks += mark(parcel.pEl, 'EL', '#7048e8')

  // 바람 깃
  const barbX = PLOT_RIGHT + 46
  let barbs = `<line x1="${barbX}" y1="${PLOT.y}" x2="${barbX}" y2="${PLOT.y + PLOT.h}" stroke="#ccc" stroke-width="0.8"/>`
  // 하층은 로그 간격이 좁아 깃이 겹친다. 세로 22px 이상 벌어질 때만 그린다.
  let lastBarbY = -Infinity
  for (const l of levels) {
    const y = py(l.p)
    if (Math.abs(y - lastBarbY) < 22) continue
    barbs += windBarb(barbX, y, l.u, l.v)
    lastBarbY = y
  }
  barbs += `<text x="${barbX}" y="${PLOT.y - 8}" text-anchor="middle" font-size="10" fill="#6b7680">바람</text>`

  const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '—')
  const infoLines = [
    `CAPE  ${fmt(parcel.cape)} J/kg`,
    `CIN   ${fmt(parcel.cin)} J/kg`,
    `LCL   ${fmt(parcel.pLcl)} hPa`,
    `LFC   ${fmt(parcel.pLfc)} hPa`,
    `EL    ${fmt(parcel.pEl)} hPa`,
    `LI    ${fmt(indices.li, 1)}`,
    `SI    ${fmt(indices.showalter, 1)}`,
    `K     ${fmt(indices.kIndex, 1)}`,
    `TT    ${fmt(indices.totalTotals, 1)}`,
    `PW    ${fmt(indices.pw, 1)} mm${indices.pwFromQ ? '' : '~'}`,
    `0degC  ${fmt(indices.freezingM)} m`,
    `-20degC ${fmt(indices.minus20M)} m`,
  ]
  const boxX = PLOT_RIGHT + 92
  let info = `<rect x="${boxX}" y="${PLOT.y}" width="150" height="${infoLines.length * 17 + 16}" fill="#fff" stroke="#c7ced6" rx="4"/>`
  infoLines.forEach((line, i) => {
    info += `<text x="${boxX + 10}" y="${PLOT.y + 22 + i * 17}" font-size="11.5" font-family="ui-monospace,monospace" fill="#20262e">${line}</text>`
  })

  const title = `${label} · KIM ${meta.model} · ${meta.tmfc} +${meta.hf}h`
  const sub = `유효 ${meta.validTime} · 격자점 ${point.lat.toFixed(3)}N ${point.lon.toFixed(3)}E · ${levels.length}층 (모델 사운딩)`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,-apple-system,sans-serif">
<rect width="${W}" height="${H}" fill="#fdfdfb"/>
<defs>${clip}</defs>
<text x="20" y="24" font-size="15" font-weight="700" fill="#1b2129">${title}</text>
<text x="20" y="${H - 14}" font-size="11" fill="#6b7680">${sub}</text>
${bg}
<g clip-path="url(#plot)">${grid}${shade}${curves}</g>
<g clip-path="url(#plot)">${marks}</g>
<rect x="${PLOT.x}" y="${PLOT.y}" width="${PLOT.w}" height="${PLOT.h}" fill="none" stroke="#5a636d" stroke-width="1.2"/>
${barbs}
${info}
<text x="${PLOT.x + PLOT.w / 2}" y="${PLOT.y + PLOT.h + 34}" text-anchor="middle" font-size="11" fill="#4a5560">기온 (degC)</text>
</svg>`
}

function renderHtml(parts) {
  const svg = renderSvg(parts)
  return `<!doctype html><meta charset="utf-8"><title>Skew-T ${parts.label}</title>
<style>body{margin:0;padding:16px;background:#eef0f2;font-family:system-ui,sans-serif}
.legend{max-width:980px;margin:12px auto;font-size:12px;color:#333;line-height:1.7}
.legend b{display:inline-block;width:14px;height:3px;vertical-align:middle;margin-right:6px}
svg{display:block;margin:0 auto;background:#fdfdfb;border:1px solid #ccd2d8;border-radius:6px}</style>
${svg}
<div class="legend">
<span><b style="background:#c62828"></b>기온</span> &nbsp;
<span><b style="background:#1f9d55"></b>이슬점</span> &nbsp;
<span><b style="background:#e2574c"></b>기괴 경로(지면기준)</span> &nbsp;
<span><b style="background:#d98d3a"></b>건조단열선</span> &nbsp;
<span><b style="background:#2e9e6b"></b>습윤단열선</span> &nbsp;
<span><b style="background:#8a4fbf"></b>포화혼합비선</span>
<br>모델 사운딩(21층)이라 라디오존데처럼 얇은 역전층은 표현되지 않는다. 최하층이 1000hPa이므로 지면~1000hPa 구간은 비어 있다.
${parts.indices.pwFromQ
    ? '<br>이슬점과 가강수량은 비습(q)에서 바로 냈다. 물/빙정 기준 구분이 없어 전 층에서 편향이 없다.'
    : '<br><b style="background:#1f9d55;opacity:.75"></b>이 런에는 비습(q)이 없어 상대습도로 대신했다. 점선 구간(300hPa 위)은 빙정 기준 rh라 실제보다 습하게 나오고, PW(~ 표시)도 약 2% 과대다. 다음 수집 런부터 q가 붙는다.'}
</div>`
}

// ---------------------------------------------------------------- 자체검증

function selfCheck() {
  const near = (a, b, tol, what) => {
    if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (허용 ${tol})`)
  }
  near(es(0), 6.112, 0.001, 'es(0degC)')
  near(es(20), 23.39, 0.15, 'es(20degC)')
  near(dewpointFromE(es(12.3)), 12.3, 0.01, 'dewpoint 역함수')
  near(mixingRatio(es(20), 1000) * 1000, 14.9, 0.4, '혼합비 20degC/1000hPa')
  near(tempFromMixingRatio(mixingRatio(es(5), 850) * 1000, 850), 5, 0.01, '혼합비선 역함수')

  // 온위 보존
  near(dryAdiabatT(theta(293.15, 1000), 1000) - K0, 20, 1e-9, '건조단열 왕복')
  near(dryAdiabatT(theta(293.15, 1000), 700) - K0, -8.4, 0.2, '20degC/1000hPa -> 700hPa 건조단열')

  // LCL: 20/10degC 지면 -> 대략 870hPa 부근
  const Tlcl = lclTemperature(293.15, 283.15)
  const pLcl = 1000 * (Tlcl / 293.15) ** (1 / KAPPA)
  if (!(pLcl > 840 && pLcl < 890)) throw new Error(`LCL 이상: ${pLcl}`)

  // 가단열은 건조단열보다 반드시 덜 식는다
  const moist = moistAdiabatT(293.15, 1000, 700)
  const dry = dryAdiabatT(theta(293.15, 1000), 700)
  if (!(moist > dry)) throw new Error(`가단열이 건조단열보다 차갑다: ${moist} <= ${dry}`)

  // 포화 기괴를 올렸다 내리면 되돌아오지 않아야 한다(비가역) — 최소한 단조 감소여야
  let prev = Infinity
  for (let p = 1000; p >= 300; p -= 50) {
    const T = moistAdiabatT(293.15, 1000, p)
    if (!(T < prev)) throw new Error(`가단열 단조성 위반 at ${p}hPa`)
    prev = T
  }
  console.log('자체검증 통과')
}

// ---------------------------------------------------------------- 진입점

function parseArgs(argv) {
  const out = { lat: 37.46, lon: 126.44, label: 'RKSI', hf: 0, out: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--check') return { check: true }
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      if (key in out) {
        out[key] = key === 'label' || key === 'out' ? val : Number(val)
        i += 1
      }
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.check) {
  selfCheck()
} else {
  const { meta, point, levels } = readProfile(args)
  const parcel = computeParcel(levels)
  const indices = computeIndices(levels, parcel)
  const html = renderHtml({ meta, point, levels, parcel, indices, label: args.label })
  const outPath = args.out || path.join(path.dirname(fileURLToPath(import.meta.url)), `skewt-${args.label}-hf${args.hf}.html`)
  fs.writeFileSync(outPath, html, 'utf8')

  console.log(`런 ${meta.runId} / ${meta.tmfc} +${meta.hf}h / 유효 ${meta.validTime}`)
  console.log(`격자점 ${point.lat.toFixed(3)}N ${point.lon.toFixed(3)}E, ${levels.length}층`)
  console.log(`지면(1000hPa) T=${levels[0].Tc.toFixed(1)}degC Td=${levels[0].Tdc.toFixed(1)}degC`)
  console.log(`CAPE=${parcel.cape.toFixed(0)} CIN=${parcel.cin.toFixed(0)} LCL=${parcel.pLcl.toFixed(0)}hPa LI=${indices.li.toFixed(1)} K=${indices.kIndex.toFixed(1)} PW=${indices.pw.toFixed(1)}mm`)
  console.log(`출력: ${outPath}`)
}
