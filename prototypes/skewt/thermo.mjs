// 순수 열역학. 자료와 무관하므로 자료 없이 시험할 수 있다.
// 지수 정의는 기상청 예보국 「단열선도 사용설명서」(손에 잡히는 예보기술 제9호, 2011-11)를 따른다.
// https://www.kma.go.kr/down/e-learning/hands/hands_09.pdf

export const Rd = 287.04
export const cpd = 1005.7
export const Lv = 2.501e6
export const EPS = 0.622
export const KAPPA = Rd / cpd
export const K0 = 273.15

// Bolton(1980) eq.10 — 물에 대한 포화수증기압 (hPa, T in degC)
export const es = (Tc) => 6.112 * Math.exp((17.67 * Tc) / (Tc + 243.5))

export function dewpointFromE(e) {
  if (!(e > 0)) return NaN
  const l = Math.log(e / 6.112)
  return (243.5 * l) / (17.67 - l)
}

export const mixingRatio = (e, p) => (EPS * e) / Math.max(p - e, 1e-6)
export const virtualT = (Tk, r) => (Tk * (1 + r / EPS)) / (1 + r)
export const theta = (Tk, p) => Tk * (1000 / p) ** KAPPA
export const dryAdiabatT = (thetaK, p) => thetaK * (p / 1000) ** KAPPA

// Bolton(1980) eq.15
export function lclTemperature(Tk, Tdk) {
  return 1 / (1 / (Tdk - 56) + Math.log(Tk / Tdk) / 800) + 56
}

export function lclPressure(Tk, Tdk, p) {
  return p * (lclTemperature(Tk, Tdk) / Tk) ** (1 / KAPPA)
}

// Bolton(1980) eq.43 — 상당온위
export function thetaE(Tk, Tdk, p) {
  const e = es(Tdk - K0)
  const r = mixingRatio(e, p)
  const Tl = lclTemperature(Tk, Tdk)
  return Tk * (1000 / p) ** (0.2854 * (1 - 0.28 * r))
    * Math.exp((3.376 / Tl - 0.00254) * r * 1000 * (1 + 0.81 * r))
}

function moistLapseDTdp(Tk, p) {
  const r = mixingRatio(es(Tk - K0), p)
  const num = Rd * Tk + Lv * r
  const den = cpd + (Lv * Lv * r * EPS) / (Rd * Tk * Tk)
  return num / den / p
}

export function moistAdiabatT(T0k, p0, pTarget, step = 2) {
  let T = T0k
  let p = p0
  const dir = pTarget < p0 ? -1 : 1
  let guard = 0
  while (((dir < 0 && p > pTarget) || (dir > 0 && p < pTarget)) && guard++ < 20000) {
    const dp = dir * Math.min(step, Math.abs(p - pTarget))
    const k1 = moistLapseDTdp(T, p)
    const k2 = moistLapseDTdp(T + k1 * dp, p + dp)
    T += ((k1 + k2) / 2) * dp
    p += dp
  }
  return T
}

export const moistAdiabatFromThetaW = (thetaWc, p) => moistAdiabatT(thetaWc + K0, 1000, p)

// 포화혼합비 w(g/kg)선 위의 온도(degC)
export function tempFromMixingRatio(wgkg, p) {
  const w = wgkg / 1000
  return dewpointFromE((w * p) / (EPS + w))
}

// ln(p) 선형보간
export function interpAtP(levels, p, key) {
  const s = [...levels].sort((a, b) => b.p - a.p)
  if (p >= s[0].p) return s[0][key]
  if (p <= s[s.length - 1].p) return s[s.length - 1][key]
  for (let i = 0; i < s.length - 1; i += 1) {
    const a = s[i]
    const b = s[i + 1]
    if (p <= a.p && p >= b.p) {
      const f = (Math.log(a.p) - Math.log(p)) / (Math.log(a.p) - Math.log(b.p))
      return a[key] + f * (b[key] - a[key])
    }
  }
  return NaN
}

// 어떤 값이 target을 가로지르는 지점의 다른 값 (아래에서 위로 훑는다)
export function crossing(levels, key, target, wanted = 'hgt') {
  for (let i = 0; i < levels.length - 1; i += 1) {
    const a = levels[i]
    const b = levels[i + 1]
    if (!Number.isFinite(a[key]) || !Number.isFinite(b[key])) continue
    if ((a[key] - target) * (b[key] - target) <= 0 && a[key] !== b[key]) {
      const f = (a[key] - target) / (a[key] - b[key])
      return a[wanted] + f * (b[wanted] - a[wanted])
    }
  }
  return NaN
}

