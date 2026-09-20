import { parseCoordinate } from '../../custom-area/coordFormat.js'

const strictDecimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

function parseDecimal(raw, axis) {
  const value = String(raw ?? '').trim()
  if (!strictDecimal.test(value)) throw new Error(`${axis === 'lat' ? '위도' : '경도'}는 십진수만 입력하세요.`)
  return parseCoordinate(value, 'dd', axis)
}

function parsePart(raw, format, axis) {
  if (!String(raw ?? '').trim()) throw new Error(`${axis === 'lat' ? '위도' : '경도'} 값이 비어 있습니다.`)
  return format === 'dd' ? parseDecimal(raw, axis) : parseCoordinate(raw, format, axis)
}

// Each non-empty line is `name<TAB>coordinate 1<TAB>coordinate 2` or just two
// coordinates. Tabs avoid ambiguity with DMS/DDM punctuation; CSV is accepted for DD.
export function parseBulkCoordinateRows(text, { format = 'dd', coordinateOrder = 'lat-lng' } = {}) {
  return String(text ?? '').split(/\r?\n/).map((raw, index) => {
    if (!raw.trim()) return { line: index + 1, raw, skip: true }
    const columns = raw.includes('\t') ? raw.split('\t') : raw.split(',')
    const values = columns.map((value) => value.trim())
    const [name, first, second] = values.length >= 3 ? values : ['', values[0], values[1]]
    try {
      if (values.length < 2) throw new Error('이름(선택), 좌표 2개를 탭으로 구분하세요.')
      if (!first || !second) throw new Error('좌표 값이 비어 있습니다.')
      const [latRaw, lngRaw] = coordinateOrder === 'lat-lng' ? [first, second] : [second, first]
      return { line: index + 1, raw, name, coordinate: [parsePart(lngRaw, format, 'lng'), parsePart(latRaw, format, 'lat')], error: null }
    } catch (error) {
      return { line: index + 1, raw, name, coordinate: null, error: error.message }
    }
  }).filter((row) => !row.skip)
}

export function editableAltitude(floorRaw, ceilingRaw) {
  const parse = (value, label) => {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    const number = Number(raw)
    if (!Number.isFinite(number)) throw new Error(`${label} 고도는 숫자로 입력하세요.`)
    return number
  }
  const floorFt = parse(floorRaw, '바닥')
  const ceilingFt = parse(ceilingRaw, '천장')
  if (floorFt != null && ceilingFt != null && floorFt >= ceilingFt) throw new Error('바닥 고도는 천장 고도보다 낮아야 합니다.')
  return { floorFt, ceilingFt }
}
