#!/usr/bin/env node
// 기상청 GDAPS 단열선도 규격을 따른 렌더러 (스펙 미리보기용 프로토타입).
// 참고: docs/일기도/kim_gdps_skew_47163_s000_2026070200.png
//
//   node prototypes/skewt/skewt-kma.mjs --lat 37.46 --lon 126.44 --label RKSI --hf 0 --live
//
// --live 를 주면 아직 수집하지 않는 ps와 100/70/50hPa을 실시간으로 받아 채운다.
// (스펙대로 수집이 붙으면 그 부분은 디스크에서 읽는다)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  K0, es, dewpointFromE, mixingRatio, EPS,
  dryAdiabatT, moistAdiabatFromThetaW, tempFromMixingRatio, interpAtP, selfCheck,
} from './thermo.mjs'
import { computeKmaIndices } from './kma-indices.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const KIM_DIR = path.join(ROOT, 'backend/data/kim_nwp')
const TOP_LEVELS = [100, 70, 50]

// ------------------------------------------------------------------ 자료

function latestRunDir() {
  const runsDir = path.join(KIM_DIR, 'runs')
  const runs = fs.readdirSync(runsDir).filter((d) => /^KIMG_/.test(d)).sort()
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const dir = path.join(runsDir, runs[i])
    if (fs.existsSync(path.join(dir, 'normalized'))) return dir
  }
  throw new Error('사용 가능한 KIM 런이 없다')
}

function decode(v, i) {
  if (!v || !Array.isArray(v.values)) return NaN
  const raw = v.values[i]
  if (raw == null || raw === -32768) return NaN
  return raw * v.scale + v.offset
}

function gridIndex(grid, lat, lon) {
  const ix = Math.round((lon - grid.lonMin) / grid.dx)
  const iy = Math.round((lat - grid.latMin) / grid.dy)
  if (ix < 0 || ix >= grid.nx || iy < 0 || iy >= grid.ny) throw new Error('수집 영역 밖')
  return { index: iy * grid.nx + ix, lat: grid.latMin + iy * grid.dy, lon: grid.lonMin + ix * grid.dx, ix, iy }
}

function readStored({ lat, lon, hf }) {
  const runDir = latestRunDir()
  const hfDir = path.join(runDir, 'normalized', `hf${String(hf).padStart(3, '0')}`)
  if (!fs.existsSync(hfDir)) throw new Error(`예보시간 없음: hf${hf}`)
  const dirs = fs.readdirSync(hfDir).filter((d) => /hPa$/.test(d))
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))

  const levels = []
  let meta = null
  let point = null
  for (const d of dirs) {
    const file = path.join(hfDir, d, 'grid.json')
    if (!fs.existsSync(file)) continue
    const g = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!point) point = gridIndex(g.grid, lat, lon)
    if (!meta) meta = { tmfc: g.tmfc, hf: g.hf, validTime: g.validTime, model: g.model, runId: path.basename(runDir) }
    const i = point.index
    const Tk = decode(g.variables.T, i)
    if (!Number.isFinite(Tk)) continue
    const Tc = Tk - K0
    const q = decode(g.variables.q, i)
    const rhLiq = decode(g.variables.rh_liq, i)
    const rh = decode(g.variables.rh, i)
    let Tdc = NaN
    let tdSource = 'none'
    if (Number.isFinite(q) && q > 0) {
      const w = q / (1 - q)
      Tdc = Math.min(dewpointFromE((w * g.level.value) / (EPS + w)), Tc); tdSource = 'q'
    } else {
      const r = Number.isFinite(rhLiq) ? rhLiq : rh
      if (Number.isFinite(r)) {
        Tdc = Math.min(dewpointFromE((Math.min(Math.max(r, 0.1), 100) / 100) * es(Tc)), Tc)
        tdSource = Number.isFinite(rhLiq) ? 'rh_liq' : 'rh'
      }
    }
    levels.push({ p: g.level.value, Tc, Tdc, tdSource, q, rh, hgt: decode(g.variables.hgt, i), u: decode(g.variables.u, i), v: decode(g.variables.v, i) })
  }
  return { meta, point, levels }
}

function authKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  const m = env.match(/^KMA_KIM_NWP_AUTH_KEY=(.*)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

async function fetchPoint({ name, data, level, tmfc, hf, ix, iy }) {
  const url = `https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_xy_txt2`
    + `?group=KIMG&nwp=NE57&data=${data}&name=${name}&level=${level}&tmfc=${tmfc}&hf=${hf}`
    + `&map=S&sub=${ix},${iy},${ix},${iy}&disp=A&authKey=${authKey()}`
  const text = await (await fetch(url)).text()
  const num = text.split('\n').filter((l) => !l.startsWith('#')).join(' ').trim().split(/\s+/)[0]
  const value = Number(num)
  return Number.isFinite(value) ? value : NaN
}

// 스펙대로 수집이 붙기 전, 실시간으로 ps와 상층 3층을 보충한다
async function liveSupplement({ meta, point, levels }) {
  const notes = []
  const { ix, iy } = point
  const common = { tmfc: meta.tmfc, hf: meta.hf, ix: ix + 1428, iy: iy + 1440 }

  const psPa = await fetchPoint({ name: 'ps', data: 'U', level: 0, ...common })
  const psHpa = Number.isFinite(psPa) ? psPa / 100 : NaN
  if (Number.isFinite(psHpa)) notes.push(`지상기압 ps=${psHpa.toFixed(1)}hPa 실시간 수신`)
  else notes.push('지상기압 수신 실패')

  for (const p of TOP_LEVELS) {
    const [T, hgt, u, v] = await Promise.all(['T', 'hgt', 'u', 'v']
      .map((n) => fetchPoint({ name: n, data: 'P', level: p, ...common })))
    if (!Number.isFinite(T)) { notes.push(`${p}hPa 수신 실패`); continue }
    levels.push({ p, Tc: T - K0, Tdc: NaN, tdSource: 'none', q: NaN, rh: NaN, hgt, u, v })
  }
  levels.sort((a, b) => b.p - a.p)
  notes.push(`상층 ${TOP_LEVELS.join('/')}hPa 실시간 수신`)
  return { psHpa, notes }
}

// ------------------------------------------------------------------ 그리기

const P_BOT = 1050
const P_TOP = 100
const T_MIN = -40
const T_MAX = 40
const PLOT = { x: 300, y: 200, w: 720, h: 660 }
// 표준대기의 기온곡선이 대략 수직으로 서도록 스큐를 잡는다.
// 지면 25도 -> 100hPa -75도 = 100도 하강이므로, 그만큼을 가로로 밀어준다.
// (등온선을 화면상 정확히 45도로 두면 상층 저온이 그림 밖으로 나간다)
const SKEW = 900

const yFrac = (p) => (Math.log(p) - Math.log(P_TOP)) / (Math.log(P_BOT) - Math.log(P_TOP))
const py = (p) => PLOT.y + yFrac(p) * PLOT.h
const px = (Tc, p) => PLOT.x + ((Tc - T_MIN) / (T_MAX - T_MIN)) * PLOT.w + (1 - yFrac(p)) * SKEW
const RIGHT = PLOT.x + PLOT.w
const BOTTOM = PLOT.y + PLOT.h

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const f = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '----')
const gpm = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '----')

function poly(pts, attrs) {
  const d = pts.filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))
    .map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')
  return d ? `<path d="${d}" ${attrs}/>` : ''
}

function curve(fn, attrs) {
  const pts = []
  for (let p = P_BOT; p >= P_TOP; p -= 5) {
    const Tc = fn(p)
    if (Number.isFinite(Tc)) pts.push([px(Tc, p), py(p)])
  }
  return poly(pts, attrs)
}

