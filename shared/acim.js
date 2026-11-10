// ACIM(대류영역 예측모델) 계산식. 기상청 항공기상 예측모델 통합운영계정 운영 매뉴얼 v5(2026)의 3.3.1과
// 원본 소스(_SRC/src_ACI_{계절}/ACI_Indices.f90, DABA/ACIintoFL)를 그대로 옮겼다. 계수를 고치면 원본과 다른 알고리즘이다.
// 원본 SHA-256: DJF 38a35192… MAM 9080cb68… JJA dac899e3… SON d33f2d3e… ACIintoFL 6bc665f0…

export const ACIM_VERSION = 'acim-kim-v5-20261110'
export const ACIM_SCORE_SCALE = 0.0001
export const ACIM_MISSING = -32768

// 계절별 위험 범위와 6차 다항식 계수(c0..c6). ACI = a·M_OLR + b·M_APCP.
export const ACIM_SEASONS = Object.freeze({
  DJF: Object.freeze({ OLR1: 175.1087, OLR2: 203.5141, APCP1: 0.0184, APCP2: 0.3305, a: 0.5, b: 0.5,
    olr: Object.freeze([0.221424311, 0.0123572684, 0.0000105880257, -4.1162527e-7, -3.4374316e-9, -8.2250524e-12, 1.41852064e-13]),
    apcp: Object.freeze([-0.478261904, 35.451664, -403.446016, 2553.64544, -9162.41964, 17425.8973, -13625.4502]) }),
  MAM: Object.freeze({ OLR1: 151.9182, OLR2: 206.5427, APCP1: 0, APCP2: 0.9491, a: 0.5, b: 0.5,
    olr: Object.freeze([33.2832109, -0.442033258, 0.000456962327, 0.0000109165454, 5.53584567e-9, -3.42527488e-10, 7.98823205e-13]),
    apcp: Object.freeze([0.92685363, 0.6463022, -3.43862188, 10.13288896, -15.99187948, 12.69012076, -3.97289525]) }),
  JJA: Object.freeze({ OLR1: 130.4021, OLR2: 207.2141, APCP1: 0.0326, APCP2: 2.3718, a: 0.5, b: 0.5,
    olr: Object.freeze([-0.161847945, 0.00900624178, -0.0000665815312, -3.80090887e-7, 1.78885147e-9, 2.22784194e-11, -7.91852453e-14]),
    apcp: Object.freeze([0.05810748, 2.57441663, -4.79761175, 5.38891162, -3.31610807, 1.03292869, -0.12736568]) }),
  SON: Object.freeze({ OLR1: 152.0966, OLR2: 216.9666, APCP1: 0.0173, APCP2: 1.2813, a: 0.5, b: 0.5,
    olr: Object.freeze([7.39832705, -0.0920216372, 0.0000854213115, 0.00000202329257, 8.16211064e-10, -5.73679442e-11, 1.40568144e-13]),
    apcp: Object.freeze([0.11690482, 6.93252042, -29.31011725, 65.10262727, -76.15860926, 44.54203189, -10.26041971]) }),
})

// ACI → 운정고도(FL). 기준값 이상인 가장 높은 FL. 보간하지 않는다.
export const ACIM_TOP_TABLE = Object.freeze([
  [0, 0.0017], [25, 0.0179], [50, 0.0595], [75, 0.1149], [100, 0.1588], [125, 0.2017], [150, 0.2532], [175, 0.3119],
  [200, 0.3986], [225, 0.4782], [250, 0.5681], [275, 0.7422], [300, 0.8545], [325, 0.937], [350, 0.9736],
].map(row => Object.freeze(row)))

// KIM API의 precc는 2바이트 압축(0.01 kg/m² 단위)이라 무강수가 4.77e-7 같은 잡음으로 온다.
// 봄(APCP1=0)에 이 잡음이 강수로 잡히면 전 영역이 FL200이 되므로, 압축 단위의 절반 미만은 0으로 본다.
export const ACIM_PRECC_ZERO_BELOW = 0.005

// 기준시각(tmfc, UTC)의 달로 계절을 고른다. 원본 셸과 같다.
export function acimSeason(tmfc) {
  const month = Number(String(tmfc).slice(4, 6))
  if (!/^\d{10}$/.test(String(tmfc)) || month < 1 || month > 12) throw new Error('Invalid ACIM initialization time')
  return month === 12 || month < 3 ? 'DJF' : month < 6 ? 'MAM' : month < 9 ? 'JJA' : 'SON'
}

