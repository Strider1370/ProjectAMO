import crypto from 'node:crypto'

export const KIM_NWP_MODEL = 'KIMG/NE57'
export const KIM_NWP_FORECAST_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]
export const KIM_NWP_LEVELS = [
  { id: '1000hPa', label: '1000', kind: 'pressure', value: 1000, unit: 'hPa', level: 1000, uName: 'u', vName: 'v' },
  { id: '975hPa', label: '975', kind: 'pressure', value: 975, unit: 'hPa', level: 975, uName: 'u', vName: 'v' },
  { id: '950hPa', label: '950', kind: 'pressure', value: 950, unit: 'hPa', level: 950, uName: 'u', vName: 'v' },
  { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa', level: 925, uName: 'u', vName: 'v' },
  { id: '900hPa', label: '900', kind: 'pressure', value: 900, unit: 'hPa', level: 900, uName: 'u', vName: 'v' },
  { id: '875hPa', label: '875', kind: 'pressure', value: 875, unit: 'hPa', level: 875, uName: 'u', vName: 'v' },
  { id: '850hPa', label: '850', kind: 'pressure', value: 850, unit: 'hPa', level: 850, uName: 'u', vName: 'v' },
  { id: '800hPa', label: '800', kind: 'pressure', value: 800, unit: 'hPa', level: 800, uName: 'u', vName: 'v' },
  { id: '750hPa', label: '750', kind: 'pressure', value: 750, unit: 'hPa', level: 750, uName: 'u', vName: 'v' },
  { id: '700hPa', label: '700', kind: 'pressure', value: 700, unit: 'hPa', level: 700, uName: 'u', vName: 'v' },
  { id: '650hPa', label: '650', kind: 'pressure', value: 650, unit: 'hPa', level: 650, uName: 'u', vName: 'v' },
  { id: '600hPa', label: '600', kind: 'pressure', value: 600, unit: 'hPa', level: 600, uName: 'u', vName: 'v' },
  { id: '550hPa', label: '550', kind: 'pressure', value: 550, unit: 'hPa', level: 550, uName: 'u', vName: 'v' },
  { id: '500hPa', label: '500', kind: 'pressure', value: 500, unit: 'hPa', level: 500, uName: 'u', vName: 'v' },
  { id: '450hPa', label: '450', kind: 'pressure', value: 450, unit: 'hPa', level: 450, uName: 'u', vName: 'v' },
  { id: '400hPa', label: '400', kind: 'pressure', value: 400, unit: 'hPa', level: 400, uName: 'u', vName: 'v' },
  { id: '350hPa', label: '350', kind: 'pressure', value: 350, unit: 'hPa', level: 350, uName: 'u', vName: 'v' },
  { id: '300hPa', label: '300', kind: 'pressure', value: 300, unit: 'hPa', level: 300, uName: 'u', vName: 'v' },
  { id: '250hPa', label: '250', kind: 'pressure', value: 250, unit: 'hPa', level: 250, uName: 'u', vName: 'v' },
  { id: '200hPa', label: '200', kind: 'pressure', value: 200, unit: 'hPa', level: 200, uName: 'u', vName: 'v' },
  { id: '150hPa', label: '150', kind: 'pressure', value: 150, unit: 'hPa', level: 150, uName: 'u', vName: 'v' },
]
export const KIM_NWP_MOISTURE_LEVEL_IDS = ['1000hPa', '975hPa', '950hPa', '925hPa', '900hPa', '875hPa', '850hPa', '800hPa', '750hPa', '700hPa', '650hPa', '600hPa', '550hPa', '500hPa', '450hPa', '400hPa', '350hPa', '300hPa', '250hPa', '200hPa', '150hPa']
export const KIM_NWP_MOISTURE_LEVELS = KIM_NWP_LEVELS.filter((level) => KIM_NWP_MOISTURE_LEVEL_IDS.includes(level.id))
export const KIM_NWP_ICING_LEVEL_IDS = ['925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa', '300hPa']
export const KIM_NWP_ICING_LEVELS = KIM_NWP_LEVELS.filter((level) => KIM_NWP_ICING_LEVEL_IDS.includes(level.id))

const SCALE_BY_VARIABLE = {
  u: 0.01,
  v: 0.01,
  T: 0.01,
  rh: 0.01,
  rh_liq: 0.01,
  w: 0.001,
  cld: 0.0001,
  tqc: 2e-7,
  tqi: 2e-7,
  tqr: 2e-7,
  tqs: 2e-7,
  hgt: 1, // integer metres; int16 range (±32767m) covers 150hPa (~14km)
}
const DEFAULT_SCALE = 0.01
const OFFSET = 0
const INT16_MIN = -32767
const INT16_MAX = 32767
const MISSING_ENCODED = -32768

function round(value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function scaleFor(variable) {
  return SCALE_BY_VARIABLE[variable] ?? DEFAULT_SCALE
}

function encodeComponent(values, scale = DEFAULT_SCALE) {
  return values.map((value) => {
    if (!Number.isFinite(value)) return MISSING_ENCODED
    const encoded = Math.round((value - OFFSET) / scale)
    return Math.max(INT16_MIN, Math.min(INT16_MAX, encoded))
  })
}

export function decodeComponent(values, variable = {}) {
  if (variable.encoding === 'int16-scaled-json-v1') {
    return values.map((value) => (
      value === MISSING_ENCODED || !Number.isFinite(value)
        ? Number.NaN
        : value * (variable.scale ?? 1) + (variable.offset ?? 0)
    ))
  }
  return values
}

function parseTmfc(tmfc) {
  const raw = String(tmfc || '')
  if (!/^\d{10}$/.test(raw)) return null
  return Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)),
    0,
    0,
    0,
  )
}