function windBarb(x, y, u, v, color = '#c0392b') {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return ''
  const kt = Math.hypot(u, v) * 1.943844
  const dir = Math.atan2(-u, -v)
  const L = 24
  const dx = Math.sin(dir)
  const dy = -Math.cos(dir)
  const tx = x + dx * L
  const ty = y + dy * L
  let out = `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${color}" stroke-width="1"/>`
  let rem = Math.round(kt / 5) * 5
  if (rem < 5) return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="none" stroke="${color}"/>`
  const bx = -dx
  const by = -dy
  const perpX = dy
  const perpY = -dx
  let off = 0
  const draw = (len, at) => {
    const ax = tx + bx * at
    const ay = ty + by * at
    return `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${(ax + perpX * len).toFixed(1)}" y2="${(ay + perpY * len).toFixed(1)}" stroke="${color}" stroke-width="1"/>`
  }
  while (rem >= 50) {
    const ax = tx + bx * off
    const ay = ty + by * off
    const a2x = tx + bx * (off + 5)
    const a2y = ty + by * (off + 5)
    out += `<polygon points="${ax.toFixed(1)},${ay.toFixed(1)} ${(ax + perpX * 9).toFixed(1)},${(ay + perpY * 9).toFixed(1)} ${a2x.toFixed(1)},${a2y.toFixed(1)}" fill="${color}"/>`
    rem -= 50; off += 7
  }
  while (rem >= 10) { out += draw(9, off); rem -= 10; off += 4.5 }
  if (rem >= 5) out += draw(4.5, off)
  return out
}

function hodograph(levels, x, y, w, h) {
  const pts = levels.filter((l) => Number.isFinite(l.u) && Number.isFinite(l.v) && l.p >= 300)
  const max = Math.max(10, ...pts.map((l) => Math.hypot(l.u, l.v)))
  const cx = x + w / 2
  const cy = y + h / 2
  const R = Math.min(w, h) / 2 - 14
  const sx = (u) => cx + (u / max) * R
  const sy = (v) => cy - (v / max) * R
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#8a6d3b"/>`
  out += `<text x="${x + w - 6}" y="${y + 13}" text-anchor="end" font-size="10" fill="#333">(m/sec)</text>`
  for (const r of [0.5, 1]) {
    out += `<circle cx="${cx}" cy="${cy}" r="${(R * r).toFixed(1)}" fill="none" stroke="#c9b28a" stroke-width="0.7"/>`
  }
  out += `<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#c9b28a" stroke-width="0.7"/>`
  out += `<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="#c9b28a" stroke-width="0.7"/>`
  out += `<text x="${cx + 3}" y="${(cy - R + 10).toFixed(1)}" font-size="9" fill="#333">${Math.round(max)}</text>`
  out += poly(pts.map((l) => [sx(l.u), sy(l.v)]), 'stroke="#c0392b" stroke-width="1.4" fill="none"')
  for (const lp of [850, 700, 500, 400]) {
    const l = pts.find((q) => q.p === lp)
    if (!l) continue
    out += `<circle cx="${sx(l.u).toFixed(1)}" cy="${sy(l.v).toFixed(1)}" r="2" fill="#c0392b"/>`
    out += `<text x="${(sx(l.u) + 4).toFixed(1)}" y="${(sy(l.v) + 3).toFixed(1)}" font-size="8" fill="#333">${lp}</text>`
  }
  return out
}

