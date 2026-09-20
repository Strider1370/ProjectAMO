import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'
import { importMapDocument } from './importMapDocument.js'

globalThis.DOMParser = DOMParser

const toBuffer = (text) => new TextEncoder().encode(text).buffer

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>원본 지도</name>
<Folder><name>상위</name><visibility>0</visibility><Folder><name>하위</name><visibility>1</visibility>
<Placemark id="source-a"><name>복합</name><description><![CDATA[<table><tr><td>Type_Code</td><td>Control Zone</td></tr><tr><td>DistVertUpper_Val</td><td>0</td></tr><tr><td>DistVertUpper_UOM</td><td>Feet</td></tr><tr><td>DistVertUpper_Code</td><td>Height</td></tr></table>]]></description>
<ExtendedData><Data name="same"><value>first</value></Data><Data name="same"><value>second</value></Data></ExtendedData>
<MultiGeometry><Point><coordinates>126,37,0</coordinates></Point><Polygon><outerBoundaryIs><LinearRing><coordinates>126,37 127,37 127,38 126,37</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>126.2,37.2 126.3,37.2 126.2,37.3 126.2,37.2</coordinates></LinearRing></innerBoundaryIs></Polygon></MultiGeometry></Placemark>
</Folder></Folder><Placemark><name>루트</name><Point><coordinates>128,38</coordinates></Point></Placemark></Document></kml>`

test('Placemark를 분해하지 않고 원본 폴더·복합 기하·메타데이터를 보존한다', async () => {
  const map = await importMapDocument(toBuffer(KML), 'sample.kml', { id: 'asset-1' })
  assert.equal(map.kind, 'imported')
  assert.equal(map.name, '원본 지도')
  assert.deepEqual(map.groups.map((group) => [group.name, group.parentId, group.sourceVisibility]), [
    ['상위', null, false], ['하위', 'group-0', true],
  ])
  assert.equal(map.items.length, 2)
  const compound = map.items[0]
  assert.equal(compound.id, 'item-0')
  assert.equal(compound.kind, 'compound')
  assert.equal(compound.geometry.type, 'GeometryCollection')
  assert.equal(compound.geometry.geometries[1].coordinates.length, 2)
  assert.deepEqual(compound.source.folderPath, ['상위', '하위'])
  assert.equal(compound.source.sourceAssetId, 'asset-1')
  assert.equal(compound.source.itemId, 'source-a')
  assert.deepEqual(compound.source.metadataEntries.slice(0, 2), [{ key: 'same', value: 'first' }, { key: 'same', value: 'second' }])
  assert.equal(compound.source.summary.find((x) => x.label === '상한').value, '0 Feet Height')
  assert.equal(map.items[1].groupId, null)
})

test('명시 id가 없을 때도 문서 id를 출처 자산 id로 쓴다', async () => {
  const map = await importMapDocument(toBuffer(KML), 'sample.kml')
  assert.equal(map.items[0].source.sourceAssetId, map.id)
  assert.notEqual(map.items[0].source.itemId, map.items[1].source.itemId)
})

test('변환 대상이 아닌 객체와 도형 없는 Placemark 사이에서도 원본을 참조 ID로 연결한다', async () => {
  const input = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <GroundOverlay><name>그림</name><Icon><href>image.png</href></Icon></GroundOverlay>
    <Folder><name>첫 폴더</name><Placemark id="before"><name>앞</name><ExtendedData><Data name="position"><value>before</value></Data></ExtendedData><Point><coordinates>126,37</coordinates></Point></Placemark></Folder>
    <Placemark id="missing"><name>도형 없음</name><ExtendedData><Data name="position"><value>middle</value></Data></ExtendedData><Model/></Placemark>
    <NetworkLink><name>외부</name><Link><href>elsewhere.kml</href></Link></NetworkLink>
    <Folder><name>끝 폴더</name><Placemark id="after"><name>뒤</name><ExtendedData><Data name="position"><value>after</value></Data></ExtendedData><Point><coordinates>127,38</coordinates></Point></Placemark></Folder>
  </Document></kml>`
  const map = await importMapDocument(toBuffer(input), 'references.kml', { id: 'refs' })
  const bySourceId = new Map(map.items.map((item) => [item.source.itemId, item]))
  assert.equal(bySourceId.get('before').source.metadataEntries[0].value, 'before')
  assert.equal(bySourceId.get('missing').source.metadataEntries[0].value, 'middle')
  assert.equal(bySourceId.get('missing').geometry, null)
  assert.deepEqual(bySourceId.get('after').source.folderPath, ['끝 폴더'])
  assert.equal(bySourceId.get('after').source.metadataEntries[0].value, 'after')
  assert.match(map.source.warnings.join(' '), /Placemark가 아닌 KML 객체/)
})

