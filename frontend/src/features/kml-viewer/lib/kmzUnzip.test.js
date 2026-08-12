import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readKmlFromBuffer } from './kmzUnzip.js'

const KMZ = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/kml-viewer/tiny.kmz', import.meta.url)))
const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)

test('KMZ 안의 doc.kml을 꺼낸다', async () => {
  const text = await readKmlFromBuffer(toArrayBuffer(KMZ), 'tiny.kmz')
  assert.match(text, /<kml/)
  assert.match(text, /<name>tiny<\/name>/)
})

test('.kml 파일은 압축 해제 없이 그대로 읽는다', async () => {
  const raw = '<?xml version="1.0"?><kml><Document><name>직접</name></Document></kml>'
  const buf = new TextEncoder().encode(raw).buffer
  assert.equal(await readKmlFromBuffer(buf, 'plain.kml'), raw)
})

test('.kml은 UTF-8 BOM이 있어도 읽힌다', async () => {
  const raw = '<?xml version="1.0"?><kml/>'
  const bytes = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(raw)])
  assert.equal(await readKmlFromBuffer(bytes.buffer, 'bom.kml'), raw)
})

test('zip이 아닌 바이트는 한국어 오류로 거부한다', async () => {
  const buf = new TextEncoder().encode('이건 zip이 아님').buffer
  await assert.rejects(() => readKmlFromBuffer(buf, 'bad.kmz'), /압축/)
})

test('kml 항목이 없는 zip은 한국어 오류로 거부한다', async () => {
  // 구현은 이름을 '중앙 디렉터리'에서 읽는다(지역 헤더가 아니라). 그래서 패치도
  // 중앙 디렉터리 쪽 이름을 바꿔야 한다 — 지역 헤더만 바꾸면 이 시험은 통과해버려
  // 아무것도 검증하지 못한다.
  const bytes = new Uint8Array(KMZ)
  const view = new DataView(bytes.buffer)
  const eocd = bytes.length - 22
  const cenOffset = view.getUint32(eocd + 16, true)
  bytes.set(new TextEncoder().encode('doc.txt'), cenOffset + 46)
  await assert.rejects(() => readKmlFromBuffer(bytes.buffer, 'nokml.kmz'), /KML/)
})