function indexTable(x, y, w, ix) {
  const rows = [
    ['head', '1000 hPa Air-mass'],
    ['  Temp. (℃)', f(ix.airmass.tempC, 1)],
    ['  Humi. (%)', f(ix.airmass.humiPct, 0)],
    ['  Wind. (KT)', Number.isFinite(ix.airmass.spdKt) ? `${String(Math.round(ix.airmass.dirDeg)).padStart(3, '0')}/${Math.round(ix.airmass.spdKt)}` : '----'],
    ['sep'],
    ['FL (gpm)', gpm(ix.flGpm)],
    ['850EQT (K)', f(ix.eqt850, 0)],
    ['sep'],
    ['T/P (gpm)', gpm(ix.tropGpm)],
    ['LCL (gpm)', gpm(ix.lclGpm)],
    ['CCL (gpm)', gpm(ix.cclGpm)],
    ['LFC (gpm)', gpm(ix.lfcGpm)],
    ['HEL (gpm)', gpm(ix.helGpm)],
    ['M/W (gpm)', gpm(ix.mwGpm)],
    ['sep'],
    ['SSI(850-500)', f(ix.ssi850_500, 1)],
    ['SSI(925-500)', f(ix.ssi925_500, 1)],
    ['SSI(925-700)', f(ix.ssi925_700, 1)],
    ['LI (SFC-500)', f(ix.liSfc500, 1)],
    ['LI (925-500)', f(ix.li925_500, 1)],
    ['K-Index', f(ix.kIndex, 0)],
    ['TT-Index', f(ix.ttIndex, 0)],
    ['CPTP', f(ix.cptp.value, 1)],
    ['sep'],
    ['SRH (m2/s2)', f(ix.srh, 0)],
    ['CAPE (m2/s2)', f(ix.cape, 0)],
    ['CIN (m2/s2)', f(ix.cin, 0)],
    ['TPW (mm)', f(ix.tpw, 1)],
    ['sep'],
    ['Cloud', ix.sky ? ix.sky.code : '----'],
    ['Upper', ix.upper ? `${gpm(ix.upper.hgt)}  ${ix.upper.dep.toFixed(0)}` : '----'],
    ['Middle', ix.middle ? `${gpm(ix.middle.hgt)}  ${ix.middle.dep.toFixed(0)}` : '----'],
    ['Lower', ix.lower ? `${gpm(ix.lower.hgt)}  ${ix.lower.dep.toFixed(0)}` : '----'],
    ['sep'],
    ['THCKN(10-7)', gpm(ix.thcknGpm)],
    ['CVT Temp (℃)', f(ix.cvtTemp, 1)],
    ['Max Temp (℃)', f(ix.maxTemp, 1)],
    ['Min Temp (℃)', f(ix.minTemp, 1)],
  ]
  const rowH = 15.5
  let h = 24
  for (const r of rows) h += r[0] === 'sep' ? 5 : rowH
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#8a6d3b"/>`
  out += `<text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#111">PREDICTION ANALYSIS</text>`
  let cy = y + 24
  for (const r of rows) {
    if (r[0] === 'sep') {
      out += `<line x1="${x}" y1="${(cy + 2).toFixed(1)}" x2="${x + w}" y2="${(cy + 2).toFixed(1)}" stroke="#c9b28a" stroke-width="0.7"/>`
      cy += 5; continue
    }
    if (r[0] === 'head') {
      out += `<text x="${x + 6}" y="${(cy + 11).toFixed(1)}" font-size="10.5" font-weight="700" fill="#111">${esc(r[1])}</text>`
      cy += rowH; continue
    }
    const blank = r[1] === '----'
    out += `<text x="${x + 6}" y="${(cy + 11).toFixed(1)}" font-size="10.5" fill="#333">${esc(r[0])}</text>`
    out += `<text x="${x + w - 6}" y="${(cy + 11).toFixed(1)}" text-anchor="end" font-size="10.5" font-family="ui-monospace,monospace" fill="${blank ? '#aaa' : '#c0392b'}">${esc(r[1])}</text>`
    cy += rowH
  }
  return out
}