// 기괴를 p0/T0/Td0에서 띄운 경로와 부력 적분
export function liftParcel(levels, p0, T0c, Td0c, pTop = 100) {
  const T0 = T0c + K0
  const Td0 = Td0c + K0
  const Tlcl = lclTemperature(T0, Td0)
  const pLcl = p0 * (Tlcl / T0) ** (1 / KAPPA)
  const th = theta(T0, p0)
  const rBelow = mixingRatio(es(Td0c), p0)

  const path = []
  for (let p = p0; p >= pTop; p -= 5) {
    const Tk = p >= pLcl ? dryAdiabatT(th, p) : moistAdiabatT(Tlcl, pLcl, p)
    path.push({ p, Tc: Tk - K0 })
  }

  let cape = 0
  let cin = 0
  let pLfc = NaN
  let pEl = NaN
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]
    const b = path[i + 1]
    const pm = (a.p + b.p) / 2
    const Tp = (a.Tc + b.Tc) / 2 + K0
    const Te = interpAtP(levels, pm, 'Tc') + K0
    const Tde = interpAtP(levels, pm, 'Tdc') + K0
    if (!Number.isFinite(Te)) continue
    const rp = pm >= pLcl ? rBelow : mixingRatio(es(Tp - K0), pm)
    const re = Number.isFinite(Tde) ? mixingRatio(es(Tde - K0), pm) : 0
    const dTv = virtualT(Tp, rp) - virtualT(Te, re)
    const contrib = Rd * dTv * (Math.log(a.p) - Math.log(b.p))
    if (dTv > 0) {
      if (!Number.isFinite(pLfc) && pm < pLcl) pLfc = pm
      if (Number.isFinite(pLfc)) cape += contrib
    } else {
      if (Number.isFinite(pLfc) && !Number.isFinite(pEl) && cape > 0) pEl = pm
      if (!Number.isFinite(pLfc)) cin += contrib
    }
  }
  return { path, pLcl, tLclC: Tlcl - K0, pLfc, pEl, cape, cin: Math.min(cin, 0), p0, T0c, Td0c }
}

// 0degC ~ -20degC 층만 적분한 CAPE (CPTP용)
export function capeInLayer(levels, parcel, hotC = 0, coldC = -20) {
  const pHot = crossing(levels, 'Tc', hotC, 'p')
  const pCold = crossing(levels, 'Tc', coldC, 'p')
  if (!Number.isFinite(pHot) || !Number.isFinite(pCold)) return { value: NaN, layers: 0 }
  let sum = 0
  let layers = 0
  for (let i = 0; i < parcel.path.length - 1; i += 1) {
    const a = parcel.path[i]
    const b = parcel.path[i + 1]
    const pm = (a.p + b.p) / 2
    if (pm > pHot || pm < pCold) continue
    const Tp = (a.Tc + b.Tc) / 2 + K0
    const Te = interpAtP(levels, pm, 'Tc') + K0
    if (!Number.isFinite(Te)) continue
    const dT = Tp - Te
    if (dT > 0) sum += Rd * dT * (Math.log(a.p) - Math.log(b.p))
    layers += 1
  }
  // 실제 등압면이 몇 개나 이 층에 걸쳤는지 (성긴 자료 경고용)
  const realLevels = levels.filter((l) => l.p <= pHot && l.p >= pCold).length
  return { value: sum, layers: realLevels, pHot, pCold }
}

// 최대불안정 기괴: 하부 300hPa 안에서 상당온위가 가장 큰 층
export function mostUnstableParcel(levels, depthHpa = 300) {
  const base = levels[0].p
  let best = null
  for (const l of levels) {
    if (l.p < base - depthHpa) break
    if (!Number.isFinite(l.Tc) || !Number.isFinite(l.Tdc)) continue
    const te = thetaE(l.Tc + K0, l.Tdc + K0, l.p)
    if (!best || te > best.te) best = { te, level: l }
  }
  if (!best) return null
  const parcel = liftParcel(levels, best.level.p, best.level.Tc, best.level.Tdc)
  return { ...parcel, thetaE: best.te }
}

export function selfCheck() {
  const near = (a, b, tol, what) => {
    if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (허용 ${tol})`)
  }
  near(es(0), 6.112, 0.001, 'es(0degC)')
  near(es(20), 23.39, 0.15, 'es(20degC)')
  near(dewpointFromE(es(12.3)), 12.3, 0.01, '이슬점 역함수')
  near(mixingRatio(es(20), 1000) * 1000, 14.9, 0.4, '혼합비 20degC/1000hPa')
  near(tempFromMixingRatio(mixingRatio(es(5), 850) * 1000, 850), 5, 0.01, '혼합비선 역함수')
  near(dryAdiabatT(theta(293.15, 1000), 1000) - K0, 20, 1e-9, '건조단열 왕복')
  near(dryAdiabatT(theta(293.15, 1000), 700) - K0, -8.4, 0.2, '건조단열 1000->700')

  const pLcl = lclPressure(293.15, 283.15, 1000)
  if (!(pLcl > 840 && pLcl < 890)) throw new Error(`LCL 이상: ${pLcl}`)

  const moist = moistAdiabatT(293.15, 1000, 700)
  const dry = dryAdiabatT(theta(293.15, 1000), 700)
  if (!(moist > dry)) throw new Error(`가단열이 건조단열보다 차갑다: ${moist} <= ${dry}`)

  let prev = Infinity
  for (let p = 1000; p >= 300; p -= 50) {
    const T = moistAdiabatT(293.15, 1000, p)
    if (!(T < prev)) throw new Error(`가단열 단조성 위반 at ${p}hPa`)
    prev = T
  }
  // 상당온위는 온도보다 항상 높다(습윤 공기)
  if (!(thetaE(293.15, 283.15, 1000) > 293.15)) throw new Error('상당온위 이상')
  return true
}
