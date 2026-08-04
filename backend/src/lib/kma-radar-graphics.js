export const KMA_GRAPHIC_PRODUCTS = Object.freeze({
  wissdom: Object.freeze({ endpoint: 'nph-rdr_wis_ana_imgp', dataDtlCd: 'rdr_rdr_wis_nqc_0', data1: 'r01', data2: 'rdr_wis_nqc' }),
  qpf: Object.freeze({ endpoint: 'nph-qpf_ana_imgp', dataDtlCd: 'rdr_rdr_qpf_ana1_0', data1: 'r01', data2: 'rdr_qpf_ana1' }),
})

export const KMA_GRAPHIC_WISSDOM_HEIGHTS_M = Object.freeze([305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048])
export const KMA_GRAPHIC_QPF_LEAD_MINUTES = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60])

const VISUAL_ALIGNMENT_BOUNDS = Object.freeze([
  Object.freeze([30.12520229746768, 118.82639855789549]),
  Object.freeze([43.56590987094148, 133.58114159940212]),
])

function parseKstParts(year, month, day, hour, minute, tm) {
  const timeMs = Date.UTC(year, month - 1, day, hour - 9, minute)
  const date = new Date(timeMs + 9 * 60 * 60 * 1000)
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute) return null
  return { tm, timeMs }
}

export function parseKmaKstTm(tm) {
  if (typeof tm !== 'string' || !/^\d{12}$/.test(tm)) return null
  return parseKstParts(
    Number(tm.slice(0, 4)), Number(tm.slice(4, 6)), Number(tm.slice(6, 8)),
    Number(tm.slice(8, 10)), Number(tm.slice(10, 12)), tm,
  )
}

function parseKmaDateTime(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const tm = `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`
  return parseKmaKstTm(tm)
}

function isDataPath(value) {
  return typeof value === 'string'
    && value.startsWith('/data/')
    && !/[?#]/.test(value)
    && !/authkey/i.test(value)
}

function projectedBounds(result) {
  const values = [
    result?.imageCoverageStartProjX,
    result?.imageCoverageStartProjY,
    result?.imageCoverageEndProjX,
    result?.imageCoverageEndProjY,
  ]
  if (!values.every(Number.isFinite)) return null
  const [startX, startY, endX, endY] = values
  return startX !== endX && startY !== endY ? values : null
}

export function visualAlignmentBounds() {
  return VISUAL_ALIGNMENT_BOUNDS.map((corner) => [...corner])
}

export function parseImpgResult(payload, { product, requestedTm, leadMinutes = 0 } = {}) {
  if (!KMA_GRAPHIC_PRODUCTS[product] || payload?.meta?.errCd !== '000') return null
  const result = payload?.data?.result
  const parsed = parseKmaDateTime(result?.dateTime)
  const bounds = projectedBounds(result)
  if (!parsed || !bounds || !isDataPath(result?.url) || !isDataPath(result?.bar) || typeof result?.title !== 'string') return null
  if (requestedTm && !parseKmaKstTm(requestedTm)) return null
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0) return null

  return {
    tm: parsed.tm,
    timeMs: parsed.timeMs,
    validTimeMs: parsed.timeMs + leadMinutes * 60_000,
    leadMinutes,
    imagePath: result.url,
    legendPath: result.bar,
    projectedBounds: bounds,
    bounds: visualAlignmentBounds(),
    title: result.title,
  }
}

export function buildImpgRequest(product, { tm, heightM, leadMinutes } = {}) {
  const definition = KMA_GRAPHIC_PRODUCTS[product]
  if (!definition || !parseKmaKstTm(tm)) throw new TypeError('Invalid KMA graphics request')
  const params = new URLSearchParams({
    tm,
    data1: definition.data1,
    data2: definition.data2,
    dataDtlCd: definition.dataDtlCd,
  })
  if (product === 'wissdom') {
    if (!KMA_GRAPHIC_WISSDOM_HEIGHTS_M.includes(heightM)) throw new TypeError('Invalid WISSDOM height')
    params.set('ht', String(heightM))
  }
  if (product === 'qpf') {
    if (!KMA_GRAPHIC_QPF_LEAD_MINUTES.includes(leadMinutes)) throw new TypeError('Invalid QPF lead time')
    params.set('qpf', 'M')
    params.set('ef', String(leadMinutes))
  }
  return params
}
