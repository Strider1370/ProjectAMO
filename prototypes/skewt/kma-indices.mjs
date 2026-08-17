// 기상청 「단열선도 사용설명서」의 PREDICTION ANALYSIS 표 항목을 그대로 산출한다.
// 각 함수 위 주석은 그 문서의 정의를 옮긴 것이다.

import {
  K0, es, dewpointFromE, mixingRatio, theta, dryAdiabatT, thetaE,
  lclPressure, lclTemperature, moistAdiabatT, tempFromMixingRatio,
  interpAtP, crossing, liftParcel, capeInLayer, mostUnstableParcel,
} from './thermo.mjs'

const KT = 1.943844

// CCL: 지상 이슬점을 지나는 혼합비선과 "온도상태곡선"이 만나는 점
function convectiveCondensationLevel(levels, base) {
  const w = mixingRatio(es(base.Tdc), base.p) * 1000 // g/kg
  let prev = null
  for (const l of levels) {
    if (!Number.isFinite(l.Tc)) continue
    const diff = tempFromMixingRatio(w, l.p) - l.Tc // 혼합비선 온도 - 환경온도
    if (prev && prev.diff * diff <= 0 && prev.diff !== diff) {
      const f = prev.diff / (prev.diff - diff)
      return { p: prev.p + f * (l.p - prev.p), hgt: prev.hgt + f * (l.hgt - prev.hgt) }
    }
    prev = { diff, p: l.p, hgt: l.hgt }
  }
  return { p: NaN, hgt: NaN }
}

// SSI(a-b): a면의 LCL에서 습윤단열선을 따라 b면까지 올린 온도를 b면 실제기온에서 뺀 값
function showalter(levels, pLow, pHigh) {
  const T = interpAtP(levels, pLow, 'Tc')
  const Td = interpAtP(levels, pLow, 'Tdc')
  const Tup = interpAtP(levels, pHigh, 'Tc')
  if (![T, Td, Tup].every(Number.isFinite)) return NaN
  const pLcl = lclPressure(T + K0, Td + K0, pLow)
  const tLcl = lclTemperature(T + K0, Td + K0)
  const lifted = pLcl <= pHigh
    ? dryAdiabatT(theta(T + K0, pLow), pHigh)
    : moistAdiabatT(tLcl, pLcl, pHigh)
  return Tup - (lifted - K0)
}

// WMO 권계면: 기온감률이 2degC/km 이하로 떨어지고, 그 위 2km 평균 감률도 2degC/km 이하인 최하 고도
function tropopause(levels) {
  const asc = [...levels].sort((a, b) => b.p - a.p)
  for (let i = 0; i < asc.length - 1; i += 1) {
    const a = asc[i]
    const b = asc[i + 1]
    if (![a.hgt, b.hgt, a.Tc, b.Tc].every(Number.isFinite)) continue
    const dz = (b.hgt - a.hgt) / 1000
    if (dz <= 0) continue
    const lapse = (a.Tc - b.Tc) / dz
    if (lapse > 2) continue
    // 그 위 2km 평균 감률 확인
    const top = asc.find((l) => l.hgt >= b.hgt + 2000)
    if (!top) return { hgt: NaN, reason: '자료 상단이 권계면 후보 +2km에 못 미침' }
    const avg = (b.Tc - top.Tc) / ((top.hgt - b.hgt) / 1000)
    if (avg <= 2) return { hgt: b.hgt, p: b.p }
  }
  return { hgt: NaN, reason: '권계면 조건을 만족하는 층 없음' }
}

// Upper/Middle/Lower: 구간에서 습수(T-Td)가 가장 작은 곳의 고도와 습수
function moistestInBand(levels, pMax, pMin) {
  let best = null
  for (const l of levels) {
    if (l.p > pMax || l.p < pMin) continue
    if (![l.Tc, l.Tdc, l.hgt].every(Number.isFinite)) continue
    const dep = l.Tc - l.Tdc
    if (!best || dep < best.dep) best = { dep, hgt: l.hgt, p: l.p }
  }
  return best
}