function render({ meta, point, levels, ix, psHpa, label, notes, site }) {
  const W = 1270
  const H = 960
  const GOLD = '#8a6d3b'
  const GRID = '#c9a227'

  // 사다리꼴 클립 (스큐 때문에 좌하단이 잘린다)
  const clip = `<clipPath id="p"><rect x="${PLOT.x}" y="${PLOT.y}" width="${PLOT.w}" height="${PLOT.h}"/></clipPath>`

  let bg = ''
  for (const p of [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100]) {
    const y = py(p)
    if (y < PLOT.y - 1 || y > BOTTOM + 1) continue
    bg += `<line x1="${PLOT.x}" y1="${y.toFixed(1)}" x2="${RIGHT}" y2="${y.toFixed(1)}" stroke="${GOLD}" stroke-width="0.6" opacity="0.8"/>`
    bg += `<text x="${(PLOT.x - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#333">${p}</text>`
  }

  // 우측 km 축 (지오포텐셜고도)
  let kmAxis = `<line x1="${RIGHT + 26}" y1="${PLOT.y}" x2="${RIGHT + 26}" y2="${BOTTOM}" stroke="#333" stroke-width="0.8"/>`
  kmAxis += `<text x="${RIGHT + 46}" y="${PLOT.y + 150}" font-size="10" fill="#333" transform="rotate(90 ${RIGHT + 46} ${PLOT.y + 150})">Height  1000(gpm)</text>`
  for (let km = 0; km <= 16; km += 1) {
    const p = interpAtP([...levels].map((l) => ({ p: l.p, h: l.hgt })), null, null) // placeholder
    const target = km * 1000
    let pp = NaN
    const asc = [...levels].sort((a, b) => b.p - a.p)
    for (let i = 0; i < asc.length - 1; i += 1) {
      const a = asc[i]
      const b = asc[i + 1]
      if (!Number.isFinite(a.hgt) || !Number.isFinite(b.hgt)) continue
      if ((a.hgt - target) * (b.hgt - target) <= 0 && a.hgt !== b.hgt) {
        const fr = (a.hgt - target) / (a.hgt - b.hgt)
        pp = Math.exp(Math.log(a.p) + fr * (Math.log(b.p) - Math.log(a.p)))
        break
      }
    }
    if (!Number.isFinite(pp)) continue
    const y = py(pp)
    if (y < PLOT.y || y > BOTTOM) continue
    kmAxis += `<line x1="${RIGHT + 22}" y1="${y.toFixed(1)}" x2="${RIGHT + 26}" y2="${y.toFixed(1)}" stroke="#333" stroke-width="0.8"/>`
    kmAxis += `<text x="${RIGHT + 18}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="#333">${km}</text>`
  }

  let grid = ''
  for (let T = -160; T <= 60; T += 10) {
    grid += poly([[px(T, P_BOT), py(P_BOT)], [px(T, P_TOP), py(P_TOP)]],
      `stroke="${GRID}" stroke-width="${T === 0 ? 1.3 : 0.6}" fill="none" opacity="${T === 0 ? 1 : 0.75}"`)
    const xb = px(T, P_BOT)
    if (xb >= PLOT.x - 2 && xb <= RIGHT + 2) {
      bg += `<text x="${xb.toFixed(1)}" y="${(BOTTOM + 15).toFixed(1)}" text-anchor="middle" font-size="10" fill="#333">${T}</text>`
    }
  }
  for (let th = -40; th <= 220; th += 10) {
    grid += curve((p) => dryAdiabatT(th + K0, p) - K0, `stroke="${GRID}" stroke-width="0.55" fill="none" opacity="0.7"`)
  }
  for (let tw = -30; tw <= 40; tw += 5) {
    grid += curve((p) => moistAdiabatFromThetaW(tw, p) - K0, 'stroke="#2e8b57" stroke-width="0.6" fill="none" opacity="0.8"')
  }
  for (const w of [0.1, 0.2, 0.4, 1, 2, 3, 5, 8, 12, 20, 30]) {
    grid += curve((p) => tempFromMixingRatio(w, p), 'stroke="#2e8b57" stroke-width="0.6" fill="none" stroke-dasharray="4,3" opacity="0.85"')
  }

  // 곡선
  const withT = levels.filter((l) => Number.isFinite(l.Tc))
  const withTd = levels.filter((l) => Number.isFinite(l.Tdc))
  let curves = ''
  curves += poly(ix.parcel.path.map((q) => [px(q.Tc, q.p), py(q.p)]), 'stroke="#111" stroke-width="1.3" fill="none"')
  curves += poly(withTd.map((l) => [px(l.Tdc, l.p), py(l.p)]), 'stroke="#c0392b" stroke-width="2" fill="none" stroke-dasharray="7,4"')
  curves += poly(withT.map((l) => [px(l.Tc, l.p), py(l.p)]), 'stroke="#c0392b" stroke-width="2.4" fill="none"')

  // P_sfc 선과 지면 아래 마스크
  let sfc = ''
  if (Number.isFinite(psHpa)) {
    const y = py(psHpa)
    if (y < BOTTOM) {
      sfc += `<rect x="${PLOT.x}" y="${y.toFixed(1)}" width="${PLOT.w}" height="${(BOTTOM - y).toFixed(1)}" fill="#9aa0a6" opacity="0.45"/>`
    }
    sfc += `<line x1="${PLOT.x}" y1="${y.toFixed(1)}" x2="${RIGHT}" y2="${y.toFixed(1)}" stroke="#1a5fb4" stroke-width="1.4"/>`
    sfc += `<text x="${PLOT.x + 5}" y="${(y - 4).toFixed(1)}" font-size="10" font-weight="700" fill="#1a5fb4">P_sfc:${psHpa.toFixed(1)}</text>`
  }

  // LCL/CCL/LFC/HEL 라벨
  // 기준고도는 그림판을 가로질러 긋는다. 짧게 끊으면 무슨 선인지 읽히지 않는다.
  let marks = ''
  const drawn = []
  const mk = (p, t, color) => {
    if (!Number.isFinite(p)) return ''
    let y = py(p)
    if (y < PLOT.y || y > BOTTOM) return ''
    // 라벨끼리 겹치면 살짝 밀어 읽히게 한다 (선 자체는 제자리)
    let ly = y
    while (drawn.some((d) => Math.abs(d - ly) < 12)) ly += 12
    drawn.push(ly)
    return `<line x1="${PLOT.x}" y1="${y.toFixed(1)}" x2="${RIGHT}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="0.9" stroke-dasharray="6,4" opacity="0.9"/>`
      + `<rect x="${(RIGHT - 40).toFixed(1)}" y="${(ly - 11).toFixed(1)}" width="36" height="14" fill="#fff" opacity="0.85"/>`
      + `<text x="${(RIGHT - 6).toFixed(1)}" y="${(ly - 1).toFixed(1)}" text-anchor="end" font-size="10.5" font-weight="700" fill="${color}">${t}</text>`
  }
  marks += mk(ix.parcel.pEl, 'EL', '#7048e8')
  marks += mk(ix.parcel.pLfc, 'LFC', '#e2574c')
  marks += mk(ix.cclP, 'CCL', '#d98d3a')
  marks += mk(ix.parcel.pLcl, 'LCL', '#0b7285')

  // 바람 깃 레일
  let rail = `<line x1="${RIGHT + 78}" y1="${PLOT.y}" x2="${RIGHT + 78}" y2="${BOTTOM}" stroke="#bbb" stroke-width="0.7"/>`
  rail += `<text x="${RIGHT + 78}" y="${PLOT.y - 8}" text-anchor="middle" font-size="10" fill="#333">(knots)</text>`
  let last = -Infinity
  for (const l of levels) {
    const y = py(l.p)
    if (y < PLOT.y || y > BOTTOM || Math.abs(y - last) < 20) continue
    rail += windBarb(RIGHT + 78, y, l.u, l.v)
    last = y
  }
  if (Number.isFinite(ix.mwGpm)) {
    const pmw = levels.find((l) => Math.abs(l.hgt - ix.mwGpm) < 1)?.p
    if (pmw) rail += `<text x="${RIGHT + 108}" y="${(py(pmw) + 3).toFixed(1)}" font-size="9" font-weight="700" fill="#c0392b">M/W</text>`
  }

  const validKst = new Date(new Date(meta.validTime).getTime() + 9 * 3600e3)
  const two = (n) => String(n).padStart(2, '0')
  const kstLabel = `${two(validKst.getUTCHours())}KST ${two(validKst.getUTCDate())} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][validKst.getUTCMonth()]} ${validKst.getUTCFullYear()}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,-apple-system,sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/>
<defs>${clip}</defs>
<text x="${W / 2}" y="34" text-anchor="middle" font-size="21" font-weight="700" fill="#111">Skew T - Log P DIAGRAM</text>

<text x="24" y="70"  font-size="12.5" font-weight="700" fill="#b8860b">GDAPS (KIM ${esc(meta.model.split('/')[1])})</text>
<text x="24" y="90"  font-size="12.5" font-weight="700" fill="#b8860b">Korea Meteorological Administration</text>
<text x="24" y="115" font-size="12" font-weight="700" fill="#c0392b">Issued at ${esc(meta.tmfc.slice(8))}UTC ${esc(meta.tmfc.slice(6, 8))} ${esc(meta.tmfc.slice(4, 6))} ${esc(meta.tmfc.slice(0, 4))}</text>
<text x="24" y="134" font-size="12" font-weight="700" fill="#c0392b">Valid  : ${esc(kstLabel)}</text>

<rect x="330" y="52" width="270" height="92" fill="#fff" stroke="#1a5fb4"/>
<text x="465" y="72"  text-anchor="middle" font-size="14" font-weight="700" fill="#1a5fb4">${esc(label)}</text>
<text x="465" y="90"  text-anchor="middle" font-size="11" font-weight="700" fill="#c0392b">${esc(meta.tmfc.slice(8))}UTC  [+ ${meta.hf}]</text>
<text x="342" y="110" font-size="10.5" fill="#111">Site : ${site.lat.toFixed(2)}N, ${site.lon.toFixed(2)}E</text>
<text x="342" y="126" font-size="10.5" fill="#111">Model: ${point.lat.toFixed(2)}N, ${point.lon.toFixed(2)}E</text>
<text x="342" y="140" font-size="10" fill="#666">격자 스냅 거리 ${(Math.hypot((site.lat - point.lat) * 111, (site.lon - point.lon) * 88)).toFixed(1)} km</text>

${hodograph(levels, 1012, 34, 240, 160)}
${indexTable(24, 200, 248, ix)}
${bg}
<g clip-path="url(#p)">${grid}</g>
<g clip-path="url(#p)">${curves}${sfc}</g>
${marks}
<rect x="${PLOT.x}" y="${PLOT.y}" width="${PLOT.w}" height="${PLOT.h}" fill="none" stroke="${GOLD}" stroke-width="1.4"/>
${kmAxis}
${rail}
<text x="24" y="${H - 34}" font-size="10.5" fill="#666">${esc(notes.join(' · '))}</text>
<text x="24" y="${H - 16}" font-size="10.5" fill="#666">${esc(`런 ${meta.runId} · ${levels.length}층 · 이슬점 출처 ${[...new Set(levels.map((l) => l.tdSource))].join('/')} · CPTP: ${ix.cptp.note || '정상'}`)}</text>
</svg>`
}

