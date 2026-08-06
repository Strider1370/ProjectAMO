// kind: 'height'(WISSDOM 고도별) | 'lead'(QPF 예측시간별) | 'single'(시각당 그림 한 장)
// zoomLevel: 산출물마다 알맞은 값이 다르다 — 아래 KMA_GRAPHIC_DEFAULT_ZOOM_LEVEL 주석 참고.
export const KMA_GRAPHIC_PRODUCTS = Object.freeze({
  wissdom: Object.freeze({ endpoint: 'nph-rdr_wis_ana_imgp', dataDtlCd: 'rdr_rdr_wis_nqc_0', data1: 'r01', data2: 'rdr_wis_nqc', cmp: 'HSR', obs: 'wv', qcd: 'NQC', kind: 'height' }),
  qpf: Object.freeze({ endpoint: 'nph-qpf_ana_imgp', dataDtlCd: 'rdr_rdr_qpf_ana1_0', data1: 'r01', data2: 'rdr_qpf_ana1', cmp: 'HSR', obs: 'ECHO', qcd: 'NQC', kind: 'lead' }),
  // 합성영상 계열(nph-rdr_cmp1_imgp). 격자가 500 m라 ZOOMLVL 14(353 m/px)가 원본에 가장 가깝다.
  hsr: Object.freeze({ endpoint: 'nph-rdr_cmp1_imgp', dataDtlCd: 'rdr_hsr_0', data1: 'h01', data2: 'hsr', cmp: 'HSP', obs: 'ECHD', qcd: 'HSLP', kind: 'single', zoomLevel: 14 }),
  hci: Object.freeze({ endpoint: 'nph-rdr_cmp1_imgp', dataDtlCd: 'rdr_hsr_0', data1: 'h01', data2: 'hsr', cmp: 'HCI', obs: 'ECHD', qcd: 'HSLP', kind: 'single', zoomLevel: 14 }),
})

export const KMA_GRAPHIC_WISSDOM_HEIGHTS_M = Object.freeze([305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048])
export const KMA_GRAPHIC_QPF_LEAD_MINUTES = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60])
// WISSDOM analyses land on :00, :10, :20 … — a five-minute request is answered with the previous slot.
export const KMA_GRAPHIC_WISSDOM_STEP_MINUTES = 10

import { coverageBounds } from './kma-graphics-projection.js'


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
  const match = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d{2}):(\d{2})(?:\s+\(\+\d+분\))?$/.exec(value)
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
  const numeric = values.map((value) => typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN))
  if (!numeric.every(Number.isFinite)) return null
  const [startX, startY, endX, endY] = numeric
  return startX !== endX && startY !== endY ? numeric : null
}

export function parseImpgResult(payload, { product, requestedTm, leadMinutes = 0 } = {}) {
  if (!KMA_GRAPHIC_PRODUCTS[product] || payload?.meta?.errCd !== '000') return null
  const result = payload?.data?.result
  const parsed = parseKmaDateTime(result?.dateTime)
  const bounds = projectedBounds(result)
  if (!parsed || !bounds || !isDataPath(result?.url) || !isDataPath(result?.bar) || typeof result?.title !== 'string') return null
  if (requestedTm && !parseKmaKstTm(requestedTm)) return null
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0) return null
  // 그림은 LCC로 그려져 오고 지도는 메르카토르다 — 수집기가 이 범위로 다시 표본화한다.
  // 환산이 한반도 밖으로 나가면 응답을 믿을 수 없다는 뜻이라 프레임째 버린다(직전 프레임 유지).
  const displayBounds = coverageBounds(bounds)
  if (!displayBounds) return null

  return {
    tm: parsed.tm,
    timeMs: parsed.timeMs,
    validTimeMs: parsed.timeMs + leadMinutes * 60_000,
    leadMinutes,
    imagePath: result.url,
    legendPath: result.bar,
    projectedBounds: bounds,
    bounds: displayBounds,
    title: result.title,
  }
}

// ZOOMLVL scales the rendered raster and nothing else — KMA reports the same image coverage
// at every level. Level 11 renders ~430x480 for the whole peninsula, which is far coarser than
// the 1600x1830 radar layer it sits beside, so the default renders at a comparable-or-better
// scale. Raise it for sharper signage output, lower it to cut bandwidth.
//
// The level also sets how large WISSDOM's wind barbs read on the map. KMA draws them at a fixed
// pixel size, so a denser raster over the same ground shrinks them. At 14 they were too small to
// read; 13 renders them about 1.5x larger at the cost of a coarser image.
export const KMA_GRAPHIC_DEFAULT_ZOOM_LEVEL = 13

// 요청 창을 아무리 넓혀도 기상청이 그려주는 영역은 1026 x 1022 km에서 멈춘다(실측).
// 그 상한을 받으려고 기본 창보다 동서로 넓게 요청한다 — 남는 요청은 무시될 뿐 손해가 없다.
const REQUEST_WINDOW = Object.freeze({ STARTX: '-800000', STARTY: '5200000', ENDX: '900000', ENDY: '3600000' })

export function buildImpgRequest(product, { tm, heightM, leadMinutes, zoomLevel } = {}) {
  const definition = KMA_GRAPHIC_PRODUCTS[product]
  if (!definition || !parseKmaKstTm(tm)) throw new TypeError('Invalid KMA graphics request')
  const level = zoomLevel ?? definition.zoomLevel ?? KMA_GRAPHIC_DEFAULT_ZOOM_LEVEL
  if (!Number.isInteger(level) || level < 11 || level > 15) throw new TypeError('Invalid zoom level')
  const params = new URLSearchParams({
    PROJ: 'LCC',
    tm,
    data1: definition.data1,
    data2: definition.data2,
    dataDtlCd: definition.dataDtlCd,
    cmp: definition.cmp, obs: definition.obs, qcd: definition.qcd, grid: '2', itv: '10', tm_mode: 'm10',
    data0: 'RCM', level: 'C', map: 'R', dtm: 'm0', zoom_level: '0', zoom_rate: '2', zoom_x: '0000000', zoom_y: '0000000',
    auto_man: '1', mode: 'H', umove: '10', fmove: '2', dmove: '180', bmove: '10', winnum: '0', rand: '10', size: '320',
    // 강·도로·도시명·지점명은 우리 지도가 이미 그린다 — 기상청이 그림에 구워 보내면 두 겹으로 겹친다.
    // gis_auto는 이미지 좌표(imageCoverageProj*)에 영향을 줄지 확인되지 않아 건드리지 않는다.
    an_frn: '1', an_itv: '1', river: 'off', road: 'off', city: 'off', gis_auto: 'on', stnname: 'off', ctrl: '0', data3: '0',
    overlay: 'spr', color: 'C4', effect: 'N', height: '320', legend: '1',
    ...REQUEST_WINDOW, ZOOMLVL: String(level), selWs: 'kh',
    tm_st: tm, tm_ed: tm, tm2: tm, eva: '1', option: '1',
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
