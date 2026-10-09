// KIM 지도 한 장(기온·구름·착빙·바람·GKTG)의 이진 형식. 서버가 만들고 브라우저가 풀어, JSON 응답과 똑같은 객체를 돌려준다.
//
// 확대 영역 한 장은 44만 칸이라 JSON(5~10 MB)으로 보내면 서버 압축과 브라우저 해석에 시간이 든다. 큰 배열(칸 수와 길이가
// 같은 배열)만 정수 배열로 떼어 붙이고 나머지는 머리말 JSON에 둔다. 정수 배열은 행 방향 차분(delta)과 바이트 섞기(shuffle)를
// 거쳐 gzip이 잘 줄이게 한다(NetCDF/HDF5·Zarr의 shuffle 필터와 같은 생각). 레퍼런스: Vane(회차별 이진 파일),
// Mapbox webgl-wind(값을 정수로 담고 배율을 곁에 둔다). docs/design/proposals/2026-10-09-kim-map-binary.md
//
//   [4바이트 'KMB1'][4바이트 머리말 길이(LE)][머리말 JSON(UTF-8)][채움][배열...]
//   머리말: { payload: 큰 배열을 뺀 응답, arrays: [{ key, type, offset, length, rowLength, filters, nullValue?, divisor? }] }
//   - type: 'i16' | 'i32' | 'f64'. filters: 적용 순서대로 'delta'(행 안에서 앞 칸과의 차, 정수 넘침은 감아 돌림)·'shuffle'.
//   - nullValue: 원래 null이던 칸에 넣은 값. divisor: 정수를 이 값으로 나누면 원래 수(GKTG 0.001 단위 등).
//   배열 시작은 8바이트 경계에 맞춘다. 전송·저장은 gzip으로 감싼다.

const MAGIC = [0x4b, 0x4d, 0x42, 0x31] // KMB1
const I16_NULL = -32768
const I32_NULL = -2147483648
const BYTES = { i16: 2, i32: 4, f64: 8 }
const TYPED = { i16: Int16Array, i32: Int32Array, f64: Float64Array }

function chooseEncoding(values) {
  let hasNull = false
  let hasI16Null = false
  let integer = true
  let milli = true
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (value === null) { hasNull = true; continue }
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    if (value === I16_NULL) hasI16Null = true
    if (integer && !Number.isInteger(value)) integer = false
    if (!integer && milli && Math.round(value * 1000) / 1000 !== value) milli = false
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!integer && !milli) return { type: 'f64' }
  const divisor = integer ? 1 : 1000
  const lo = min * divisor
  const hi = max * divisor
  // 결측을 -32768로 이미 담은 배열(null 없음)은 그대로 16비트에 들어간다. null이 있으면 -32768을 null 자리로 쓴다.
  if (hi <= 32767 && (hasNull ? lo >= -32767 && !hasI16Null : lo >= -32768)) {
    return { type: 'i16', divisor, ...(hasNull ? { nullValue: I16_NULL } : {}) }
  }
  if (lo > I32_NULL && hi <= 2147483647) return { type: 'i32', divisor, ...(hasNull ? { nullValue: I32_NULL } : {}) }
  return { type: 'f64' }
}

function toTyped(values, { type, nullValue, divisor = 1 }) {
  const out = new TYPED[type](values.length)
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (type === 'f64') out[i] = value === null ? Number.NaN : value
    else out[i] = value === null ? nullValue : Math.round(value * divisor)
  }
  return out
}

function applyFilters(typed, filters, rowLength) {
  let ints = typed
  if (filters.includes('delta')) {
    ints = new typed.constructor(typed.length)
    for (let i = 0; i < typed.length; i += 1) ints[i] = i % rowLength === 0 ? typed[i] : typed[i] - typed[i - 1]
  }
  const bytes = new Uint8Array(ints.buffer, ints.byteOffset, ints.byteLength)
  if (!filters.includes('shuffle')) return new Uint8Array(bytes)
  const size = ints.BYTES_PER_ELEMENT
  const count = ints.length
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < count; i += 1) for (let b = 0; b < size; b += 1) out[b * count + i] = bytes[i * size + b]
  return out
}