export function addForecastHours(tmfc, hf) {
  const baseMs = parseTmfc(tmfc)
  if (!Number.isFinite(baseMs)) return null
  return new Date(baseMs + Number(hf || 0) * 60 * 60 * 1000).toISOString()
}

function validateComponentPair(uComponent, vComponent) {
  if (!uComponent || !vComponent) throw new Error('KIM NWP wind grid requires u and v components')
  if (uComponent.nx !== vComponent.nx || uComponent.ny !== vComponent.ny) {
    throw new Error('KIM NWP u/v components have different dimensions')
  }
  if (uComponent.values.length !== vComponent.values.length) {
    throw new Error('KIM NWP u/v components have different value counts')
  }
}

function validateComponentShape(components = []) {
  if (!components.length) throw new Error('KIM NWP grid requires at least one component')
  const [first] = components
  for (const component of components) {
    if (!component?.variable) throw new Error('KIM NWP component requires a variable name')
    if (component.nx !== first.nx || component.ny !== first.ny) {
      throw new Error('KIM NWP components have different dimensions')
    }
    if (component.values?.length !== first.values?.length) {
      throw new Error('KIM NWP components have different value counts')
    }
  }
}

function statsForWind(uValues, vValues) {
  let minSpeed = Infinity
  let maxSpeed = -Infinity
  let totalSpeed = 0
  for (let index = 0; index < uValues.length; index += 1) {
    if (!Number.isFinite(uValues[index]) || !Number.isFinite(vValues[index])) continue
    const speed = Math.hypot(uValues[index], vValues[index])
    minSpeed = Math.min(minSpeed, speed)
    maxSpeed = Math.max(maxSpeed, speed)
    totalSpeed += speed
  }
  return {
    minSpeed: round(minSpeed),
    maxSpeed: round(maxSpeed),
    meanSpeed: round(totalSpeed / Math.max(1, uValues.filter((value, index) => Number.isFinite(value) && Number.isFinite(vValues[index])).length)),
  }
}

