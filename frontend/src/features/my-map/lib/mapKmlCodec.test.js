import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DOMParser } from '@xmldom/xmldom'

import { convertImportedMap, exportMapKml, previewMapConversion } from './mapKmlCodec.js'
import { importMapDocument } from './importMapDocument.js'
import { circleGeometry, copyMapDocument, createMapDocument, createMapItem } from './mapDocument.js'
import { applyMapCommand } from './mapCommands.js'
import { buildDocumentOverlay } from './mapDocumentOverlay.js'
import { buildMapPanelTree } from './mapPanelRows.js'

globalThis.DOMParser = DOMParser

const toBuffer = (text) => new TextEncoder().encode(text).buffer

function source(itemId, folderPath = []) {
  return {
    sourceAssetId: 'original-file', itemId, folderPath,
    properties: { visibility: false, rawZero: 0, rawFalse: false, icon: 'https://example.test/icon.png' },
    metadataEntries: [{ key: 'same', value: 'first' }, { key: 'same', value: 'second' }, { key: 'zero', value: 0 }, { key: 'projectamo:item', value: 'original custom value' }],
    descriptionRaw: { '@type': 'html', value: '<p>설명 문장</p><table><tr><td>Type_Code</td><td>C</td></tr></table>' },
    descriptionText: '설명 문장 Type_Code C', summary: [{ label: '유형', value: 'C' }], warnings: ['원본 경고'],
  }
}

const style = { color: '#123456', width: 3, opacity: 0.7, fillColor: '#abcdef', fillOpacity: 0.2, pointSize: 9, dash: 'dotted', icon: 'star' }
const label = { visible: false, size: 15, always: true }
const altitude = { floorFt: 0, ceilingFt: 12000, datum: 'FL' }

function fixture() {
  return {
    schemaVersion: 1, id: 'original-document', name: '왕복 지도', kind: 'imported', revision: 73,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T01:00:00.000Z', ungroupedOrder: 5,
    source: { fileName: 'original.kmz', documentName: '원본 지도', warnings: ['문서 경고'] },
    groups: [
      { id: 'g-parent', name: '상위', parentId: null, order: 4, sourceVisibility: false },
      { id: 'g-child', name: '하위', parentId: 'g-parent', order: 2, sourceVisibility: true },
    ],
    items: [
      { id: 'compound', groupId: 'g-child', order: 8, kind: 'compound', name: '복합 Z와 구멍', description: '개인 설명',
        geometry: { type: 'GeometryCollection', geometries: [
          { type: 'Point', coordinates: [126, 37, 1000] },
          { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: [
            [[126, 37, 0], [128, 37, 50], [128, 39, 100], [126, 37, 0]],
            [[126.2, 37.2, 10], [126.4, 37.2, 10], [126.2, 37.4, 10], [126.2, 37.2, 10]],
          ] }] },
        ] }, definition: null, style, label, altitude, source: source('original-compound', ['상위', '하위']) },
      { id: 'circle', groupId: null, order: 1, kind: 'circle', name: '원', description: '원 설명',
        geometry: circleGeometry({ center: [127, 38], radiusNm: 5 }),
        definition: { center: [127, 38], radiusNm: 5 }, style, label, altitude, source: source('original-circle') },
    ],
  }
}

test('KML은 표준 Folder/Style/모든 Z 기하와 예약 메타데이터를 왕복한다', async () => {
  const original = fixture()
  const kml = exportMapKml(original)
  assert.match(kml, /<Folder id="g-parent">/)
  assert.match(kml, /<Style id="projectamo-style-0">/)
  assert.match(kml, /126,37,1000/)
  assert.match(kml, /innerBoundaryIs/)
  assert.match(kml, /projectamo:item/)

  const imported = await importMapDocument(toBuffer(kml), 'roundtrip.kml', { id: 'new-import-id' })
  assert.equal(imported.id, 'new-import-id')
  assert.equal(imported.revision, 0)
  assert.deepEqual(imported.groups, original.groups)
  assert.equal(imported.items[0].id, 'compound')
  assert.equal(imported.items[0].kind, 'compound')
  assert.equal(imported.items[0].geometry.type, 'GeometryCollection')
  assert.equal(imported.items[0].geometry.geometries[1].type, 'GeometryCollection')
  assert.equal(imported.items[0].geometry.geometries[1].geometries[0].coordinates.length, 2)
  assert.equal(imported.items[0].geometry.geometries[0].coordinates[2], 1000)
  assert.deepEqual(imported.items[0].style, style)
  assert.deepEqual(imported.items[0].label, label)
  assert.deepEqual(imported.items[0].altitude, altitude)
  assert.deepEqual(imported.items[1].definition, { center: [127, 38], radiusNm: 5 })
  assert.deepEqual(imported.items[0].source, original.items[0].source)
  assert.deepEqual(imported.source, original.source)
  assert.deepEqual(imported.items[0].source.metadataEntries.filter((entry) => entry.key === 'projectamo:item'), [{ key: 'projectamo:item', value: 'original custom value' }])
})

