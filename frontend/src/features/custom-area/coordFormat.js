// 좌표 직접 입력 폼의 형식(Decimal Degrees / DMS / DDM) 파싱을 담당한다.
// addVertex(lng, lat)는 항상 십진수만 받으므로, 여기서 변환까지 끝내고
// CustomAreaOverlay는 어떤 형식이 선택됐는지만 알면 된다.

export const COORD_FORMAT_OPTIONS = [
  { value: 'dd', label: 'Decimal Degrees' },
  { value: 'dms', label: 'DMS (도분초)' },
  { value: 'ddm', label: 'DDM (도분)' },
]

export const COORD_PLACEHOLDER = {
  dd: { lat: '예: 37.5665', lng: '예: 126.9780' },
  dms: { lat: '예: N37°34\'00"', lng: '예: E126°58\'41"' },
  ddm: { lat: "예: N37°34.000'", lng: "예: E126°58.683'" },
}

const AXIS_LABEL = { lat: '위도', lng: '경도' }
const AXIS_MAX = { lat: 90, lng: 180 }
const AXIS_LETTERS = { lat: 'NS', lng: 'EW' }

// N37°34'00" 또는 37°34'00"N 둘 다 허용 (° / ' / " 는 각각 유사 문자도 함께 인식)
const DMS_RE = /^([NSEW])?\s*(\d{1,3})[°\s]\s*(\d{1,2})['′\s]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([NSEW])?$/i
// N37°34.000' 또는 37°34.000'N
const DDM_RE = /^([NSEW])?\s*(\d{1,3})[°\s]\s*(\d{1,2}(?:\.\d+)?)['′]?\s*([NSEW])?$/i

function resolveSign(dirA, dirB, axis) {
  const dir = (dirA || dirB || '').toUpperCase()
  if (!dir) return 1
  if (!AXIS_LETTERS[axis].includes(dir)) {
    throw new Error(`${AXIS_LABEL[axis]}는 ${AXIS_LETTERS[axis][0]}/${AXIS_LETTERS[axis][1]} 방향만 가능합니다.`)
  }
  return dir === 'S' || dir === 'W' ? -1 : 1
}

function parseDD(raw, axis) {
  const n = parseFloat(raw)
  if (isNaN(n) || Math.abs(n) > AXIS_MAX[axis]) {
    throw new Error(`${AXIS_LABEL[axis]}는 -${AXIS_MAX[axis]} ~ ${AXIS_MAX[axis]} 사이 숫자여야 합니다.`)
  }
  return n
}

function parseDMS(raw, axis) {
  const m = DMS_RE.exec(raw)
  if (!m) throw new Error(`DMS 형식이 올바르지 않습니다. 예: ${COORD_PLACEHOLDER.dms[axis].replace('예: ', '')}`)
  const [, dirA, deg, min, sec, dirB] = m
  const sign = resolveSign(dirA, dirB, axis)
  const d = Number(deg)
  const mi = Number(min)
  const s = Number(sec)
  if (mi >= 60 || s >= 60) throw new Error('분/초는 0~59 사이여야 합니다.')
  const value = sign * (d + mi / 60 + s / 3600)
  if (Math.abs(value) > AXIS_MAX[axis]) throw new Error(`${AXIS_LABEL[axis]} 범위(-${AXIS_MAX[axis]} ~ ${AXIS_MAX[axis]})를 벗어났습니다.`)
  return value
}

function parseDDM(raw, axis) {
  const m = DDM_RE.exec(raw)
  if (!m) throw new Error(`DDM 형식이 올바르지 않습니다. 예: ${COORD_PLACEHOLDER.ddm[axis].replace('예: ', '')}`)
  const [, dirA, deg, min, dirB] = m
  const sign = resolveSign(dirA, dirB, axis)
  const d = Number(deg)
  const mi = Number(min)
  if (mi >= 60) throw new Error('분은 0~59 사이여야 합니다.')
  const value = sign * (d + mi / 60)
  if (Math.abs(value) > AXIS_MAX[axis]) throw new Error(`${AXIS_LABEL[axis]} 범위(-${AXIS_MAX[axis]} ~ ${AXIS_MAX[axis]})를 벗어났습니다.`)
  return value
}

const PARSERS = { dd: parseDD, dms: parseDMS, ddm: parseDDM }

/**
 * raw 문자열을 format('dd'|'dms'|'ddm')에 맞춰 axis('lat'|'lng') 기준 십진수로 변환한다.
 * 형식이 맞지 않거나 범위를 벗어나면 한국어 메시지를 담은 Error를 throw한다.
 */
export function parseCoordinate(raw, format, axis) {
  return PARSERS[format](String(raw ?? '').trim(), axis)
}