const polynomial = (c, x) => c[0] + c[1] * x + c[2] * x ** 2 + c[3] * x ** 3 + c[4] * x ** 4 + c[5] * x ** 5 + c[6] * x ** 6

// olr: 대기 상한 지구장파복사(W/m²), precc: KIM 대류성 강수량(kg/m² = mm, 1시간). 결측은 null.
export function calculateAcim(olr, precc, season) {
  const c = ACIM_SEASONS[season]
  if (!c) throw new Error('Invalid ACIM season')
  if (![olr, precc].every(Number.isFinite) || olr < 0 || precc < 0) return null
  const apcp = precc < ACIM_PRECC_ZERO_BELOW ? 0 : precc
  // 원본은 olr == OLR1을 빠뜨렸다. 낮은 OLR 쪽(1)으로 정한다. 개별 점수는 자르지 않고 최종 ACI만 0~1로 자른다.
  const molr = olr <= c.OLR1 ? 1 : olr > c.OLR2 ? 0 : polynomial(c.olr, olr)
  const mapcp = apcp <= c.APCP1 ? 0 : apcp > c.APCP2 ? 1 : polynomial(c.apcp, apcp)
  return Math.max(0, Math.min(1, c.a * molr + c.b * mapcp))
}

// 0.0017 미만도 FL000으로 둔다(원본 NCL은 소수로 남기지만 화면에서는 어차피 숨긴다).
export function acimTopFl(aci) {
  if (!Number.isFinite(aci) || aci < 0 || aci > 1) return null
  let top = 0
  for (const [fl, threshold] of ACIM_TOP_TABLE) if (aci >= threshold) top = fl
  return top
}

// 지도 색: 원본 일기도와 같다(AMO/ANCL/LIB/CT/ACIM.rgb 14색, NCL cnLevels 0..375 step 25, FL000은 투명).
// FL350은 변환표의 최상위 등급이지 실제 최대 고도가 아니다.
const ACIM_RGB = ['#ace5ff', '#87d9ff', '#07abff', '#00e1bc', '#00d091', '#01b439', '#80e410',
  '#e0fc05', '#fffc00', '#ffe200', '#ff8200', '#ff4d00', '#ff0000', '#9900bf']
export const ACIM_TOP_BANDS = Object.freeze(ACIM_RGB.map((color, i) => {
  const minFl = (i + 1) * 25
  return Object.freeze({ minFl, label: `FL${String(minFl).padStart(3, '0')}`, color })
}))

export function acimTopBand(topFl) {
  if (!Number.isFinite(topFl)) return null
  for (let i = ACIM_TOP_BANDS.length - 1; i >= 0; i--) if (topFl >= ACIM_TOP_BANDS[i].minFl) return ACIM_TOP_BANDS[i]
  return null
}

// 표시 기준: 운정 FL250 이상만. 국립기상과학원 KIM 기반 ACIM 기술노트(2026.3)가 "강한 대류"를 레이더 에코 정상고도
// FL250 이상으로 정의해 검증했다(AUC 0.654, TSS 0.14). 낮은 단계는 "ACI가 0에 가까울수록 깊은 대류가 없다"는 뜻이라
// 대류 영역으로 칠하지 않는다(원본 일기도처럼 FL025부터 칠하면 강수 면적의 2배 넘게 덮인다).
// 운정고도 값은 ACIM 그대로이며 지점 조회에서는 낮은 값도 보여 준다.
export const ACIM_DISPLAY_MIN_FL = 250
export const ACIM_DISPLAY_RULE = 'fl250-verification-v1'
export const ACIM_DISPLAY_BANDS = Object.freeze(ACIM_TOP_BANDS.filter(band => band.minFl >= ACIM_DISPLAY_MIN_FL))
// 표시용 운정고도: 결측은 null, FL250 미만은 0(숨김), 나머지는 운정고도.
export function acimDisplayFl(topFl) {
  if (!Number.isFinite(topFl)) return null
  return topFl >= ACIM_DISPLAY_MIN_FL ? topFl : 0
}

// 경로 위험 막대: 운정 FL250 이상 MOD, FL300 이상 SEV(고도와 무관하게 표시).
export const ACIM_MOD_TOP_FL = ACIM_DISPLAY_MIN_FL
export const ACIM_SEV_TOP_FL = 300

export const ACIM_SPEC = Object.freeze({ version: ACIM_VERSION, inputs: Object.freeze(['ulwrtoa', 'precc']), preccZeroBelow: ACIM_PRECC_ZERO_BELOW, displayRule: ACIM_DISPLAY_RULE })