test('두 차례 왕복에도 예약 운송 필드가 원본 metadataEntries에 누적되지 않는다', async () => {
  const first = await importMapDocument(toBuffer(exportMapKml(fixture())), 'first.kml')
  const second = await importMapDocument(toBuffer(exportMapKml(first)), 'second.kml')
  assert.deepEqual(second.items.map((item) => item.source.metadataEntries), first.items.map((item) => item.source.metadataEntries))
  assert.equal(second.items.flatMap((item) => item.source.metadataEntries).filter((entry) => entry.key === 'projectamo:item').every((entry) => entry.value === 'original custom value'), true)
})

test('MultiPoint·MultiLineString·MultiPolygon도 표준 MultiGeometry에서 원래 형식으로 복원한다', async () => {
  const original = fixture()
  original.items = [
    { ...original.items[0], id: 'multi-point', groupId: null, geometry: { type: 'MultiPoint', coordinates: [[126, 37, 10], [127, 38, 20]] } },
    { ...original.items[0], id: 'multi-line', groupId: null, geometry: { type: 'MultiLineString', coordinates: [[[126, 37, 10], [127, 38, 20]], [[128, 37, 30], [129, 38, 40]]] } },
    { ...original.items[0], id: 'multi-polygon', groupId: null, geometry: { type: 'MultiPolygon', coordinates: [
      [[[126, 37, 0], [127, 37, 0], [127, 38, 0], [126, 37, 0]]],
      [[[128, 37, 0], [129, 37, 0], [129, 38, 0], [128, 37, 0]], [[128.2, 37.2, 0], [128.3, 37.2, 0], [128.2, 37.3, 0], [128.2, 37.2, 0]]],
    ] } },
  ].map((item, order) => ({ ...item, order }))
  const imported = await importMapDocument(toBuffer(exportMapKml(original)), 'multi.kml')
  assert.deepEqual(imported.items.map((item) => item.geometry.type), ['MultiPoint', 'MultiLineString', 'MultiPolygon'])
  assert.equal(imported.items[0].geometry.coordinates[1][2], 20)
  assert.equal(imported.items[2].geometry.coordinates[1].length, 2)
})

test('예약 JSON이 잘못되면 전체를 일반 KML로 읽고 운송 필드는 raw metadata로 남긴다', async () => {
  const invalid = exportMapKml(fixture()).replace('&quot;version&quot;:1', '&quot;version&quot;:2')
  const imported = await importMapDocument(toBuffer(invalid), 'invalid-reservation.kml')
  assert.match(imported.source.warnings.join(' '), /예약 메타데이터/)
  assert.notEqual(imported.items[0].id, 'compound')
  assert.equal(imported.items[0].source.metadataEntries.some((entry) => entry.key === 'projectamo:item'), true)
})

test('중복 또는 KML 구조 불일치 예약 자료도 부분 적용하지 않는다', async () => {
  const exported = exportMapKml(fixture())
  const itemMarker = exported.match(/<Data name="projectamo:item"><value>.*?<\/value><\/Data>/)?.[0]
  assert.ok(itemMarker)
  for (const invalid of [
    exported.replace(itemMarker, `${itemMarker}${itemMarker}`),
    exported.replace('<name>상위</name>', '<name>바뀐 폴더</name>'),
  ]) {
    const imported = await importMapDocument(toBuffer(invalid), 'invalid-structure.kml')
    assert.match(imported.source.warnings.join(' '), /예약 메타데이터/)
    assert.notEqual(imported.items[0].id, 'compound')
    assert.equal(imported.items[0].source.metadataEntries.some((entry) => entry.key === 'projectamo:item'), true)
  }
})