function statsForTemperature(values) {
  let minT = Infinity
  let maxT = -Infinity
  let total = 0
  let count = 0
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    minT = Math.min(minT, value)
    maxT = Math.max(maxT, value)
    total += value
    count += 1
  }
  return count > 0
    ? { minT: round(minT), maxT: round(maxT), meanT: round(total / count) }
    : { minT: null, maxT: null, meanT: null }
}

export function dewpointCFromTempRh(tempK, rhPct) {
  if (!Number.isFinite(tempK) || !Number.isFinite(rhPct)) return Number.NaN
  const tempC = tempK - 273.15
  const rh = Math.max(1e-6, Math.min(100, rhPct))
  const a = 17.625
  const b = 243.04
  const gamma = Math.log(rh / 100) + (a * tempC) / (b + tempC)
  return (b * gamma) / (a - gamma)
}

export function isKimNwpMoistureLevel(level) {
  return KIM_NWP_MOISTURE_LEVEL_IDS.includes(level?.id)
}

export function isKimNwpIcingLevel(level) {
  return KIM_NWP_ICING_LEVEL_IDS.includes(level?.id)
}

export function cloudPotentialThresholdForLevel(level) {
  return level?.id === '500hPa' ? 6 : 4
}

export function cloudPotentialScoreForSpread(spreadC, thresholdC) {
  if (!Number.isFinite(spreadC)) return Number.NaN
  if (spreadC > thresholdC) return 0
  return Math.max(0, Math.min(100, ((thresholdC - Math.max(0, spreadC)) / thresholdC) * 100))
}

function statsForSpread(values) {
  let minSpread = Infinity
  let maxSpread = -Infinity
  let total = 0
  let count = 0
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    minSpread = Math.min(minSpread, value)
    maxSpread = Math.max(maxSpread, value)
    total += value
    count += 1
  }
  return count > 0
    ? { minSpread: round(minSpread), maxSpread: round(maxSpread), meanSpread: round(total / count) }
    : { minSpread: null, maxSpread: null, meanSpread: null }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function interpolatePoints(value, points) {
  if (!Number.isFinite(value)) return Number.NaN
  if (value <= points[0][0]) return points[0][1]
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index]
    if (value <= x1) {
      const [x0, y0] = points[index - 1]
      const ratio = (value - x0) / (x1 - x0)
      return y0 + ratio * (y1 - y0)
    }
  }
  return points[points.length - 1][1]
}

function interpolateLogPoints(value, points) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return interpolatePoints(
    Math.log10(value),
    points.map(([x, y]) => [Math.log10(x), y]),
  )
}

function mTemp(tempC) {
  return interpolatePoints(tempC, [[-35, 0], [-30, 0.2], [-20, 0.7], [-15, 1], [-8, 1], [-4, 0.8], [0, 0.3], [1, 0]])
}

function mRh(rhLiq) {
  return interpolatePoints(rhLiq, [[60, 0], [75, 0.25], [85, 0.65], [92, 0.9], [98, 1]])
}

function mVerticalVelocity(w) {
  return interpolatePoints(w, [[-0.1, 0], [0, 0.05], [0.05, 0.25], [0.2, 0.7], [0.5, 1]])
}

function mCloudLiquid(tqc) {
  return interpolateLogPoints(tqc, [[1e-7, 0], [1e-6, 0.2], [1e-5, 0.5], [1e-4, 0.85], [5e-4, 1]])
}

function mLiquidRatio(ratio) {
  return interpolatePoints(ratio, [[0.1, 0], [0.3, 0.25], [0.5, 0.55], [0.7, 0.85], [0.9, 1]])
}

function mCloudFraction(cld) {
  return interpolatePoints(cld, [[0.1, 0], [0.3, 0.25], [0.6, 0.7], [0.8, 1]])
}

export function calcIcingMemberships({ tempC, rhLiq, w, tqc, liquidRatio, cld }) {
  return {
    mT: mTemp(tempC),
    mRh: mRh(rhLiq),
    mW: mVerticalVelocity(w),
    mCl: mCloudLiquid(tqc),
    mLq: mLiquidRatio(liquidRatio),
    mCc: mCloudFraction(cld),
  }
}