test('Multi*는 compound로 보존하고 KML 색·선·채움을 편집 스타일로 정규화한다', async () => {
  const input = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Style id="styled"><LineStyle><color>ff0000ff</color><width>7</width></LineStyle><PolyStyle><color>8000ff00</color><fill>0</fill></PolyStyle><IconStyle><scale>1.4</scale></IconStyle></Style>
    <Placemark id="multi-point"><styleUrl>#styled</styleUrl><MultiGeometry><Point><coordinates>126,37</coordinates></Point><Point><coordinates>127,38</coordinates></Point></MultiGeometry></Placemark>
    <Placemark id="multi-line"><styleUrl>#styled</styleUrl><MultiGeometry><LineString><coordinates>126,37 127,38</coordinates></LineString><LineString><coordinates>127,38 128,39</coordinates></LineString></MultiGeometry></Placemark>
    <Placemark id="multi-polygon"><styleUrl>#styled</styleUrl><MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>126,37 127,37 127,38 126,37</coordinates></LinearRing></outerBoundaryIs></Polygon><Polygon><outerBoundaryIs><LinearRing><coordinates>128,37 129,37 129,38 128,37</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark>
    <Placemark id="polygon"><styleUrl>#styled</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>130,37 131,37 131,38 130,37</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
  </Document></kml>`
  const map = await importMapDocument(toBuffer(input), 'styles.kml')
  for (const id of ['multi-point', 'multi-line', 'multi-polygon']) assert.equal(map.items.find((item) => item.source.itemId === id).kind, 'compound')
  const polygon = map.items.find((item) => item.source.itemId === 'polygon')
  assert.equal(polygon.kind, 'polygon')
  assert.deepEqual(polygon.style, {
    color: '#ff0000', width: 7, opacity: 1, fillColor: '#00ff00', fillOpacity: 0,
    pointSize: 7, dash: 'solid', icon: 'dot',
  })
  assert.equal(polygon.source.properties.stroke, '#ff0000')
  assert.equal(polygon.source.properties.fill, '#00ff00')
})

for (const [label, path, expectedItems, expectedGroups, expectedMetadataRows] of [
  ['맥케이', '/mnt/c/Users/Jond Doe/Downloads/맥케이 비행지도 ver.230729.kmz', 2135, 175, 0],
  ['공역정보', "/mnt/c/Users/Jond Doe/Downloads/공역정보 지도자료 및 사용방법('26년 5차 AIP 기준)/공역정보(AIRAC AIP 5_26 기준).kmz", 754, 30, 10497],
]) {
  test(`${label} 실제 KMZ의 원본 항목 수와 메타데이터를 대조한다`, { skip: !existsSync(path) }, async () => {
    const bytes = readFileSync(path)
    const map = await importMapDocument(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), path, { id: `real-${label}` })
    assert.equal(map.items.length, expectedItems)
    assert.equal(map.groups.length, expectedGroups)
    if (expectedMetadataRows) assert.equal(map.items.reduce((sum, item) => sum + item.source.metadataEntries.length, 0), expectedMetadataRows)
    if (label === '공역정보') {
      const cheongju = map.items.find((item) => item.source.itemId === 'ID_20000')
      assert.deepEqual(cheongju.source.metadataEntries.slice(0, 10), [
        { key: 'GFID', value: '{4EEEB345-D6AA-4B72-B775-DEF7F2EF7B90}' },
        { key: 'Remarks_Txt', value: '<Null>' }, { key: 'Ident_Txt', value: '<Null>' },
        { key: 'Name_Txt', value: 'CHEONGJU' }, { key: 'DistVertUpper_Val', value: '5000' },
        { key: 'DistVertUpper_UOM', value: 'Feet' }, { key: 'DistVertUpper_Code', value: 'Height' },
        { key: 'DistVertLower_Val', value: '<Null>' }, { key: 'DistVertLower_UOM', value: '<Null>' },
        { key: 'DistVertLower_Code', value: 'Surface' },
      ])
      assert.equal(cheongju.source.summary.find((entry) => entry.label === '상한').value, '5000 Feet Height')
      assert.deepEqual(cheongju.style, {
        color: '#6e6e6e', width: 0.4, opacity: 1, fillColor: '#98e600', fillOpacity: 1,
        pointSize: 5, dash: 'solid', icon: 'dot',
      })
    }
  })
}
