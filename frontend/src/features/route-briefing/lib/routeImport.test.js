import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// node에는 전역 DOMParser가 없다(브라우저는 내장). routeImport.js는 전역만 쓰므로
// 테스트 환경의 폴백은 여기서 심는다 — 그래야 xmldom이 운영 번들에 실리지 않는다.
import { DOMParser } from '@xmldom/xmldom'
globalThis.DOMParser ??= DOMParser
import { parseRouteFile, extractRoutePaths, MAX_IMPORT_BYTES, simplifyRoute, snapEndpointsToAirports, isWithinKoreaFir } from './routeImport.js'

const FPL_TEXT = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/route-import/rksi-rkpk.fpl', import.meta.url)), 'utf8')

// extractRoutePaths는 { candidates, droppedTotal }을 반환한다. 후보만 보는
// 시험이 대부분이라 여기서 한 번 벗겨준다 — droppedTotal을 보는 시험은
// extractRoutePaths를 직접 부른다.
const paths = (parsed) => extractRoutePaths(parsed).candidates

const GEOJSON_LINE = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'RKSS-RKPK VFR sample' },
      geometry: { type: 'LineString', coordinates: [[126.79, 37.5583], [127.4, 37.0], [128.9382, 35.1795]] },
    },
  ],
})

test('parseRouteFile + extractRoutePaths: GeoJSON LineString → 1개 후보', () => {
  const parsed = parseRouteFile('route.geojson', GEOJSON_LINE)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSS-RKPK VFR sample')
  assert.equal(candidates[0].coords.length, 3)
  assert.deepEqual(candidates[0].coords[0], [126.79, 37.5583])
})

test('parseRouteFile: 확장자 .json도 GeoJSON으로 처리', () => {
  const parsed = parseRouteFile('route.json', GEOJSON_LINE)
  assert.equal(paths(parsed).length, 1)
})

test('parseRouteFile: 깨진 GeoJSON은 에러', () => {
  assert.throws(() => parseRouteFile('bad.geojson', '{not json'))
})

// GeoJSON 스펙상 최상위 문서가 Feature/FeatureCollection 없이 순수 Geometry일 수도
// 있다(예: mapbox-gl-js 테스트 픽스처처럼 { type: 'LineString', coordinates: [...] }
// 만 있는 파일). 실제 공개 GeoJSON 파일로 발견된 케이스.
test('parseRouteFile + extractRoutePaths: 순수 Geometry(래핑 없는 LineString)도 후보로 인식', () => {
  const bareLineString = JSON.stringify({ type: 'LineString', coordinates: [[126.79, 37.5583], [127.4, 37.0], [128.9382, 35.1795]] })
  const parsed = parseRouteFile('bare.geojson', bareLineString)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].coords.length, 3)
})

// KML <MultiGeometry>는 togeojson을 거치면 GeoJSON GeometryCollection(.geometries[])이
// 된다 — 실제 공개 KML(여러 LineString을 하나로 묶은 파일)로 발견된 케이스.
test('extractRoutePaths: 같은 라벨의 후보가 여러 개면 번호를 붙여 구분', () => {
  const geojson = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: 'MultiGeometry' },
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'LineString', coordinates: [[126.1, 37.1], [126.2, 37.2]] },
          { type: 'LineString', coordinates: [[127.1, 36.1], [127.2, 36.2]] },
          { type: 'LineString', coordinates: [[128.1, 35.1], [128.2, 35.2]] },
        ],
      },
    }],
  })
  const parsed = parseRouteFile('dup-labels.geojson', geojson)
  const candidates = paths(parsed)
  assert.deepEqual(candidates.map((c) => c.label), ['MultiGeometry (1)', 'MultiGeometry (2)', 'MultiGeometry (3)'])
})

test('parseRouteFile + extractRoutePaths: GeometryCollection 안의 LineString들도 각각 후보로 인식', () => {
  const geojson = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: '선착장' },
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'LineString', coordinates: [[126.1, 37.1], [126.2, 37.2]] },
          { type: 'LineString', coordinates: [[127.1, 36.1], [127.2, 36.2]] },
        ],
      },
    }],
  })
  const parsed = parseRouteFile('multi.geojson', geojson)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 2)
  assert.ok(candidates.every((c) => c.kind === 'route' && c.coords.length === 2))
})

test('parseRouteFile + extractRoutePaths: 래핑 없는 Feature(FeatureCollection 아님)도 후보로 인식', () => {
  const bareFeature = JSON.stringify({
    type: 'Feature',
    properties: { name: '단일 Feature' },
    geometry: { type: 'LineString', coordinates: [[126.79, 37.5583], [127.4, 37.0]] },
  })
  const parsed = parseRouteFile('bare-feature.geojson', bareFeature)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].label, '단일 Feature')
})