// 하늘상태: 세 층의 습수 최소값으로 판정한다. 기상청 문서에 판정 기준이 없어 통상값을 쓴다.
function skyCondition(bands) {
  const deps = bands.filter(Boolean).map((b) => b.dep)
  if (!deps.length) return null
  const min = Math.min(...deps)
  if (min > 8) return { code: 'SKC', heuristic: true }
  if (min > 5) return { code: 'SCT', heuristic: true }
  if (min > 2) return { code: 'BKN', heuristic: true }
  return { code: 'OVC', heuristic: true }
}

// SRH: 호도그래프에서 지상~3km까지 둘러싼 면적 (지상 기준)
function stormRelativeHelicity(levels, depthM = 3000) {
  const base = levels[0]
  const pts = levels
    .filter((l) => Number.isFinite(l.u) && Number.isFinite(l.v) && Number.isFinite(l.hgt))
    .filter((l) => l.hgt - base.hgt <= depthM)
  if (pts.length < 2) return NaN
  let sum = 0
  for (let i = 0; i < pts.length - 1; i += 1) {
    sum += pts[i].u * pts[i + 1].v - pts[i + 1].u * pts[i].v
  }
  return -sum
}

export function computeKmaIndices(levels, options = {}) {
  const { psHpa = null, cptpK = 100 } = options

  // 1000hPa Air-mass: 1000hPa 또는 1000hPa 이하의 최하층 기압의 공기괴
  const base = Number.isFinite(psHpa) && psHpa < 1000
    ? levels.find((l) => l.p <= psHpa) || levels[0]
    : levels[0]

  const parcel = liftParcel(levels, base.p, base.Tc, base.Tdc)
  const ccl = convectiveCondensationLevel(levels, base)
  const surfaceP = Number.isFinite(psHpa) ? psHpa : base.p

  const T850 = interpAtP(levels, 850, 'Tc')
  const Td850 = interpAtP(levels, 850, 'Tdc')
  const T700 = interpAtP(levels, 700, 'Tc')
  const Td700 = interpAtP(levels, 700, 'Tdc')
  const T500 = interpAtP(levels, 500, 'Tc')

  // LI: 기괴를 500hPa까지 올린 온도를 500hPa 실제기온에서 뺀 값
  const liftedTo = (p) => {
    const pt = parcel.path.reduce((b, x) => (Math.abs(x.p - p) < Math.abs(b.p - p) ? x : b))
    return pt.Tc
  }

  const upper = moistestInBand(levels, 450, 0)
  const middle = moistestInBand(levels, 800, 450)
  const lower = moistestInBand(levels, 970, 800)

  // TPW = (1/g) ∫ q dp
  let tpw = 0
  for (let i = 0; i < levels.length - 1; i += 1) {
    const a = levels[i]
    const b = levels[i + 1]
    const qa = Number.isFinite(a.q) ? a.q : null
    const qb = Number.isFinite(b.q) ? b.q : null
    if (qa == null || qb == null) continue
    tpw += ((qa + qb) / 2) * (a.p - b.p) * 100 / 9.80665
  }

  // CVT Temp: CCL에서 건조단열선을 따라 지상까지 내려왔을 때의 온도
  const cvtTemp = Number.isFinite(ccl.p)
    ? dryAdiabatT(theta(interpAtP(levels, ccl.p, 'Tc') + K0, ccl.p), surfaceP) - K0
    : NaN
  // Max Temp: 850hPa 기온에서 건조단열선을 따라 지상까지
  const maxTemp = Number.isFinite(T850)
    ? dryAdiabatT(theta(T850 + K0, 850), surfaceP) - K0
    : NaN
  // Min Temp: 850hPa 기온에서 포화혼합비선을 따라 지상까지
  const minTemp = Number.isFinite(T850)
    ? tempFromMixingRatio(mixingRatio(es(T850), 850) * 1000, surfaceP)
    : NaN

  // M/W: 최대풍이 나타난 고도
  let mw = null
  for (const l of levels) {
    if (!Number.isFinite(l.u) || !Number.isFinite(l.v)) continue
    const spd = Math.hypot(l.u, l.v)
    if (!mw || spd > mw.spd) mw = { spd, hgt: l.hgt, p: l.p }
  }

  // CPTP = (-19 - T_EL)(CAPE_20 - K)/K, MU 기괴 기준. MU LCL 기온 <= -10degC 이면 0
  const mu = mostUnstableParcel(levels)
  let cptp = { value: NaN, note: '' }
  if (mu) {
    const muLclTempC = mu.tLclC
    const tEl = Number.isFinite(mu.pEl) ? interpAtP(levels, mu.pEl, 'Tc') : NaN
    const c20 = capeInLayer(levels, mu)
    if (muLclTempC <= -10) {
      cptp = { value: 0, note: 'MU LCL 기온 <= -10degC → 정의상 0' }
    } else if (!Number.isFinite(tEl)) {
      cptp = { value: NaN, note: 'EL 없음' }
    } else if (!Number.isFinite(c20.value) || c20.layers < 2) {
      cptp = { value: NaN, note: `0~-20degC 층 등압면 ${c20.layers || 0}개 — 적분 불가` }
    } else {
      cptp = {
        value: ((-19 - tEl) * (c20.value - cptpK)) / cptpK,
        note: `T_EL=${tEl.toFixed(1)}degC, CAPE20=${c20.value.toFixed(0)}, K=${cptpK}, 층 ${c20.layers}개`,
      }
    }
  }

  const trop = tropopause(levels)

  return {
    base,
    parcel,
    surfaceP,
    airmass: { tempC: base.Tc, humiPct: base.rh, u: base.u, v: base.v,
      dirDeg: (Math.atan2(-base.u, -base.v) * 180 / Math.PI + 360) % 360,
      spdKt: Math.hypot(base.u, base.v) * KT },
    flGpm: crossing(levels, 'Tc', 0, 'hgt'),
    eqt850: Number.isFinite(T850) && Number.isFinite(Td850) ? thetaE(T850 + K0, Td850 + K0, 850) : NaN,
    tropGpm: trop.hgt,
    tropNote: trop.reason || '',
    lclGpm: interpAtP(levels, parcel.pLcl, 'hgt'),
    cclGpm: ccl.hgt,
    cclP: ccl.p,
    lfcGpm: Number.isFinite(parcel.pLfc) ? interpAtP(levels, parcel.pLfc, 'hgt') : NaN,
    helGpm: Number.isFinite(parcel.pEl) ? interpAtP(levels, parcel.pEl, 'hgt') : NaN,
    mwGpm: mw?.hgt ?? NaN,
    ssi850_500: showalter(levels, 850, 500),
    ssi925_500: showalter(levels, 925, 500),
    ssi925_700: showalter(levels, 925, 700),
    liSfc500: Number.isFinite(T500) ? T500 - liftedTo(500) : NaN,
    li925_500: showalter(levels, 925, 500),
    kIndex: [T850, T500, Td850, T700, Td700].every(Number.isFinite)
      ? (T850 - T500) + Td850 - (T700 - Td700) : NaN,
    ttIndex: [T850, T500, Td850].every(Number.isFinite) ? (T850 - T500) + (Td850 - T500) : NaN,
    cptp,
    srh: stormRelativeHelicity(levels),
    cape: parcel.cape,
    cin: parcel.cin,
    tpw,
    sky: skyCondition([upper, middle, lower]),
    upper, middle, lower,
    thcknGpm: interpAtP(levels, 700, 'hgt') - interpAtP(levels, 1000, 'hgt'),
    cvtTemp, maxTemp, minTemp,
  }
}
