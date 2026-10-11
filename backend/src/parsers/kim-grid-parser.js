const NUMBER_PATTERN = /^[\s+\-0-9.eE]+$/

function parseNumericRow(line) {
  const trimmed = line.trim()
  if (!trimmed || !NUMBER_PATTERN.test(trimmed)) return null
  const values = trimmed.split(/\s+/).map((value) => Number(value))
  return values.every(Number.isFinite) ? values : null
}

// 확대 영역 한 변수(44만 값, 5.8 MB)를 줄마다 trim·정규식·split·map으로 읽으면 서버에서 장당 약 150 ms가 들어,
// 받으면서 계산하는 회차의 CPU를 빼앗았다. 아래는 같은 규칙(숫자 문자만 있는 줄만, 모두 유한해야 그 줄을 쓴다)을
// 글자를 한 번 훑으며 적용한다. 값은 Number()와 비트까지 같다: 흔한 'd.ddddde±XX' 꼴은 정수 가수와 10의 거듭제곱
// 한 번의 곱·나눗셈으로 만들고(가수 < 2^53, 지수 절댓값 ≤ 22이면 IEEE 연산 한 번이라 정확히 반올림된다), 그 밖은 Number()에 맡긴다.
const POW10 = Array.from({ length: 23 }, (_, k) => 10 ** k)
const isSpace = (code) => code === 32 || code === 9 || code === 11 || code === 12 || code === 13 || code === 160 || code === 0xfeff
  || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000

function parseToken(text, start, end) {
  let i = start
  let negative = false
  const first = text.charCodeAt(i)
  if (first === 45 || first === 43) { negative = first === 45; i++ }
  let mantissa = 0
  let digits = 0
  let fraction = 0
  let sawDigit = false
  while (i < end) {
    const code = text.charCodeAt(i)
    if (code < 48 || code > 57) break
    mantissa = mantissa * 10 + (code - 48); digits++; sawDigit = true; i++
  }
  if (i < end && text.charCodeAt(i) === 46) {
    i++
    while (i < end) {
      const code = text.charCodeAt(i)
      if (code < 48 || code > 57) break
      mantissa = mantissa * 10 + (code - 48); digits++; fraction++; sawDigit = true; i++
    }
  }
  let exponent = 0
  if (sawDigit && i < end && (text.charCodeAt(i) === 101 || text.charCodeAt(i) === 69)) {
    i++
    let expNegative = false
    const sign = text.charCodeAt(i)
    if (sign === 45 || sign === 43) { expNegative = sign === 45; i++ }
    let expDigits = 0
    while (i < end) {
      const code = text.charCodeAt(i)
      if (code < 48 || code > 57) break
      exponent = exponent * 10 + (code - 48); expDigits++; i++
    }
    if (!expDigits) i = -1
    if (expNegative) exponent = -exponent
  }
  const power = exponent - fraction
  if (i === end && sawDigit && digits <= 15 && power >= -22 && power <= 22) {
    const value = power >= 0 ? mantissa * POW10[power] : mantissa / POW10[-power]
    return negative ? -value : value
  }
  return Number(text.slice(start, end))
}

// ASCII 글자 분류: 1 숫자, 2 부호·소수점·지수, 3 공백, 0 그 밖(그 줄은 숫자 줄이 아니다). 128 이상은 isSpace로 본다.
const CHAR_CLASS = new Uint8Array(128)
for (let code = 48; code <= 57; code++) CHAR_CLASS[code] = 1
for (const code of [43, 45, 46, 101, 69]) CHAR_CLASS[code] = 2
for (const code of [32, 9, 11, 12, 13]) CHAR_CLASS[code] = 3
const charClass = (code) => (code < 128 ? CHAR_CLASS[code] : (isSpace(code) ? 3 : 0))

