import test from 'node:test'
import assert from 'node:assert/strict'
import { kmlColor, escapeXml, coordString, buildKml, isClosed } from './kmlWrite.js'

// KML 색은 aabbggrr이다. 이 순서를 틀리면 구글어스에서 색이 통째로 바뀌는데,
// 화면으로는 "색이 좀 이상한데?" 정도로만 보여 놓치기 쉽다.
test('색을 aabbggrr로 뒤집는다', () => {
  assert.equal(kmlColor('#ff0000', 1), 'ff0000ff')   // 빨강 → bb=00 gg=00 rr=ff
  assert.equal(kmlColor('#0000ff', 1), 'ffff0000')   // 파랑 → bb=ff
  assert.equal(kmlColor('#2563eb', 1), 'ffeb6325')
})

test('투명도가 알파 두 자리로 앞에 붙는다', () => {
  assert.equal(kmlColor('#ffffff', 0), '00ffffff')
  assert.equal(kmlColor('#ffffff', 0.5), '80ffffff')
  assert.equal(kmlColor('#ffffff', 1), 'ffffffff')
})

test('투명도가 범위를 벗어나도 잘라낸다', () => {
  assert.equal(kmlColor('#ffffff', -1), '00ffffff')
  assert.equal(kmlColor('#ffffff', 9), 'ffffffff')
})

test('# 없는 색과 짧은 색도 받는다', () => {
  assert.equal(kmlColor('ff0000', 1), 'ff0000ff')
})

test('이름의 XML 특수문자를 막는다', () => {
  assert.equal(escapeXml('A & B'), 'A &amp; B')
  assert.equal(escapeXml('<태그>'), '&lt;태그&gt;')
  assert.equal(escapeXml(null), '')
})

test('좌표는 lng,lat,alt를 공백으로 잇는다', () => {
  assert.equal(coordString([[126.5, 37.5], [127, 38]], 0), '126.5,37.5,0 127,38,0')
  assert.equal(coordString([[126.5, 37.5]], 304.8), '126.5,37.5,304.8')
})