export function icingHardGate({ tempC, rhLiq }) {
  return Number.isFinite(tempC) && Number.isFinite(rhLiq) && tempC >= -35 && tempC <= 0 && rhLiq >= 60
}

export function calcLiquidRatio({ tqc = 0, tqr = 0, tqi = 0, tqs = 0 } = {}) {
  const liquid = Math.max(0, tqc) + Math.max(0, tqr)
  const total = liquid + Math.max(0, tqi) + Math.max(0, tqs)
  if (total <= 0) return 0
  return liquid / total
}

export function calcPhasePenalty(liquidRatio) {
  if (!Number.isFinite(liquidRatio)) return Number.NaN
  return clamp01((0.6 - liquidRatio) / 0.6)
}

export function calcFreezingBonus({ tempC, rhLiq, tqr }) {
  if (!Number.isFinite(tempC) || !Number.isFinite(rhLiq) || !Number.isFinite(tqr)) return Number.NaN
  if (tempC < -8 || tempC > 0.5 || rhLiq < 85) return 0
  return Math.min(1, Math.max(0, tqr) / 2e-4)
}

export function calcSfipBaseScore({ tempC, rhLiq, w, tqc }) {
  if (!icingHardGate({ tempC, rhLiq })) return 0
  return clamp01(mTemp(tempC) * (0.35 * mRh(rhLiq) + 0.20 * mVerticalVelocity(w) + 0.45 * mCloudLiquid(tqc)))
}

export function calcKFipLiteScore({ tempC, rhLiq, w, tqc, tqi, tqr, tqs, cld }) {
  if (!icingHardGate({ tempC, rhLiq })) return { score: 0, mCl: mCloudLiquid(tqc), bFrz: 0 }
  const liquidRatio = calcLiquidRatio({ tqc, tqr, tqi, tqs })
  const phasePenalty = calcPhasePenalty(liquidRatio)
  const bFrz = calcFreezingBonus({ tempC, rhLiq, tqr })
  const mCl = mCloudLiquid(tqc)
  const score = clamp01(
    mTemp(tempC)
      * (0.20 * mRh(rhLiq)
        + 0.15 * mVerticalVelocity(w)
        + 0.25 * mCl
        + 0.20 * mLiquidRatio(liquidRatio)
        + 0.20 * mCloudFraction(cld))
      * (1 - 0.30 * phasePenalty)
      + 0.10 * bFrz,
  )
  return { score, mCl, bFrz }
}

export function icingGradeFor(score, { mCl, bFrz } = {}) {
  if (!Number.isFinite(score)) return MISSING_ENCODED
  if (score < 0.15) return 0
  if (score < 0.40) return 1
  if (score < 0.70) return 2
  return mCl >= 0.7 || bFrz >= 0.5 ? 3 : 2
}

function statsForIcing(scores, grades) {
  let maxScore = -Infinity
  let totalScore = 0
  let validCount = 0
  let possibleCount = 0
  for (let index = 0; index < scores.length; index += 1) {
    const score = scores[index]
    if (!Number.isFinite(score)) continue
    maxScore = Math.max(maxScore, score)
    totalScore += score
    validCount += 1
    if (grades[index] > 0) possibleCount += 1
  }
  return validCount > 0
    ? {
        maxScore: round(maxScore, 4),
        meanScore: round(totalScore / validCount, 4),
        possibleFraction: round(possibleCount / validCount, 4),
      }
    : { maxScore: null, meanScore: null, possibleFraction: null }
}

function variableContentHash(variable) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      encoding: variable?.encoding || null,
      scale: variable?.scale ?? null,
      offset: variable?.offset ?? null,
      unit: variable?.unit || null,
      values: variable?.values || [],
    }))
    .digest('hex')
}

