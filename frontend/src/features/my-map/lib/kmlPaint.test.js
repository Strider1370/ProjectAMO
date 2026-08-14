import test from 'node:test'
import assert from 'node:assert/strict'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, LABEL_PAINT, httpsIcon, labelHaloFor } from './kmlPaint.js'

// 스타일은 JS로 feature를 순회해 계산하지 않고 Mapbox 표현식이 속성을 직접 읽는다.
// feature 22만 개를 JS로 훑지 않아도 되고, 파일이 정한 값이 그대로 쓰인다.
test('선 색은 파일의 stroke를 읽고, 없을 때만 기본값', () => {
  assert.deepEqual(LINE_PAINT['line-color'], ['coalesce', ['get', 'stroke'], '#3388ff'])
})

test('선 굵기·투명도도 파일 값을 우선한다', () => {
  assert.deepEqual(LINE_PAINT['line-width'], ['coalesce', ['get', 'stroke-width'], 2])
  assert.deepEqual(LINE_PAINT['line-opacity'], ['coalesce', ['get', 'stroke-opacity'], 1])
})

test('면 색과 투명도도 마찬가지', () => {
  assert.deepEqual(FILL_PAINT['fill-color'], ['coalesce', ['get', 'fill'], '#3388ff'])
  assert.deepEqual(FILL_PAINT['fill-opacity'], ['coalesce', ['get', 'fill-opacity'], 0.3])
})

test('점은 아이콘을 못 쓸 때를 대비해 원으로도 그린다', () => {
  assert.deepEqual(CIRCLE_PAINT['circle-color'], ['coalesce', ['get', 'icon-color'], ['get', 'stroke'], '#3388ff'])
})

// coalesce는 null만 잡고 타입 어서션 예외는 못 잡는다. Mapbox가 * 안의 get을
// ['number', ...]로 감싸므로 ['coalesce', ['*', ['get',...], 4], 4]는 속성이 없을 때
// 기본값으로 떨어지지 않고 평가 오류를 낸다. coalesce를 * 안쪽에 넣어야 한다.
test('아이콘 크기는 곱하기 안쪽에서 기본값을 채운다', () => {
  assert.deepEqual(CIRCLE_PAINT['circle-radius'], ['*', ['coalesce', ['get', 'icon-scale'], 1], 4])
})

test('라벨은 name을 쓴다', () => {
  assert.deepEqual(LABEL_LAYOUT['text-field'], ['coalesce', ['get', 'name'], ''])
})

// togeojson은 <LabelStyle>에서 label-color·label-scale을 뽑아준다. 다른 속성처럼
// 파일 값을 우선해야 한다 — 우리가 색을 고르지 않는다는 원칙에 라벨도 포함된다.
test('라벨 색과 크기도 파일 값을 우선한다', () => {
  assert.deepEqual(LABEL_PAINT['text-color'], ['coalesce', ['get', 'label-color'], '#111827'])
  // 크기는 파일 값을 쓰되 읽을 수 있는 바닥을 둔다 — 아래 '최소 크기' 시험 참고.
  assert.deepEqual(LABEL_LAYOUT['text-size'], ['max', ['*', ['coalesce', ['get', 'label-scale'], 1], 13], 11])
})

test('httpsIcon: http 주소를 https로 바꾼다', () => {
  assert.equal(httpsIcon('http://maps.google.com/mapfiles/kml/paddle/wht-circle.png'),
    'https://maps.google.com/mapfiles/kml/paddle/wht-circle.png')
})

test('httpsIcon: 이미 https면 그대로', () => {
  assert.equal(httpsIcon('https://example.com/a.png'), 'https://example.com/a.png')
})

test('httpsIcon: KMZ 내부 상대 경로는 쓸 수 없으므로 null', () => {
  assert.equal(httpsIcon('files/dme1.bmp'), null)
  assert.equal(httpsIcon(undefined), null)
})

// --- 이름표 읽힘 ---

test('밝은 글자에는 어두운 후광, 어두운 글자에는 흰 후광', () => {
  // 맥케이 파일의 IC·JC 이름 455개가 흰색이다. 구글어스에선 위성영상 위라 맞지만
  // 우리 기본 지도는 밝아서, 흰 글자에 흰 후광이면 아무것도 안 보인다.
  assert.equal(labelHaloFor('#ffffff'), '#1f2937')
  assert.equal(labelHaloFor('#ffff00'), '#1f2937')
  assert.equal(labelHaloFor('#00ff00'), '#1f2937')
  assert.equal(labelHaloFor('#000000'), '#ffffff')
  assert.equal(labelHaloFor('#0000ff'), '#ffffff')
  assert.equal(labelHaloFor('#ff0000'), '#ffffff')
})

test('색을 모르면 흰 후광 — 기본 글자색이 어둡기 때문', () => {
  assert.equal(labelHaloFor(null), '#ffffff')
  assert.equal(labelHaloFor(undefined), '#ffffff')
  assert.equal(labelHaloFor('아무말'), '#ffffff')
  assert.equal(labelHaloFor('#fff'), '#1f2937')   // 3자리도 읽는다
})

test('후광 색은 우리가 심은 속성을 읽는다', () => {
  assert.deepEqual(LABEL_PAINT['text-halo-color'], ['coalesce', ['get', '__labelHalo'], '#ffffff'])
})

test('이름표에 최소 크기를 둔다', () => {
  // 파일의 label-scale이 0.7이면 예전 기준(11px)으로 7.7px이라 읽을 수 없다.
  assert.deepEqual(LABEL_LAYOUT['text-size'], ['max', ['*', ['coalesce', ['get', 'label-scale'], 1], 13], 11])
})
