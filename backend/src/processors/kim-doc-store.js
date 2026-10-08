// KIM 격자·파생 결과 문서를 JSON 대신 압축 NetCDF-4(HDF5)로 저장한다.
//
// 문서 모양은 그대로 두고 큰 숫자 배열만 압축 배열로 꺼낸다. 읽으면 JSON 파일을 읽은 것과 같은 객체
// (키 순서 포함)가 나오므로 revision·content_hash·API 응답이 바뀌지 않는다. 경로는 기존 `.json` 경로를
// 기준으로 받고 같은 자리의 `.nc`를 쓴다.
//
// 저장 형식(환경변수 KIM_STORE_FORMAT, 호출할 때 읽는다):
//   json — 지금까지와 같다(JSON만).
//   both — JSON과 NC를 함께 쓰고 JSON을 읽는다. NC는 쓰자마자 다시 읽어 JSON과 비교한다(전환 검증 기간).
//   nc   — NC만 쓰고 NC를 읽는다. NC가 없으면 이전 JSON 회차·시연 스냅샷을 읽는다.
// 원문 텍스트 캐시(raw/*.txt)는 머리말로 회차·변수를 검증하므로 텍스트 그대로 gzip으로 둔다.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { isDeepStrictEqual } from 'node:util'
import h5wasm from 'h5wasm/node'

import { appendKimRunEventForPath } from './kim-run-events.js'

await h5wasm.ready

export const KIM_STORE_FORMATS = ['json', 'nc', 'both']
const DOC_VERSION = 1
const MIN_ARRAY_LENGTH = 256
const CHUNK = 128

// config.js를 가져오지 않는다. 저장 모듈은 서버보다 먼저 로드되는 일이 많아, 여기서 config를 읽으면
// DATA_PATH 등을 나중에 정하는 시험·스크립트의 설정이 기본값으로 굳는다.
export function kimStoreFormat() {
  const format = process.env.KIM_STORE_FORMAT || 'json'
  if (!KIM_STORE_FORMATS.includes(format)) throw new Error(`Invalid KIM store format: ${format}`)
  return format
}

export function kimNcPath(jsonPath) {
  if (!jsonPath.endsWith('.json')) throw new Error(`KIM document path must end with .json: ${jsonPath}`)
  return `${jsonPath.slice(0, -5)}.nc`
}