export function buildKimNwpGrid({ model = KIM_NWP_MODEL, tmfc, hf, level, components, fetchedAt = new Date().toISOString() }) {
  validateComponentShape(components)
  const [firstComponent] = components

  return {
    type: 'kim_nwp_grid',
    model,
    tmfc,
    hf: Number(hf),
    validTime: addForecastHours(tmfc, hf),
    level: { id: level.id, label: level.label, kind: level.kind, value: level.value, unit: level.unit },
    grid: {
      nx: firstComponent.nx,
      ny: firstComponent.ny,
      ...firstComponent.bounds,
    },
    variables: Object.fromEntries(components.map((component) => {
      const scale = scaleFor(component.variable)
      return [
        component.variable,
        {
          unit: component.unit || (component.variable === 'T' ? 'K' : 'm/s'),
          encoding: 'int16-scaled-json-v1',
          scale,
          offset: OFFSET,
          values: encodeComponent(component.values || [], scale),
        },
      ]
    })),
    fetched_at: fetchedAt,
  }
}

export function buildKimIcingFieldFromGrid(grid) {
  const variables = grid?.variables || {}
  const required = ['T', 'rh_liq', 'w', 'tqc', 'tqi', 'tqr', 'tqs', 'cld']
  for (const name of required) {
    if (!variables[name]) throw new Error(`KIM NWP grid is missing ${name} variable`)
  }

  const decoded = Object.fromEntries(required.map((name) => [name, decodeComponent(variables[name].values || [], variables[name])]))
  const rawScores = []
  const icingScore = []
  const icingGrade = []

  for (let index = 0; index < decoded.T.length; index += 1) {
    const values = {
      tempC: decoded.T[index] - 273.15,
      rhLiq: decoded.rh_liq[index],
      w: decoded.w[index],
      tqc: decoded.tqc[index],
      tqi: decoded.tqi[index],
      tqr: decoded.tqr[index],
      tqs: decoded.tqs[index],
      cld: decoded.cld[index],
    }
    if (!Object.values(values).every(Number.isFinite)) {
      rawScores.push(Number.NaN)
      icingScore.push(MISSING_ENCODED)
      icingGrade.push(MISSING_ENCODED)
      continue
    }
    const { score, mCl, bFrz } = calcKFipLiteScore(values)
    const grade = icingGradeFor(score, { mCl, bFrz })
    rawScores.push(score)
    icingScore.push(encodeComponent([score], 0.0001)[0])
    icingGrade.push(grade)
  }

  return {
    type: 'kim_nwp_icing_potential',
    variant: 'k-fip-lite',
    model: grid.model,
    grid: grid.grid,
    time: {
      tmfc: grid.tmfc,
      hf: grid.hf,
      validTime: grid.validTime,
    },
    level: grid.level,
    units: { icingScore: '0..1', icingGrade: 'ordinal' },
    thresholds: { gateTempMinC: -35, gateTempMaxC: 0, gateRhLiqMin: 60 },
    stats: statsForIcing(rawScores, icingGrade),
    encoding: 'int16-scaled-json-v1',
    scale: 0.0001,
    offset: OFFSET,
    fieldEncoding: {
      icingScore: { encoding: 'int16-scaled-json-v1', scale: 0.0001, offset: OFFSET, missing: MISSING_ENCODED },
      icingGrade: { encoding: 'ordinal-json-v1', scale: 1, offset: 0, missing: MISSING_ENCODED },
    },
    icingScore,
    icingGrade,
    fetched_at: grid.fetched_at,
  }
}

export function buildKimSurfaceWindFieldFromWindGrid(grid) {
  const uVariable = grid?.variables?.u
  const vVariable = grid?.variables?.v
  if (!uVariable || !vVariable) throw new Error('KIM NWP grid is missing u/v variables')
  const uValues = decodeComponent(uVariable.values || [], uVariable)
  const vValues = decodeComponent(vVariable.values || [], vVariable)

  return {
    type: 'kim_surface_wind',
    model: grid.model,
    grid: grid.grid,
    time: {
      tmfc: grid.tmfc,
      hf: grid.hf,
      validTime: grid.validTime,
    },
    level: grid.level,
    units: { u: uVariable.unit || 'm/s', v: vVariable.unit || 'm/s', speed: 'm/s' },
    stats: statsForWind(uValues, vValues),
    encoding: uVariable.encoding,
    scale: uVariable.scale,
    offset: uVariable.offset,
    u: uVariable.values || [],
    v: vVariable.values || [],
    fetched_at: grid.fetched_at,
  }
}