test('그룹·선택 범위와 변환 미리보기·개인 사본은 독립적으로 동작한다', () => {
  const original = fixture()
  const groupKml = exportMapKml(original, { groupId: 'g-parent' })
  assert.match(groupKml, /복합 Z와 구멍/)
  assert.doesNotMatch(groupKml, /<name>원<\/name>/)
  const itemKml = exportMapKml(original, { itemIds: ['circle'] })
  assert.match(itemKml, /<name>원<\/name>/)
  assert.doesNotMatch(itemKml, /복합 Z와 구멍/)
  const preview = previewMapConversion(original)
  assert.equal(preview.itemCount, 2)
  assert.deepEqual(preview.groups[1].path, ['상위', '하위'])
  assert.match(preview.warnings.join(' '), /외부 아이콘/)
  assert.match(preview.warnings.join(' '), /다각형/)
  assert.deepEqual([preview.includedCount, preview.convertedCount, preview.excludedCount], [0, 2, 0])
  assert.equal(preview.includedCount + preview.convertedCount + preview.excludedCount, preview.itemCount)
  assert.match(preview.warnings.join(' '), /MSL로 변환하지 않습니다/)
  assert.equal(preview.issues.every((issue) => issue.count > 0 && issue.samples.length > 0), true)

  const mixed = previewMapConversion({ groups: [], items: [
    { id: 'p', name: '점', kind: 'point', geometry: { type: 'Point', coordinates: [126, 37] } },
    { id: 'x', name: '빈 기하', kind: 'compound', geometry: null },
  ] })
  assert.deepEqual([mixed.includedCount, mixed.convertedCount, mixed.excludedCount], [1, 0, 1])
  assert.match(mixed.warnings.join(' '), /제외됩니다/)

  const copy = convertImportedMap(original, { name: '개인 편집본' })
  assert.equal(copy.kind, 'personal')
  assert.equal(copy.revision, 0)
  assert.equal(copy.name, '개인 편집본')
  assert.notEqual(copy.id, original.id)
  assert.notEqual(copy.items[0].id, original.items[0].id)
  assert.equal(copy.groups.every((group) => group.parentId === null), true)
  assert.deepEqual(copy.items[0].source, original.items[0].source)
})

test('그룹 없는 항목 블록의 위치는 전체·부분 내보내기와 개인 사본에서 유지된다', async () => {
  const original = fixture()
  original.groups = [
    { id: 'g-first', name: '첫째', parentId: null, order: 0, sourceVisibility: null },
    { id: 'g-parent', name: '상위', parentId: null, order: 4, sourceVisibility: false },
    { id: 'g-child', name: '하위', parentId: 'g-parent', order: 2, sourceVisibility: true },
  ]
  original.ungroupedOrder = 1

  // 전체 내보내기: 그룹 없는 항목이 '첫째'와 '상위' 사이에 남는다.
  const kml = exportMapKml(original)
  assert.ok(kml.indexOf('<name>첫째</name>') < kml.indexOf('<name>원</name>'))
  assert.ok(kml.indexOf('<name>원</name>') < kml.indexOf('<name>상위</name>'))
  const imported = await importMapDocument(toBuffer(kml), 'ungrouped-order.kml')
  assert.equal(imported.ungroupedOrder, 1)

  // 부분 내보내기: 남은 루트 그룹만 기준으로 위치를 다시 계산한다.
  const partial = exportMapKml(original, { itemIds: ['circle', 'compound'] })
  assert.ok(partial.indexOf('<name>원</name>') < partial.indexOf('<name>상위</name>'))
  // The marker keeps the shared sort key; filtering roots must not turn it into an index.
  assert.equal((await importMapDocument(toBuffer(partial), 'partial.kml')).ungroupedOrder, 1)

  // 개인 사본: 중첩 그룹을 평탄화해도 표시 순서와 블록 위치를 유지한다.
  const copy = convertImportedMap(original, { name: '사본' })
  const order = new Map(copy.groups.map((group) => [group.name, group.order]))
  assert.deepEqual([...order.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name), ['첫째', '상위', '상위 / 하위'])
  assert.equal(copy.ungroupedOrder, 1)
})

test('edited styles and label visibility survive export/import without rewriting original metadata', async () => {
  const raw = await importMapDocument(toBuffer(`<kml><Document><Placemark><name>경계</name><Style><LineStyle><color>ff0000ff</color><width>1</width></LineStyle><PolyStyle><color>ff0000ff</color></PolyStyle><LabelStyle><scale>0</scale></LabelStyle></Style><Polygon><outerBoundaryIs><LinearRing><coordinates>127,37 128,37 128,38 127,37</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`), 'original.kml')
  assert.equal(raw.items[0].label.visible, false)
  const originalSource = structuredClone(raw.items[0].source)
  const personal = copyMapDocument(raw)
  personal.items[0].style = { ...personal.items[0].style, color: '#0000ff', fillColor: '#00ff00', width: 7, opacity: 0.4, fillOpacity: 0.3 }
  personal.items[0].label.visible = true
  const reopened = await importMapDocument(toBuffer(exportMapKml(personal)), 'edited.kml')
  const before = buildDocumentOverlay([personal]).shapes.features[0].properties
  const after = buildDocumentOverlay([reopened]).shapes.features[0].properties
  for (const key of ['color', 'fill', 'width', 'opacity', 'fillOpacity', 'labelVisible']) assert.equal(after[key], before[key], key)
  assert.deepEqual(reopened.items[0].source, originalSource)
})

