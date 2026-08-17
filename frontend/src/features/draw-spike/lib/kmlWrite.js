// 그린 도형 → KML 문자열. 순수 함수 — 이 스파이크의 심장이다.
//
// 왕복이 목적이다: 여기서 쓴 KML을 my-map의 parseMyMapFile.js가 다시 읽어
// 같은 값이 나와야 한다. 그래야 "구글어스에서 열린다"를 눈으로 안 보고도 안다.

const FT_TO_M = 0.3048

/**
 * #rrggbb + 투명도(0~1) → KML 색 문자열.
 *
 * KML은 `aabbggrr`다 — 알파가 앞이고 RGB가 뒤집힌다. 이걸 안 뒤집으면
 * 구글어스에서 빨강이 파랑으로 나온다. 실제 맥케이 파일의 `ff0000ff`가
 * 빨강인 것이 그 증거다(뒤집어 읽으면 rr=ff).
 */
export function kmlColor(hex, opacity = 1) {
  const h = String(hex).replace('#', '').padEnd(6, '0').slice(0, 6)
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
  const aa = a.toString(16).padStart(2, '0')
  return `${aa}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase()
}

/** XML에서 뜻을 갖는 다섯 글자를 막는다. 이름에 `&`나 `<`가 들어오면 파일이 깨진다. */
export function escapeXml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
  return String(value ?? '').replace(/[&<>"']/g, (c) => map[c])
}

/** [[lng,lat],...] + 고도(m) → KML 좌표 문자열. */
export function coordString(coords, altM = 0) {
  return coords.map(([lng, lat]) => `${lng},${lat},${altM}`).join(' ')
}

// 고도가 실린 도형은 해수면 기준으로 쓴다. 공역·항로 고도는 MSL이므로
// relativeToGround로 쓰면 산 위에서 천장이 함께 올라가 버린다.
const ALT_MODE = 'absolute'

/** 링의 첫 점과 끝 점이 같은 자리인가. 배열 객체가 달라도 값이 같으면 닫힌 것이다. */
export function isClosed(coords) {
  if (!coords || coords.length < 2) return false
  const a = coords[0]
  const b = coords[coords.length - 1]
  return a[0] === b[0] && a[1] === b[1]
}

function styleBlock(id, shape) {
  const { kind, color = '#2563eb', opacity = 1, width = 2, fillOpacity = 0.3 } = shape
  const line = `<LineStyle><color>${kmlColor(color, opacity)}</color><width>${width}</width></LineStyle>`
  if (kind === 'polygon') {
    return `<Style id="${id}">${line}<PolyStyle><color>${kmlColor(color, fillOpacity)}</color></PolyStyle></Style>`
  }
  if (kind === 'point') {
    // 글자만 놓는 도형. 구글어스에서 아이콘을 지우는 방법은 크기를 0으로 주는 것이다
    // — Icon 자체를 빼면 기본 압정이 도로 나온다.
    if (shape.textOnly) {
      return `<Style id="${id}"><IconStyle><scale>0</scale><Icon></Icon></IconStyle>`
        + `<LabelStyle><color>${kmlColor(color, opacity)}</color><scale>${shape.labelScale ?? 1}</scale></LabelStyle></Style>`
    }
    const href = shape.iconUrl ?? 'https://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png'
    return `<Style id="${id}"><IconStyle><color>${kmlColor(color, opacity)}</color>`
      + `<Icon><href>${escapeXml(href)}</href></Icon></IconStyle></Style>`
  }
  return `<Style id="${id}">${line}</Style>`
}

function geometryBlock(shape) {
  const { kind, coords } = shape
  if (kind === 'point') {
    const altM = (shape.ceilFt || 0) * FT_TO_M
    const mode = altM > 0 ? `<altitudeMode>${ALT_MODE}</altitudeMode>` : ''
    return `<Point>${mode}<coordinates>${coordString(coords.slice(0, 1), altM)}</coordinates></Point>`
  }
  if (kind === 'line') {
    const altM = (shape.ceilFt || 0) * FT_TO_M
    const mode = altM > 0 ? `<altitudeMode>${ALT_MODE}</altitudeMode>` : '<tessellate>1</tessellate>'
    return `<LineString>${mode}<coordinates>${coordString(coords, altM)}</coordinates></LineString>`
  }
  // 면. 천장이 있으면 그 높이에 띄우고 extrude로 옆면을 내려 기둥을 만든다.
  //
  // ponytail: KML Polygon은 고도를 하나만 갖는다. 그래서 바닥이 0이 아닌 공역
  // (예: 2000~5000ft)은 여기서 정확히 표현되지 않는다 — 지금은 항상 지면부터
  // 천장까지 선다. 제대로 하려면 맥케이 파일처럼 옆면 판자를 따로 만들어야 하고,
  // 그 변환은 kml-viewer/lib/kmlWalls.js의 역방향이다. 바닥값이 실제로 쓰이는지
  // 확인된 뒤에 붙인다.
  const ceilM = (shape.ceilFt || 0) * FT_TO_M
  // 값으로 비교해야 한다. draw가 넘겨주는 링은 이미 닫혀 있지만 첫 점과 끝 점이
  // 서로 다른 배열 객체라, 참조로 비교하면 닫힌 링을 또 닫아 좌표가 하나 더 붙는다.
  const ring = isClosed(coords) ? coords : [...coords, coords[0]]
  const solid = ceilM > 0
    ? `<extrude>1</extrude><altitudeMode>${ALT_MODE}</altitudeMode>`
    : '<tessellate>1</tessellate>'
  return `<Polygon>${solid}<outerBoundaryIs><LinearRing>`
    + `<coordinates>${coordString(ring, ceilM)}</coordinates>`
    + `</LinearRing></outerBoundaryIs></Polygon>`
}

function placemark(shape, index) {
  const id = `s${index}`
  // 이름이 없으면 이름 요소 자체를 넣지 않는다.
  //
  // 예전에는 `(이름 없음)`을 대신 써 넣었는데, 그건 화면에서 쓰는 표시일 뿐
  // 자료가 아니다. 파일에 넣으면 다시 불러왔을 때 그게 진짜 이름이 되어
  // 지도마다 `(이름 없음)` 이름표가 줄줄이 붙는다.
  const name = shape.name ? `<name>${escapeXml(shape.name)}</name>` : ''
  const desc = shape.description ? `<description>${escapeXml(shape.description)}</description>` : ''
  return `${styleBlock(id, shape)}<Placemark>${name}${desc}`
    + `<styleUrl>#${id}</styleUrl>${geometryBlock(shape)}</Placemark>`
}

/** 도형 목록 → 완성된 KML 문서 문자열. */
export function buildKml(shapes, documentName = '내 지도') {
  const body = shapes.map(placemark).join('')
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<kml xmlns="http://www.opengis.net/kml/2.2">'
    + `<Document><name>${escapeXml(documentName)}</name>${body}</Document>`
    + '</kml>'
}