export function buildKimWindGrid({ model = KIM_NWP_MODEL, tmfc, hf, level, components, fetchedAt }) {
  const uComponent = components?.find((component) => component.variable === 'u')
  const vComponent = components?.find((component) => component.variable === 'v')
  validateComponentPair(uComponent, vComponent)
  return buildKimNwpGrid({ model, tmfc, hf, level, components, fetchedAt })
}

export function buildKimTemperatureFieldFromGrid(grid) {
  const variable = grid?.variables?.T
  if (!variable) throw new Error('KIM NWP grid is missing T variable')
  const values = decodeComponent(variable.values || [], variable)

  return {
    type: 'kim_nwp_temperature',
    model: grid.model,
    grid: grid.grid,
    time: {
      tmfc: grid.tmfc,
      hf: grid.hf,
      validTime: grid.validTime,
    },
    level: grid.level,
    units: { T: variable.unit || 'K' },
    stats: statsForTemperature(values),
    encoding: variable.encoding,
    scale: variable.scale,
    offset: variable.offset,
    T: variable.values || [],
    fetched_at: grid.fetched_at,
  }
}

export function buildKimCloudPotentialFieldFromGrid(grid, { thresholdC = cloudPotentialThresholdForLevel(grid?.level) } = {}) {
  const tempVariable = grid?.variables?.T
  const rhVariable = grid?.variables?.rh
  if (!tempVariable || !rhVariable) throw new Error('KIM NWP grid is missing T/rh variables')
  const tempValues = decodeComponent(tempVariable.values || [], tempVariable)
  const rhValues = decodeComponent(rhVariable.values || [], rhVariable)
  const spread = []
  const cloudPotential = []

  for (let index = 0; index < tempValues.length; index += 1) {
    const tdC = dewpointCFromTempRh(tempValues[index], rhValues[index])
    const tempC = tempValues[index] - 273.15
    const value = Number.isFinite(tdC) ? tempC - tdC : Number.NaN
    spread.push(value)
    cloudPotential.push(cloudPotentialScoreForSpread(value, thresholdC))
  }

  return {
    type: 'kim_nwp_cloud_potential',
    model: grid.model,
    grid: grid.grid,
    time: {
      tmfc: grid.tmfc,
      hf: grid.hf,
      validTime: grid.validTime,
    },
    level: grid.level,
    thresholdC,
    units: { spread: 'C', cloudPotential: '%' },
    stats: statsForSpread(spread),
    encoding: 'int16-scaled-json-v1',
    scale: DEFAULT_SCALE,
    offset: OFFSET,
    spread: encodeComponent(spread),
    cloudPotential: encodeComponent(cloudPotential),
    fetched_at: grid.fetched_at,
  }
}

// 격자 간격(도)→km. 위도방향은 상수 111.32, 경도방향은 위도 의존(×cos lat). #4 해상도 표기용.
function computeKimResolution(grid) {
  if (!grid) return null
  const { nx, ny, latMin, latMax, dx, dy } = grid
  const latMid = (Number(latMin) + Number(latMax)) / 2
  const round1 = (n) => Math.round(n * 10) / 10
  return {
    nx: Number.isFinite(nx) ? nx : null,
    ny: Number.isFinite(ny) ? ny : null,
    dx_km: Number.isFinite(dx) && Number.isFinite(latMid) ? round1(dx * 111.32 * Math.cos((latMid * Math.PI) / 180)) : null,
    dy_km: Number.isFinite(dy) ? round1(dy * 111.32) : null,
  }
}