function scanNumericRows(text) {
  const values = []
  const rowLengths = []
  const length = text.length
  let lineStart = 0
  while (lineStart <= length) {
    let lineEnd = text.indexOf('\n', lineStart)
    if (lineEnd === -1) lineEnd = length
    let a = lineStart
    let b = lineEnd
    while (a < b && charClass(text.charCodeAt(a)) === 3) a++
    while (b > a && charClass(text.charCodeAt(b - 1)) === 3) b--
    if (a < b && text.charCodeAt(a) !== 35) {
      // 한 번 훑으며 글자를 검사하고 토큰을 나눈다. 숫자가 아닌 글자가 있거나 유한하지 않은 값이 있으면 그 줄 전체를 버린다.
      const before = values.length
      let ok = true
      let tokenStart = -1
      for (let i = a; i <= b; i++) {
        const cls = i < b ? charClass(text.charCodeAt(i)) : 3
        if (cls === 0) { ok = false; break }
        if (cls === 3) {
          if (tokenStart >= 0) {
            const value = parseToken(text, tokenStart, i)
            if (!Number.isFinite(value)) { ok = false; break }
            values.push(value)
            tokenStart = -1
          }
        } else if (tokenStart < 0) tokenStart = i
      }
      if (ok) rowLengths.push(values.length - before)
      else values.length = before
    }
    lineStart = lineEnd + 1
  }
  return { values, rowLengths }
}

// 비교·시험용으로 이전 방식을 남긴다.
export function parseKimGridTextReference(text) {
  const rows = []
  const values = []
  for (const line of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const row = parseNumericRow(line)
    if (row) { rows.push(row); values.push(...row) }
  }
  return { values, rowLengths: rows.map((row) => row.length) }
}

export function scanKimNumericRows(text) {
  return scanNumericRows(String(text || '').replace(/^\uFEFF/, ''))
}

function parseHeaderValue(text, names) {
  for (const name of names) {
    const match = text.match(new RegExp(`${name}\\s*[:=]\\s*([^\\s#]+)`, 'i'))
    if (match) return match[1].trim()
  }
  return null
}

function parseHeaderDimensions(text) {
  const match = text.match(/\bi\s*=\s*(\d+)\s*,\s*j\s*=\s*(\d+)/i)
  if (!match) return null
  return { nx: Number(match[1]), ny: Number(match[2]) }
}

export function parseKimGridText(text, { variable, level = 0, bounds = {} } = {}) {
  const payload = String(text || '').replace(/^\uFEFF/, '')
  if (/Variable not found/i.test(payload)) {
    throw new Error(`Variable not found: ${variable || 'unknown'}`)
  }
  if (/file\s+is\s+not\s+exist/i.test(payload)) {
    const error = new Error('KIM grid file is not available')
    error.code = 'KIM_FILE_NOT_AVAILABLE'
    throw error
  }

  const { values, rowLengths } = scanNumericRows(payload)

  if (values.length === 0) {
    throw new Error(`KIM grid has no numeric rows for ${variable || 'unknown'}`)
  }

  const dimensions = parseHeaderDimensions(payload)
  if (dimensions) {
    const expected = dimensions.nx * dimensions.ny
    if (values.length !== expected) {
      throw new Error(`KIM grid value count mismatch for ${variable || 'unknown'}: expected ${expected}, got ${values.length}`)
    }
    return {
      variable: variable || parseHeaderValue(payload, ['variable', 'name']) || null,
      unit: parseHeaderValue(payload, ['unit']) || 'm/s',
      level,
      nx: dimensions.nx,
      ny: dimensions.ny,
      bounds: { ...bounds },
      values,
    }
  }

  const nx = rowLengths[0]
  if (!rowLengths.every((length) => length === nx)) {
    throw new Error(`KIM grid rows have inconsistent width for ${variable || 'unknown'}`)
  }

  return {
    variable: variable || parseHeaderValue(payload, ['variable', 'name']) || null,
    unit: parseHeaderValue(payload, ['unit']) || 'm/s',
    level,
    nx,
    ny: rowLengths.length,
    bounds: { ...bounds },
    values,
  }
}

export default {
  parseKimGridText,
}