test('점은 Point로, 이름과 스타일이 붙는다', () => {
  const kml = buildKml([{ kind: 'point', name: 'ALPHA', coords: [[126.5, 37.5]], color: '#ff0000' }])
  assert.match(kml, /<Point>/)
  assert.match(kml, /<name>ALPHA<\/name>/)
  assert.match(kml, /<IconStyle>/)
  assert.match(kml, /<styleUrl>#s0<\/styleUrl>/)
})

test('선은 LineString이고 고도가 없으면 땅에 붙인다', () => {
  const kml = buildKml([{ kind: 'line', name: '장주', coords: [[126, 37], [127, 38]] }])
  assert.match(kml, /<LineString>/)
  assert.match(kml, /<tessellate>1<\/tessellate>/)
  assert.doesNotMatch(kml, /altitudeMode/)
})

test('선에 고도를 주면 해수면 기준으로 띄운다', () => {
  const kml = buildKml([{ kind: 'line', name: 'A', coords: [[126, 37], [127, 38]], ceilFt: 1000 }])
  assert.match(kml, /<altitudeMode>absolute<\/altitudeMode>/)
  assert.match(kml, /126,37,304\.8/)   // 1000ft = 304.8m
})

test('면은 외곽링이 자동으로 닫힌다', () => {
  const kml = buildKml([{ kind: 'polygon', name: '구역', coords: [[126, 37], [127, 37], [127, 38]] }])
  assert.match(kml, /<LinearRing>/)
  // 첫 좌표가 끝에 한 번 더 나와야 한다
  assert.match(kml, /126,37,0 127,37,0 127,38,0 126,37,0/)
})

test('이미 닫힌 링은 다시 닫지 않는다', () => {
  const ring = [[126, 37], [127, 37], [127, 38]]
  const kml = buildKml([{ kind: 'polygon', name: '구역', coords: [...ring, ring[0]] }])
  assert.equal((kml.match(/126,37,0/g) || []).length, 2)
})

// mapbox-gl-draw가 넘기는 링은 이미 닫혀 있지만 첫 점과 끝 점이 서로 다른 배열
// 객체다. 참조로 비교하면 닫힌 링을 또 닫아 좌표가 하나 더 붙는다.
test('첫 점과 끝 점이 다른 객체여도 값이 같으면 닫힌 것으로 본다', () => {
  const coords = [[126, 37], [127, 37], [127, 38], [126, 37]]   // 끝 점은 별개 배열
  assert.equal(isClosed(coords), true)
  const kml = buildKml([{ kind: 'polygon', name: '구역', coords }])
  assert.equal((kml.match(/126,37,0/g) || []).length, 2)
})

test('열린 링은 닫아 준다', () => {
  assert.equal(isClosed([[126, 37], [127, 38]]), false)
})

test('천장을 주면 extrude로 기둥이 된다', () => {
  const kml = buildKml([{ kind: 'polygon', name: '공역', coords: [[126, 37], [127, 37], [127, 38]], ceilFt: 5000 }])
  assert.match(kml, /<extrude>1<\/extrude>/)
  assert.match(kml, /<altitudeMode>absolute<\/altitudeMode>/)
  assert.match(kml, /126,37,1524/)   // 5000ft = 1524m
})

test('면은 선 색과 채움 색을 따로 쓴다', () => {
  const kml = buildKml([{
    kind: 'polygon', name: 'A', coords: [[126, 37], [127, 37], [127, 38]],
    color: '#ff0000', opacity: 1, fillOpacity: 0.3,
  }])
  assert.match(kml, /<LineStyle><color>ff0000ff<\/color>/)
  assert.match(kml, /<PolyStyle><color>4d0000ff<\/color>/)   // 0.3 → 4d
})

test('설명은 있을 때만 넣는다', () => {
  const withDesc = buildKml([{ kind: 'point', name: 'A', coords: [[126, 37]], description: '메모' }])
  const without = buildKml([{ kind: 'point', name: 'A', coords: [[126, 37]] }])
  assert.match(withDesc, /<description>메모<\/description>/)
  assert.doesNotMatch(without, /<description>/)
})

test('도형이 여럿이면 스타일 id가 겹치지 않는다', () => {
  const kml = buildKml([
    { kind: 'point', name: 'A', coords: [[126, 37]] },
    { kind: 'point', name: 'B', coords: [[127, 38]] },
  ])
  assert.match(kml, /id="s0"/)
  assert.match(kml, /id="s1"/)
})

test('빈 목록도 열리는 문서를 만든다', () => {
  const kml = buildKml([], '빈 지도')
  assert.match(kml, /^<\?xml/)
  assert.match(kml, /<name>빈 지도<\/name>/)
  assert.match(kml, /<\/kml>$/)
})

// 글자만 놓는 도형. 구글어스에서 아이콘을 지우는 표준 방법은 크기 0이다 —
// Icon 요소를 아예 빼면 기본 압정이 도로 나온다.
test('글자 도형은 아이콘 크기를 0으로 준다', () => {
  const kml = buildKml([{ kind: 'point', name: '훈련구역', coords: [[126, 37]], textOnly: true }])
  assert.match(kml, /<IconStyle><scale>0<\/scale><Icon><\/Icon><\/IconStyle>/)
  assert.match(kml, /<LabelStyle>/)
})

test('글자 도형이 아니면 아이콘이 그대로 붙는다', () => {
  const kml = buildKml([{ kind: 'point', name: 'A', coords: [[126, 37]] }])
  assert.doesNotMatch(kml, /<scale>0<\/scale>/)
  assert.match(kml, /pushpin/)
})

test('고른 아이콘 주소가 파일에 실린다', () => {
  const url = 'https://maps.google.com/mapfiles/kml/shapes/airports.png'
  const kml = buildKml([{ kind: 'point', name: 'RKSI', coords: [[126, 37]], iconUrl: url }])
  assert.match(kml, /shapes\/airports\.png/)
})

test('아이콘 주소의 특수문자도 막는다', () => {
  const kml = buildKml([{ kind: 'point', name: 'A', coords: [[126, 37]], iconUrl: 'https://x/a?b=1&c=2' }])
  assert.match(kml, /b=1&amp;c=2/)
})

// 이름이 없을 때 `(이름 없음)`을 써 넣으면, 그 파일을 다시 불러왔을 때 그게
// 진짜 이름이 되어 지도마다 `(이름 없음)` 이름표가 줄줄이 붙는다.
test('이름이 없으면 이름 요소를 아예 넣지 않는다', () => {
  const kml = buildKml([{ kind: 'point', coords: [[126, 37]] }])
  assert.doesNotMatch(kml, /<name>\(이름 없음\)<\/name>/)
  assert.doesNotMatch(kml, /<Placemark><name>/)
})

test('빈 문자열 이름도 넣지 않는다', () => {
  assert.doesNotMatch(buildKml([{ kind: 'point', name: '', coords: [[126, 37]] }]), /<Placemark><name>/)
})

test('이름이 있으면 그대로 들어간다', () => {
  assert.match(buildKml([{ kind: 'point', name: 'ALPHA', coords: [[126, 37]] }]), /<name>ALPHA<\/name>/)
})