export function buildKimNwpIndexEntry(grid, path) {
  return {
    levelId: grid.level?.id,
    hf: grid.hf,
    validTime: grid.validTime,
    variables: Object.keys(grid.variables || {}),
    hashes: Object.fromEntries(Object.entries(grid.variables || {}).map(([name, variable]) => [name, variableContentHash(variable)])),
    path,
    grid: grid.grid,
  }
}

export function buildKimNwpIndex({ model = KIM_NWP_MODEL, tmfc, entries }) {
  const levels = KIM_NWP_LEVELS
    .filter((level) => entries.some((entry) => entry.levelId === level.id))
    .map(({ id, label, kind, value, unit }) => ({ id, label, kind, value, unit }))
  const times = [...new Map(entries.map((entry) => [entry.hf, {
    hf: entry.hf,
    validTime: entry.validTime,
  }])).values()].sort((a, b) => a.hf - b.hf)
  const availability = {}

  for (const entry of entries) {
    const { levelId } = entry
    if (!levelId) continue
    availability[levelId] ||= {}
    availability[levelId][String(entry.hf)] = {
      variables: entry.variables,
      hashes: entry.hashes,
      path: entry.path,
    }
  }

  return {
    type: 'kim_nwp_index',
    model,
    latestRun: tmfc,
    initial_time: addForecastHours(tmfc, 0), // tmfc(초기장) ISO 형태. #4 메타.
    resolution: computeKimResolution(entries[0]?.grid), // {nx,ny,dx_km,dy_km} 위도보정. #4 메타.
    levels,
    times,
    availability,
  }
}

export function filterKimNwpIndexForVariables(index, requiredVariables = []) {
  const availability = {}
  for (const [levelId, byHf] of Object.entries(index?.availability || {})) {
    for (const [hf, entry] of Object.entries(byHf || {})) {
      const variables = entry?.variables || []
      if (!requiredVariables.every((name) => variables.includes(name))) continue
      availability[levelId] ||= {}
      availability[levelId][String(hf)] = {
        ...entry,
        variables: requiredVariables.length
          ? requiredVariables.filter((name) => variables.includes(name))
          : variables,
        hashes: requiredVariables.length && entry.hashes
          ? Object.fromEntries(requiredVariables.filter((name) => variables.includes(name)).map((name) => [name, entry.hashes[name]]))
          : entry.hashes,
      }
    }
  }
  const availableHfs = new Set(Object.values(availability).flatMap((byHf) => Object.keys(byHf)))
  return {
    ...index,
    levels: (index?.levels || []).filter((level) => availability[level.id]),
    times: (index?.times || []).filter((time) => availableHfs.has(String(time.hf))),
    availability,
  }
}

export default {
  KIM_NWP_FORECAST_HOURS,
  KIM_NWP_ICING_LEVEL_IDS,
  KIM_NWP_ICING_LEVELS,
  KIM_NWP_LEVELS,
  KIM_NWP_MOISTURE_LEVEL_IDS,
  KIM_NWP_MOISTURE_LEVELS,
  KIM_NWP_MODEL,
  addForecastHours,
  buildKimNwpGrid,
  buildKimNwpIndexEntry,
  buildKimNwpIndex,
  buildKimCloudPotentialFieldFromGrid,
  buildKimIcingFieldFromGrid,
  buildKimTemperatureFieldFromGrid,
  buildKimWindGrid,
  buildKimSurfaceWindFieldFromWindGrid,
  calcFreezingBonus,
  calcIcingMemberships,
  calcKFipLiteScore,
  calcLiquidRatio,
  calcPhasePenalty,
  calcSfipBaseScore,
  cloudPotentialScoreForSpread,
  cloudPotentialThresholdForLevel,
  decodeComponent,
  dewpointCFromTempRh,
  filterKimNwpIndexForVariables,
  icingGradeFor,
  icingHardGate,
  isKimNwpIcingLevel,
  isKimNwpMoistureLevel,
}