const GPX_ROUTE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>RKSS-RKPK VFR sample</name>
    <rtept lat="37.5583" lon="126.7906"><name>RKSS</name></rtept>
    <rtept lat="37.0000" lon="127.4000"><name>WP1</name></rtept>
    <rtept lat="35.1795" lon="128.9382"><name>RKPK</name></rtept>
  </rte>
</gpx>`

const GPX_TRACK = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>실제 비행 궤적</name>
    <trkseg>
      <trkpt lat="37.5583" lon="126.7906"></trkpt>
      <trkpt lat="37.4000" lon="127.0000"></trkpt>
      <trkpt lat="35.1795" lon="128.9382"></trkpt>
    </trkseg>
  </trk>
</gpx>`

test('extractRoutePaths: GPX rte는 kind=route', () => {
  const parsed = parseRouteFile('route.gpx', GPX_ROUTE)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSS-RKPK VFR sample')
  assert.equal(candidates[0].coords.length, 3)
  assert.deepEqual(candidates[0].coords[0], [126.7906, 37.5583]) // [lon, lat] 순서로 정규화
})

test('extractRoutePaths: GPX rtept의 <name>을 좌표와 나란한 배열로 보존', () => {
  // 실제 EFB(ForeFlight/SkyDemon)가 내보내는 GPX route는 각 rtept에 픽스/공항 이름이
  // 실려 있다 — 이걸 버리면 "WP2"처럼 뭉개져서 원래 경로의 정보가 사라진다.
  const parsed = parseRouteFile('route.gpx', GPX_ROUTE)
  const candidates = paths(parsed)
  assert.deepEqual(candidates[0].names, ['RKSS', 'WP1', 'RKPK'])
})