function removeFilters(bytes, { type, length, filters, rowLength }) {
  const size = BYTES[type]
  let raw = bytes
  if (filters.includes('shuffle')) {
    raw = new Uint8Array(bytes.length)
    for (let i = 0; i < length; i += 1) for (let b = 0; b < size; b += 1) raw[i * size + b] = bytes[b * length + i]
  } else raw = new Uint8Array(bytes)
  // 시스템 바이트 순서와 무관하게 읽도록 DataView로 옮긴다(브라우저·서버 모두 리틀엔디언이지만 형식은 LE로 고정).
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const out = new TYPED[type](length)
  for (let i = 0; i < length; i += 1) {
    out[i] = type === 'i16' ? view.getInt16(i * 2, true) : type === 'i32' ? view.getInt32(i * 4, true) : view.getFloat64(i * 8, true)
  }
  if (filters.includes('delta')) for (let i = 0; i < length; i += 1) if (i % rowLength !== 0) out[i] = out[i] + out[i - 1]
  return out
}

// 응답 객체 → 이진 바이트(Uint8Array). measure(bytes)를 주면 정수 배열마다 차분을 쓸지 그 크기로 고른다
// (서버: 빠른 deflate 크기). 없으면 정수 배열은 차분 + 섞기.
export function encodeKimMapBinary(payload, { measure = null } = {}) {
  const rowLength = Number(payload?.grid?.nx)
  const cells = rowLength * Number(payload?.grid?.ny)
  const rest = {}
  const arrays = []
  for (const [key, value] of Object.entries(payload)) {
    const encoding = Array.isArray(value) && value.length === cells ? chooseEncoding(value) : null
    if (!encoding) { rest[key] = value; continue }
    const typed = toTyped(value, encoding)
    let filters = encoding.type === 'f64' ? [] : ['delta', 'shuffle']
    let body = applyFilters(typed, filters, rowLength)
    if (measure && encoding.type !== 'f64') {
      const shuffled = applyFilters(typed, ['shuffle'], rowLength)
      if (measure(shuffled) < measure(body)) { filters = ['shuffle']; body = shuffled }
    }
    arrays.push({ key, encoding, filters, body, length: value.length })
  }
  const align = (n) => Math.ceil(n / 8) * 8
  const describe = (start) => {
    let offset = start
    return arrays.map(({ key, encoding: { type, nullValue, divisor }, filters, body, length }) => {
      offset = align(offset)
      const item = { key, type, offset, length, rowLength, filters, ...(nullValue !== undefined ? { nullValue } : {}), ...(divisor && divisor !== 1 ? { divisor } : {}) }
      offset += body.length
      return item
    })
  }
  const encoder = new TextEncoder()
  // 머리말 길이에 따라 배열 위치가 정해진다: 여유를 두고 한 번 잡고, 모자라면 다시 잡는다.
  let dataStart = align(8 + encoder.encode(JSON.stringify({ payload: rest, arrays: describe(0) })).length + 64)
  let header = { payload: rest, arrays: describe(dataStart) }
  let headerBytes = encoder.encode(JSON.stringify(header))
  while (8 + headerBytes.length > dataStart) {
    dataStart = align(8 + headerBytes.length + 64)
    header = { payload: rest, arrays: describe(dataStart) }
    headerBytes = encoder.encode(JSON.stringify(header))
  }
  const last = header.arrays.at(-1)
  const total = last ? last.offset + arrays.at(-1).body.length : 8 + headerBytes.length
  const out = new Uint8Array(total)
  out.set(MAGIC, 0)
  new DataView(out.buffer).setUint32(4, headerBytes.length, true)
  out.set(headerBytes, 8)
  header.arrays.forEach((item, index) => out.set(arrays[index].body, item.offset))
  return out
}

export function isKimMapBinary(bytes) {
  return bytes.length >= 8 && MAGIC.every((byte, index) => bytes[index] === byte)
}

// 이진 바이트 → JSON 응답과 같은 객체(배열은 일반 배열, 결측은 null).
export function decodeKimMapBinary(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!isKimMapBinary(bytes)) throw new Error('Not a KIM map binary')
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)))
  const payload = { ...header.payload }
  for (const item of header.arrays) {
    const typed = removeFilters(bytes.subarray(item.offset, item.offset + item.length * BYTES[item.type]), item)
    const out = new Array(item.length)
    const divisor = item.divisor || 1
    const hasNull = item.nullValue !== undefined
    for (let i = 0; i < item.length; i += 1) {
      const value = typed[i]
      if (item.type === 'f64') out[i] = Number.isNaN(value) ? null : value
      else out[i] = hasNull && value === item.nullValue ? null : divisor === 1 ? value : value / divisor
    }
    payload[item.key] = out
  }
  return payload
}
