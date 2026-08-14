import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import { parseMyMapFile } from './parseMyMapFile.js'

// 브라우저에는 DOMParser가 내장이지만 node에는 없다. routeImport.test.js와 같은 방식으로
// 전역에 심어준다 — 그래야 구현이 브라우저 전용 코드를 그대로 쓸 수 있다.
globalThis.DOMParser = DOMParser

const KMZ = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/my-map/tiny.kmz', import.meta.url)))
const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Folder><name>RKTA</name>
  <Placemark><name>공항</name><Point><coordinates>126.4,36.7,0</coordinates></Point></Placemark>
  <Folder><name>출항절차</name>
    <Placemark><name>WP1</name><LineString><coordinates>126.4,36.7,0 126.5,36.8,0</coordinates></LineString></Placemark>
  </Folder>
</Folder>
<Folder><name>공역</name>
  <Placemark><name>R77</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
    127,37,0 127.1,37,0 127.1,37.1,0 127,37,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Folder>
</Document></kml>`

test('KMZ를 폴더 목록으로 바꾼다', async () => {
  const { list, stats } = await parseMyMapFile(toArrayBuffer(KMZ), 'tiny.kmz')
  assert.ok(Array.isArray(list))
  assert.equal(typeof stats.folders, 'number')
})

test('폴더 계층과 도형 수를 함께 준다', async () => {
  const buf = new TextEncoder().encode(KML).buffer
  const { list, stats } = await parseMyMapFile(buf, 'test.kml')
  assert.deepEqual(list.map((l) => l.name), ['RKTA', '출항절차', '공역'])
  assert.equal(stats.folders, 3)
  assert.equal(stats.features, 3)
  assert.equal(stats.points, 1)
  assert.equal(stats.lines, 1)
  assert.equal(stats.polygons, 1)
})

test('깨진 XML은 조용히 통과하지 않는다', async () => {
  // 해석기는 깨진 문서에도 예외를 던지지 않고 오류 요소를 심는다. 검사하지 않으면
  // "폴더 0개"만 뜨고 실패인 줄 모른다.
  const buf = new TextEncoder().encode('<kml><Document><name>안 닫힘').buffer
  await assert.rejects(() => parseMyMapFile(buf, 'broken.kml'), (e) => {
    assert.equal(e.stage, '지도 내용 해석')
    return true
  })
})

test('압축이 아닌 바이트는 압축 해제 단계에서 실패한다', async () => {
  const buf = new TextEncoder().encode('이건 zip이 아님').buffer
  await assert.rejects(() => parseMyMapFile(buf, 'bad.kmz'), (e) => {
    assert.equal(e.stage, '압축 해제')
    return true
  })
})

test('(폴더 없음)은 폴더 수에서 뺀다', async () => {
  // 최상위에 그냥 놓인 도형을 담으려고 우리가 만든 가상 폴더다. 파일의 폴더가 아니다.
  const loose = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><name>혼자</name><Point><coordinates>127,37,0</coordinates></Point></Placemark>
  </Document></kml>`
  const { list, stats } = await parseMyMapFile(new TextEncoder().encode(loose).buffer, 'loose.kml')
  assert.equal(list.length, 1)
  assert.equal(stats.folders, 0)
  assert.equal(stats.features, 1)
})