test('extractRoutePaths: rtept에 <name>이 없으면 해당 자리는 null', () => {
  const gpxNoNames = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>이름 없는 경로</name>
    <rtept lat="37.0" lon="127.0"></rtept>
    <rtept lat="36.0" lon="128.0"></rtept>
  </rte>
</gpx>`
  const parsed = parseRouteFile('no-names.gpx', gpxNoNames)
  const candidates = paths(parsed)
  assert.deepEqual(candidates[0].names, [null, null])
})

test('extractRoutePaths: GPX trk는 kind=track', () => {
  const parsed = parseRouteFile('track.gpx', GPX_TRACK)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'track')
  assert.equal(candidates[0].label, '실제 비행 궤적')
  assert.equal(candidates[0].coords.length, 3)
})

test('extractRoutePaths: rte와 trk가 둘 다 있으면 후보 2개', () => {
  const combined = GPX_ROUTE.replace('</gpx>', '') + GPX_TRACK.replace(/^<\?xml[^>]*>\s*<gpx[^>]*>/, '')
  const parsed = parseRouteFile('both.gpx', combined)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 2)
  assert.deepEqual(candidates.map((c) => c.kind).sort(), ['route', 'track'])
})

const KML_LINE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>RKSS-RKPK VFR sample</name>
    <Placemark>
      <name>RKSS-RKPK</name>
      <LineString>
        <coordinates>
          126.7906,37.5583,0
          127.4000,37.0000,0
          128.9382,35.1795,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`

test('simplifyRoute: 조밀한 입력을 20개 이하로 줄이고 첫·끝 점을 보존', () => {
  const dense = Array.from({ length: 500 }, (_, i) => [126.5 + i * 0.01, 36.0 + i * 0.002])
  const simplified = simplifyRoute(dense, 20)
  assert.ok(simplified.length <= 20, `expected <=20, got ${simplified.length}`)
  assert.ok(simplified.length >= 2)
  assert.deepEqual(simplified[0], dense[0])
  assert.deepEqual(simplified[simplified.length - 1], dense[dense.length - 1])
})

test('simplifyRoute: 이미 목표보다 적으면 그대로 반환', () => {
  const coords = [[126.79, 37.5583], [127.4, 37.0], [128.9382, 35.1795]]
  assert.deepEqual(simplifyRoute(coords, 20), coords)
})

test('snapEndpointsToAirports: 임계 안이면 스냅', () => {
  const airports = [
    { icao: 'RKSS', lon: 126.7906, lat: 37.5583 },
    { icao: 'RKPK', lon: 128.9382, lat: 35.1795 },
  ]
  const coords = [[126.79, 37.558], [127.4, 37.0], [128.94, 35.18]]
  const { departureAirport, arrivalAirport } = snapEndpointsToAirports(coords, airports, 5)
  assert.equal(departureAirport, 'RKSS')
  assert.equal(arrivalAirport, 'RKPK')
})

test('snapEndpointsToAirports: 임계 밖이면 null(폴백)', () => {
  const airports = [{ icao: 'RKSS', lon: 126.7906, lat: 37.5583 }]
  const coords = [[130.0, 40.0], [131.0, 41.0]] // 멀리 떨어진 좌표
  const { departureAirport, arrivalAirport } = snapEndpointsToAirports(coords, airports, 5)
  assert.equal(departureAirport, null)
  assert.equal(arrivalAirport, null)
})

test('isWithinKoreaFir: 경계 안/밖 판정', () => {
  assert.equal(isWithinKoreaFir(127.5, 36.5), true)
  assert.equal(isWithinKoreaFir(0, 0), false)
  assert.equal(isWithinKoreaFir(150, 50), false)
})

test('extractRoutePaths: KML LineString은 kind=route', () => {
  const parsed = parseRouteFile('route.kml', KML_LINE)
  const candidates = paths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSS-RKPK')
  assert.equal(candidates[0].coords.length, 3)
  // togeojson은 KML의 3차원 좌표(lon,lat,alt)를 그대로 보존한다. 다운스트림은
  // 전부 [lon, lat] 구조분해라 3번째 값(고도)은 자연히 무시됨 — 파일 고도값
  // 무시(스펙 §1) 계약과 일치하므로 앞 두 값만 검증한다.
  assert.equal(candidates[0].coords[0][0], 126.7906)
  assert.equal(candidates[0].coords[0][1], 37.5583)
})

test('parseRouteFile + extractRoutePaths: FPL은 route-point 순서대로 후보 1개', () => {
  const parsed = parseRouteFile('plan.fpl', FPL_TEXT)
  assert.equal(parsed.format, 'fpl')
  const candidates = paths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSI RKPK')
  assert.deepEqual(candidates[0].coords, [[126.4505, 37.4691], [127.2, 36.8], [128.9382, 35.1795]])
  assert.deepEqual(candidates[0].names, ['RKSI', 'GONAX', 'RKPK'])
  assert.deepEqual(candidates[0].types, ['AIRPORT', 'INT', 'AIRPORT'])
})

test('extractRoutePaths: FPL route-point가 waypoint-table에 없으면 그 지점만 건너뛴다', () => {
  const text = FPL_TEXT.replace('<waypoint-identifier>GONAX</waypoint-identifier>', '<waypoint-identifier>NOPE</waypoint-identifier>')
  const candidates = paths(parseRouteFile('plan.fpl', text))
  assert.equal(candidates[0].coords.length, 2)
  assert.deepEqual(candidates[0].names, ['RKSI', 'RKPK'])
})

test('extractRoutePaths: 다른 형식의 후보는 types가 전부 null', () => {
  const candidates = paths(parseRouteFile('route.geojson', GEOJSON_LINE))
  assert.deepEqual(candidates[0].types, [null, null, null])
})

test('extractRoutePaths: 위경도 범위를 벗어난 점은 버리고 droppedCount에 센다', () => {
  const text = JSON.stringify({
    type: 'LineString',
    coordinates: [[126.79, 37.55], [999, 37.0], [128.93, 35.17]],
  })
  const { candidates, droppedTotal } = extractRoutePaths(parseRouteFile('bad.geojson', text))
  assert.equal(droppedTotal, 1)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].coords.length, 2)
  assert.equal(candidates[0].droppedCount, 1)
})

test('extractRoutePaths: 전부 범위 밖이면 후보 없음 + droppedTotal로 구분 가능', () => {
  const text = JSON.stringify({ type: 'LineString', coordinates: [[999, 999], [888, 888]] })
  const { candidates, droppedTotal } = extractRoutePaths(parseRouteFile('bad.geojson', text))
  assert.equal(candidates.length, 0)
  assert.equal(droppedTotal, 2)
})

test('extractRoutePaths: 점이 부족하면 후보 없음, droppedTotal은 0', () => {
  const text = JSON.stringify({ type: 'LineString', coordinates: [[126.79, 37.55]] })
  const { candidates, droppedTotal } = extractRoutePaths(parseRouteFile('short.geojson', text))
  assert.equal(candidates.length, 0)
  assert.equal(droppedTotal, 0)
})

test('extractRoutePaths: GPX rtept의 범위 밖 좌표도 후보의 droppedCount에 센다', () => {
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>범위 밖 포함</name>
    <rtept lat="37.0" lon="127.0"></rtept>
    <rtept lat="91.0" lon="127.5"></rtept>
    <rtept lat="36.0" lon="128.0"></rtept>
  </rte>
</gpx>`
  const { candidates, droppedTotal } = extractRoutePaths(parseRouteFile('bad.gpx', gpx))
  assert.equal(droppedTotal, 1)
  assert.equal(candidates[0].coords.length, 2)
  assert.equal(candidates[0].droppedCount, 1)
})

test('MAX_IMPORT_BYTES는 10MB', () => {
  assert.equal(MAX_IMPORT_BYTES, 10 * 1024 * 1024)
})