function tmpPath(filePath) {
  return `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = tmpPath(filePath)
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, 'utf8')
  fs.renameSync(tmp, filePath)
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, ''))
}

// 숫자·null로만 된 긴 배열의 저장 자료형. JSON을 읽은 값과 정확히 같게 되돌릴 수 있는 가장 작은 형을 고른다.
function arrayDtype(values) {
  let hasNull = false
  let allInt16 = true
  let allInt32 = true
  let allFloat32 = true
  for (const value of values) {
    if (value === null) { hasNull = true; continue }
    if (typeof value !== 'number') return null
    if (!Number.isInteger(value) || Object.is(value, -0)) { allInt16 = false; allInt32 = false }
    else {
      if (value < -32768 || value > 32767) allInt16 = false
      if (value < -2147483648 || value > 2147483647) allInt32 = false
    }
    if (Math.fround(value) !== value) allFloat32 = false
  }
  if (!hasNull && allInt16) return '<h'
  if (!hasNull && allInt32) return '<i'
  return allFloat32 ? '<f' : '<d'
}

const TYPED = { '<h': Int16Array, '<i': Int32Array, '<f': Float32Array, '<d': Float64Array }

function escapeToken(token) {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1')
}

function unescapeToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

function gridShape(doc) {
  const grid = doc?.grid
  const nx = Number(grid?.nx)
  const ny = Number(grid?.ny)
  return Number.isInteger(nx) && Number.isInteger(ny) && nx > 0 && ny > 0 ? { nx, ny } : null
}

// 큰 배열을 null 자리표시로 바꾼 메타 문서와 배열 목록으로 나눈다. 객체를 바꾸지 않는다.
function splitDocument(doc) {
  const arrays = []
  const visit = (value, pointer) => {
    if (Array.isArray(value)) {
      if (value.length >= MIN_ARRAY_LENGTH) {
        const dtype = arrayDtype(value)
        if (dtype) {
          arrays.push({ pointer, dtype, values: value })
          return null
        }
      }
      return value.map((item, index) => visit(item, `${pointer}/${index}`))
    }
    if (value && typeof value === 'object') {
      const out = {}
      for (const [key, item] of Object.entries(value)) out[key] = visit(item, `${pointer}/${escapeToken(key)}`)
      return out
    }
    return value
  }
  return { meta: visit(doc, ''), arrays }
}

function setAtPointer(target, pointer, value) {
  const tokens = pointer.split('/').slice(1).map(unescapeToken)
  const last = tokens.pop()
  let cursor = target
  for (const token of tokens) cursor = cursor[token]
  cursor[last] = value
}

function encodeNcFile(filePath, doc) {
  const { meta, arrays } = splitDocument(doc)
  const shape = gridShape(doc)
  const specs = []
  const file = new h5wasm.File(filePath, 'w')
  try {
    arrays.forEach(({ pointer, dtype, values }, index) => {
      const name = `a${index}`
      const Typed = TYPED[dtype]
      const data = dtype === '<f' || dtype === '<d'
        ? Typed.from(values, (value) => (value === null ? Number.NaN : value))
        : Typed.from(values)
      const dims = shape && values.length === shape.nx * shape.ny ? [shape.ny, shape.nx] : [values.length]
      const chunks = dims.length === 2 ? [Math.min(CHUNK, dims[0]), Math.min(CHUNK, dims[1])] : [Math.min(dims[0], 65536)]
      file.create_dataset({ name, data, shape: dims, dtype, chunks, compression: 'gzip', compression_opts: 4 })
      specs.push({ pointer, name, dtype, length: values.length })
    })
    const header = Buffer.from(JSON.stringify({ version: DOC_VERSION, arrays: specs, meta }), 'utf8')
    file.create_dataset({ name: 'meta', data: new Uint8Array(header), shape: [header.length], dtype: '<B' })
  } finally {
    file.close()
  }
}

function readNcHeader(file) {
  const header = JSON.parse(Buffer.from(file.get('meta').value).toString('utf8'))
  if (header.version !== DOC_VERSION || !Array.isArray(header.arrays)) throw new Error('Unsupported KIM NC document')
  return header
}

function plainArray(typed, dtype) {
  const out = new Array(typed.length)
  if (dtype === '<f' || dtype === '<d') for (let i = 0; i < typed.length; i++) out[i] = Number.isNaN(typed[i]) ? null : typed[i]
  else for (let i = 0; i < typed.length; i++) out[i] = typed[i]
  return out
}

export function readKimNcDocument(filePath) {
  if (!fs.existsSync(filePath)) {
    const error = new Error(`ENOENT: no such file, open '${filePath}'`)
    error.code = 'ENOENT'
    throw error
  }
  const file = new h5wasm.File(filePath, 'r')
  try {
    const { arrays, meta } = readNcHeader(file)
    for (const { pointer, name, dtype, length } of arrays) {
      const typed = file.get(name).value
      if (typed.length !== length) throw new Error(`Corrupt KIM NC array ${pointer}`)
      setAtPointer(meta, pointer, plainArray(typed, dtype))
    }
    return meta
  } finally {
    file.close()
  }
}

// 배열을 일반 배열로 펼치지 않고 TypedArray로 돌려준다. 바이너리 응답·지점 조회처럼 큰 배열을 그대로 넘길 때 쓴다.
// float 배열의 결측은 NaN이다.
export function readKimNcTyped(filePath) {
  const file = new h5wasm.File(filePath, 'r')
  try {
    const { arrays, meta } = readNcHeader(file)
    const typed = {}
    for (const { pointer, name, dtype } of arrays) typed[pointer] = { dtype, values: file.get(name).value }
    return { meta, arrays: typed }
  } finally {
    file.close()
  }
}

function writeNcAtomic(ncPath, doc) {
  fs.mkdirSync(path.dirname(ncPath), { recursive: true })
  const tmp = tmpPath(ncPath)
  try {
    encodeNcFile(tmp, doc)
    fs.renameSync(tmp, ncPath)
  } catch (error) {
    fs.rmSync(tmp, { force: true })
    throw error
  }
}

// both 형식에서만 쓴다: 방금 쓴 NC를 다시 읽어 JSON으로 읽을 값과 같은지 확인하고 회차 기록에 남긴다.
function verifyNc(jsonPath, ncPath, expected) {
  let ok = false
  let reason = null
  try {
    ok = isDeepStrictEqual(readKimNcDocument(ncPath), expected)
    if (!ok) reason = 'value_mismatch'
  } catch (error) {
    reason = error.message
  }
  recordStoreCheck(jsonPath, ok, reason)
  return ok
}

const storeCheck = { checked: 0, mismatches: 0, lastMismatch: null }
export function kimStoreCheckSummary() {
  return { ...storeCheck }
}

function recordStoreCheck(jsonPath, ok, reason) {
  storeCheck.checked += 1
  if (ok) return
  storeCheck.mismatches += 1
  storeCheck.lastMismatch = { path: jsonPath, reason, at: new Date().toISOString() }
  appendKimRunEventForPath(jsonPath, { type: 'store_check_mismatch', path: path.basename(path.dirname(jsonPath)) + '/' + path.basename(jsonPath), reason })
}

export function writeKimDocument(jsonPath, payload, { format = kimStoreFormat() } = {}) {
  if (format === 'json') return writeJsonAtomic(jsonPath, payload)
  // JSON으로 쓰고 읽은 값과 같아지도록 먼저 정규화한다(NaN·Infinity → null, undefined 키 제거).
  const doc = JSON.parse(JSON.stringify(payload))
  if (format === 'both') {
    writeJsonAtomic(jsonPath, payload)
    const ncPath = kimNcPath(jsonPath)
    writeNcAtomic(ncPath, doc)
    if (!verifyNc(jsonPath, ncPath, doc)) fs.rmSync(ncPath, { force: true })
    return
  }
  writeNcAtomic(kimNcPath(jsonPath), doc)
}

// 이 문서를 실제로 담고 있는 파일. 형식에 맞는 쪽을 먼저 보고, 없으면 다른 쪽(이전 회차·시연 스냅샷)을 본다.
export function kimDocumentStoragePath(jsonPath, { format = kimStoreFormat() } = {}) {
  const ncPath = kimNcPath(jsonPath)
  const order = format === 'nc' ? [ncPath, jsonPath] : [jsonPath, ncPath]
  return order.find((candidate) => fs.existsSync(candidate)) || null
}

export function kimDocumentExists(jsonPath) {
  return kimDocumentStoragePath(jsonPath) !== null
}

export function readKimDocument(jsonPath, options) {
  const storagePath = kimDocumentStoragePath(jsonPath, options)
  if (!storagePath) {
    const error = new Error(`ENOENT: no such file, open '${jsonPath}'`)
    error.code = 'ENOENT'
    throw error
  }
  return storagePath.endsWith('.nc') ? readKimNcDocument(storagePath) : readJsonFile(storagePath)
}

// 문서에서 지정한 배열(JSON 포인터, 예: '/variables/u/values')만 읽는다. NC는 그 배열만 풀고 나머지 배열 자리는 null로 둔다.
// 읽은 배열은 저장된 자료형 그대로의 TypedArray다(int16은 Int16Array, float의 결측은 NaN). 계산 입력처럼 문서의 일부
// 변수만 필요할 때 쓴다(GKTG는 층 문서의 15개 안팎 배열 중 6개만 쓴다). JSON 문서는 통째로 읽어 일반 배열로 돌려준다.
export function readKimDocumentArrays(jsonPath, pointers, options) {
  const storagePath = kimDocumentStoragePath(jsonPath, options)
  if (!storagePath) {
    const error = new Error(`ENOENT: no such file, open '${jsonPath}'`)
    error.code = 'ENOENT'
    throw error
  }
  if (!storagePath.endsWith('.nc')) return readJsonFile(storagePath)
  const wanted = new Set(pointers)
  const file = new h5wasm.File(storagePath, 'r')
  try {
    const { arrays, meta } = readNcHeader(file)
    for (const { pointer, name, length } of arrays) {
      if (!wanted.has(pointer)) continue
      const typed = file.get(name).value
      if (typed.length !== length) throw new Error(`Corrupt KIM NC array ${pointer}`)
      setAtPointer(meta, pointer, typed)
    }
    return meta
  } finally {
    file.close()
  }
}

// 손상된 불변 결과를 지우지 않고 옆으로 옮긴다(JSON·NC 둘 다).
export function quarantineKimDocument(jsonPath, suffix) {
  for (const candidate of [jsonPath, kimNcPath(jsonPath)]) {
    if (fs.existsSync(candidate)) fs.renameSync(candidate, `${candidate}.corrupt-${suffix}`)
  }
}

// --- 원문 텍스트 캐시 ---

export function readKimRawText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  try { return zlib.gunzipSync(fs.readFileSync(`${filePath}.gz`)).toString('utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  return null
}

export function kimRawTextExists(filePath) {
  return fs.existsSync(filePath) || fs.existsSync(`${filePath}.gz`)
}

export function writeKimRawText(filePath, text, { format = kimStoreFormat() } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const target = format === 'json' ? filePath : `${filePath}.gz`
  const tmp = tmpPath(target)
  fs.writeFileSync(tmp, format === 'json' ? text : zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 6 }))
  fs.renameSync(tmp, target)
}
