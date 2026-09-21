import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readKmlFromBuffer } from './kmzUnzip.js'

const KMZ = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/my-map/tiny.kmz', import.meta.url)))
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

test('DTD and external entities are rejected before XML parsing', async () => {
  const data=new TextEncoder().encode('<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///secret">]><kml/>')
  await assert.rejects(()=>readKmlFromBuffer(data.buffer,'unsafe.kml'),/DTD/)
})

test('declared and actual expansion bounds both reject compressed bombs', async () => {
  const {deflateRawSync}=await import('node:zlib')
  const raw=Buffer.from('A'.repeat(8*1024*1024)),packed=deflateRawSync(raw),name=Buffer.from('doc.kml')
  const l=Buffer.alloc(30),c=Buffer.alloc(46),e=Buffer.alloc(22)
  l.writeUInt32LE(0x04034b50);l.writeUInt16LE(8,8);l.writeUInt16LE(name.length,26)
  c.writeUInt32LE(0x02014b50);c.writeUInt16LE(8,10);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28)
  e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);e.writeUInt32LE(46+name.length,12);e.writeUInt32LE(30+name.length+packed.length,16)
  const make=()=>toArrayBuffer(Buffer.concat([l,name,packed,c,name,e]))
  await assert.rejects(()=>readKmlFromBuffer(make(),'bomb.kmz'),/크기/)
  c.writeUInt32LE(10,24)
  await assert.rejects(()=>readKmlFromBuffer(make(),'lying-bomb.kmz'),/크기/)
})