// ------------------------------------------------------------------ 진입

function parseArgs(argv) {
  const out = { lat: 37.46, lon: 126.44, label: 'RKSI', hf: 0, live: false, out: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--check') return { check: true }
    if (a === '--live') { out.live = true; continue }
    if (a.startsWith('--')) {
      const k = a.slice(2)
      if (k in out) { out[k] = (k === 'label' || k === 'out') ? argv[i + 1] : Number(argv[i + 1]); i += 1 }
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.check) {
  selfCheck()
  console.log('열역학 자체검증 통과')
} else {
  const { meta, point, levels } = readStored(args)
  const notes = []
  let psHpa = NaN
  if (args.live) {
    const sup = await liveSupplement({ meta, point, levels })
    psHpa = sup.psHpa
    notes.push(...sup.notes)
  } else {
    notes.push('저장분만 사용 (ps·상층 3층 없음)')
  }
  const ix = computeKmaIndices(levels, { psHpa })
  const svg = render({ meta, point, levels, ix, psHpa, label: args.label, notes, site: { lat: args.lat, lon: args.lon } })
  const outPath = args.out || path.join(path.dirname(fileURLToPath(import.meta.url)), `kma-${args.label}-hf${args.hf}.svg`)
  fs.writeFileSync(outPath, svg, 'utf8')
  console.log(`런 ${meta.runId} +${meta.hf}h · ${levels.length}층 · ps=${f(psHpa, 1)}hPa`)
  console.log(`CAPE=${f(ix.cape)} CIN=${f(ix.cin)} LCL=${gpm(ix.lclGpm)} HEL=${gpm(ix.helGpm)} K=${f(ix.kIndex)} TPW=${f(ix.tpw, 1)} CPTP=${f(ix.cptp.value, 1)} (${ix.cptp.note})`)
  console.log(`출력: ${outPath}`)
}