test('current memo is standard KML description while untouched original HTML stays intact', async () => {
  const original = await importMapDocument(toBuffer('<kml><Document><Placemark><name>P</name><description><![CDATA[<p>원래 메모</p>]]></description><Point><coordinates>127,37</coordinates></Point></Placemark></Document></kml>'), 'memo.kml')
  const copy = copyMapDocument(original)
  const standardDescription = (kml) => new DOMParser().parseFromString(kml, 'text/xml').getElementsByTagName('description')[0].textContent
  assert.equal(copy.items[0].description, '원래 메모')
  assert.equal(standardDescription(exportMapKml(copy)), '<p>원래 메모</p>')
  for (const description of ['새 메모 <>&', '']) {
    copy.items[0].description = description
    const exported = exportMapKml(copy)
    assert.equal(standardDescription(exported), description)
    const reopened = await importMapDocument(toBuffer(exported), 'memo-edited.kml')
    assert.equal(reopened.items[0].description, description)
    assert.deepEqual(reopened.items[0].source, original.items[0].source)
  }
})

test('group deletion gaps preserve the ungrouped block in copying, KML, and the view tree', async () => {
  let document = createMapDocument('정렬')
  for (const id of ['a', 'b', 'c']) document = applyMapCommand(document, { type: 'createGroup', id, name: id })
  document = applyMapCommand(document, { type: 'moveGroup', id: null, beforeGroupId: 'b' })
  document = applyMapCommand(document, { type: 'deleteGroup', id: 'a' })
  document.items = [null, 'b', 'c'].map((groupId) => createMapItem('point', { type: 'Point', coordinates: [127, 37] }, { groupId, name: groupId ?? 'ungrouped' }))
  const viewOrder = (doc) => buildMapPanelTree(doc).map((node) => node.group?.name ?? 'ungrouped')
  assert.deepEqual(viewOrder(document), ['ungrouped', 'b', 'c'])
  const copied = copyMapDocument(document, { flatten: true })
  assert.deepEqual(viewOrder(copied), ['ungrouped', 'b', 'c'])
  assert.equal(new Set([...copied.groups.map((group) => group.order), copied.ungroupedOrder]).size, 3)
  const kml = exportMapKml(document)
  assert.ok(kml.indexOf('<name>ungrouped</name>') < kml.indexOf('<name>b</name>'))
  assert.deepEqual(viewOrder(await importMapDocument(toBuffer(kml), 'ordered.kml')), ['ungrouped', 'b', 'c'])
})

test('range previews count and warn only about the exported subset including descendants', () => {
  const original = fixture()
  const circle = previewMapConversion(original, { itemIds: ['circle'] })
  assert.deepEqual([circle.itemCount, circle.includedCount, circle.convertedCount, circle.excludedCount], [1, 0, 1, 0])
  assert.equal(circle.issues.some((issue) => issue.code === 'compound'), false)
  const folder = previewMapConversion(original, { groupId: 'g-parent' })
  assert.equal(folder.itemCount, 1)
  assert.equal(folder.issues.some((issue) => issue.code === 'circle'), false)
  assert.equal(folder.issues.find((issue) => issue.code === 'externalIcon').count, 1)
  assert.equal(previewMapConversion(original, { itemIds: [] }).itemCount, 0)
})

for (const [label, path, itemCount, groupCount] of [
  ['맥케이', '/mnt/c/Users/Jond Doe/Downloads/맥케이 비행지도 ver.230729.kmz', 2135, 175],
  ['공역정보', "/mnt/c/Users/Jond Doe/Downloads/공역정보 지도자료 및 사용방법('26년 5차 AIP 기준)/공역정보(AIRAC AIP 5_26 기준).kmz", 754, 30],
]) {
  test(`${label} 실제 KMZ도 내보내기 후 항목·그룹·메타데이터를 유지한다`, { skip: !existsSync(path) }, async () => {
    const bytes = readFileSync(path)
    const first = await importMapDocument(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), path, { id: `actual-${label}` })
    const second = await importMapDocument(toBuffer(exportMapKml(first)), `${label}-export.kml`)
    assert.equal(second.items.length, itemCount)
    assert.equal(second.groups.length, groupCount)
    assert.equal(second.items.reduce((sum, item) => sum + (item.source?.metadataEntries?.length ?? 0), 0), first.items.reduce((sum, item) => sum + (item.source?.metadataEntries?.length ?? 0), 0))
    const restored = new Map(second.items.map((item) => [item.id, item]))
    for (const item of first.items) {
      assert.deepEqual(restored.get(item.id)?.source, item.source, `${label}: ${item.name} 원본 메타데이터 값 보존`)
      assert.deepEqual(restored.get(item.id)?.geometry, item.geometry, `${label}: ${item.name} 기하 보존`)
    }
  })
}
