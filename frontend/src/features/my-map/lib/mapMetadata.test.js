import test from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { buildMetadataSummary, descriptionMetadata, readExtendedDataEntries, sourceMetadata } from './mapMetadata.js'

test('HTML 설명을 실행 없이 텍스트와 중복을 포함한 속성 행으로 바꾼다', () => {
  const html = '<p>관제권 안내 문장</p><table><tr><td>Type_Code</td><td>Control Zone</td></tr><tr><td>Flag</td><td>false</td></tr><tr><td>Flag</td><td>0</td></tr></table><script>window.bad = 1</script>'
  const result = descriptionMetadata({ '@type': 'html', value: html }, { DOMParserImpl: DOMParser })
  assert.equal(result.descriptionText.includes('window.bad'), false)
  assert.equal(result.descriptionNarrativeText, '관제권 안내 문장')
  assert.deepEqual(result.entries, [
    { key: 'Type_Code', value: 'Control Zone' },
    { key: 'Flag', value: 'false' },
    { key: 'Flag', value: '0' },
  ])
  assert.deepEqual(result.descriptionRaw, { '@type': 'html', value: html })
})

test('ExtendedData는 순서와 같은 키를 보존한다', () => {
  const doc = new DOMParser().parseFromString(`<?xml version="1.0"?><Placemark><ExtendedData>
    <Data name="same"><value>0</value></Data><Data name="same"><value>false</value></Data>
    <SchemaData><SimpleData name="other">value</SimpleData></SchemaData></ExtendedData></Placemark>`, 'text/xml')
  assert.deepEqual(readExtendedDataEntries(doc.documentElement), [
    { key: 'same', value: '0' }, { key: 'same', value: 'false' }, { key: 'other', value: 'value' },
  ])
})

test('확인된 공역 필드만 단위와 기준을 함께 요약한다', () => {
  const entries = [
    { key: 'DistVertUpper_Val', value: '0' }, { key: 'DistVertUpper_UOM', value: 'Feet' }, { key: 'DistVertUpper_Code', value: 'Height' },
    { key: 'DistVertLower_Val', value: '' }, { key: 'DistVertLower_Code', value: 'Surface' },
    { key: 'MysteryAltitude', value: '5000' }, { key: 'Class_Code', value: false },
  ]
  assert.deepEqual(buildMetadataSummary(entries), [
    { label: '등급', value: false }, { label: '상한', value: '0 Feet Height' }, { label: '하한', value: 'Surface' },
  ])
})

test('DOM 원문을 읽지 못해도 변환기가 보존한 임의 속성은 남긴다', () => {
  const metadata = sourceMetadata({ properties: { name: 'x', custom: 0, enabled: false } })
  assert.deepEqual(metadata.metadataEntries, [{ key: 'custom', value: 0 }, { key: 'enabled', value: false }])
})

test('표가 있어도 narrative 설명은 source metadata에 별도로 남는다', () => {
  const metadata = sourceMetadata({ description: { '@type': 'html', value: '<p>운영 시간은 별도 공지합니다.</p><table><tr><td>Type</td><td>A</td></tr></table>' }, DOMParserImpl: DOMParser })
  assert.equal(metadata.descriptionNarrativeText, '운영 시간은 별도 공지합니다.')
  assert.deepEqual(metadata.metadataEntries, [{ key: 'Type', value: 'A' }])
})
