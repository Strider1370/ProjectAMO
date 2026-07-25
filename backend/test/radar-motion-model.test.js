import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MOTION_MODEL_DEFAULTS, annotateNeighbourAgreement, cellKm, deriveMotionField, motionVectorsToGeoJSON,
  searchRadiusCells, selectLeadingEdge,
} from '../src/processors/radar-motion-model.js'

// 매끈한 덩어리 몇 개를 놓고 통째로 옮긴 장을 만든다.
function fieldShifted(width, height, offsetX, offsetY) {
  const values = new Int16Array(width * height)
  const blobs = [
    { cx: 30, cy: 30, r: 9, peak: 5000 },
    { cx: 60, cy: 45, r: 11, peak: 6000 },
    { cx: 45, cy: 70, r: 8, peak: 4500 },
    { cx: 75, cy: 75, r: 10, peak: 5500 },
  ]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 0
      for (const b of blobs) {
        const d2 = (x - offsetX - b.cx) ** 2 + (y - offsetY - b.cy) ** 2
        v += b.peak * Math.exp(-d2 / (2 * b.r * b.r))
      }
      values[y * width + x] = Math.round(v)
    }
  }
  return { width, height, stride: 4, values }
}

const BASE = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: 4, patchRadiusKm: 12, spacingKm: 8,
  maxSpeedKmh: 100, frameIntervalMs: 300000, minReflectivity: 500,
}

test('cellKm은 작업 격자 한 칸의 km를 준다', () => {
  assert.equal(cellKm({ ...BASE, workStride: 4 }), 2)
  assert.equal(cellKm({ ...BASE, workStride: 2 }), 1)
})

test('탐색 반경은 최대속도와 프레임 간격에서 나온다', () => {
  // 100 km/h로 5분이면 8.33 km. 2 km 칸이면 5칸(올림).
  assert.equal(searchRadiusCells(BASE), 5)
})

test('벡터장은 과반이 참 변위를 되찾는다', () => {
  const field = deriveMotionField(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3, -2), BASE)
  assert.ok(field.length > 0, '벡터가 하나도 없으면 안 된다')
  // 하나라도 맞으면 통과하는 약한 단언을 쓰지 않는다.
  const close = field.filter((v) => v.dx === 3 && v.dy === -2)
  assert.ok(close.length / field.length > 0.7, `참 변위 일치 ${close.length}/${field.length}`)
})

test('변위는 정수 칸이다 — 소수점 보정은 보류 항목이다', () => {
  const field = deriveMotionField(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3, -2), BASE)
  assert.ok(field.every((v) => Number.isInteger(v.dx) && Number.isInteger(v.dy)))
})

test('matchScore는 낮을수록 좋다 — 동일 장은 0에 가깝다', () => {
  const same = fieldShifted(120, 120, 0, 0)
  const field = deriveMotionField(same, same, BASE)
  assert.ok(field.length > 0)
  assert.ok(field.every((v) => v.matchScore < 1), `최대 ${Math.max(...field.map((v) => v.matchScore))}`)

  // 정수 칸 이동은 최적 오프셋에서 항상 matchScore 0을 내어(라운딩 잔차가 없어)
  // 정규화 누락(sum/n 대신 sum)을 못 잡는다. 소수점 이동으로 잔차를 남겨 규모를 고정한다.
  // 실측: half=6(패치 13x13=169칸)에서 최대 약 111. sum만 반환하면 169배(약 18700)로 뛴다.
  const noisy = deriveMotionField(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3.4, -2.4), BASE)
  assert.ok(noisy.length > 0)
  assert.ok(noisy.every((v) => v.matchScore < 200), `최대 ${Math.max(...noisy.map((v) => v.matchScore))}`)
})

test('에코가 없는 곳에는 벡터를 만들지 않는다', () => {
  const empty = { width: 120, height: 120, stride: 4, values: new Int16Array(14400) }
  assert.deepEqual(deriveMotionField(empty, empty, BASE), [])
})

test('마감시한이 지났으면 루프 안에서 포기하고 빈 배열을 준다', () => {
  // 픽스처 생성은 측정 구간 밖에서 한다 — 안에 두면 기기 속도를 재는 셈이 된다.
  const prev = fieldShifted(120, 120, 0, 0)
  const curr = fieldShifted(120, 120, 3, -2)
  const started = Date.now()
  const field = deriveMotionField(prev, curr, BASE, Date.now() - 1)
  assert.deepEqual(field, [])
  // 20ms: 조기 포기 경로는 이 구간에 호출 한 번만 있어 0ms에 가깝고, 다 계산한
  // 뒤 버리는 경로는 약 35~56ms다. 100ms는 둘을 구분하지 못해 무력화됐었다.
  assert.ok(Date.now() - started < 20, '전부 계산한 뒤 버리면 안 된다')
})

test('이웃 일치도는 튀는 벡터를 낮게 매기고 값은 바꾸지 않는다', () => {
  const vectors = []
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) vectors.push({ col: col * 4, row: row * 4, dx: 3, dy: -2, matchScore: 100 })
  }
  const rogue = vectors.find((v) => v.col === 8 && v.row === 8)
  rogue.dx = -7
  rogue.dy = 6

  const annotated = annotateNeighbourAgreement(vectors, { ...BASE, spacingKm: 8 })
  const odd = annotated.find((v) => v.col === 8 && v.row === 8)
  const normal = annotated.find((v) => v.col === 4 && v.row === 4)

  assert.equal(odd.dx, -7, '평활화는 보류 항목 — 값을 바꾸면 안 된다')
  assert.equal(odd.dy, 6)
  assert.ok(odd.neighbourAgreement < 0.5, `튀는 벡터 일치도 ${odd.neighbourAgreement}`)
  assert.ok(normal.neighbourAgreement > 0.8, `정상 벡터 일치도 ${normal.neighbourAgreement}`)
  assert.ok(annotated.every((v) => v.neighbourAgreement >= 0 && v.neighbourAgreement <= 1))
})

const EDGE = { ...BASE, edgeLookaheadKm: 6, minReflectivity: 2000, minSpeedKt: 3, spacingKm: 8, patchRadiusKm: 12 }

// 왼쪽 절반만 에코인 장. 동쪽(+x)으로 움직이면 오른쪽 경계가 앞면이다.
function halfField() {
  const width = 40, height = 20
  const values = new Int16Array(width * height)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < 20; col += 1) values[row * width + col] = 5000
  }
  return { width, height, stride: 4, values }
}

test('앞면만 남기고 에코 내부와 후면은 버린다', () => {
  const current = halfField()
  const mk = (col) => ({ col, row: 10, dx: 2, dy: 0, matchScore: 0.9, neighbourAgreement: 1 })
  const kept = selectLeadingEdge([mk(5), mk(19), mk(10)], current, EDGE)
  assert.deepEqual(kept.map((v) => v.col), [19])
})

test('최소 속도 미만은 앞면 판정에서 제외한다', () => {
  const current = halfField()
  // 2km 칸, 5분 → 1칸이 약 12.9 kt. 0.2칸은 약 2.6 kt로 3 kt 미만이다.
  const slow = { col: 19, row: 10, dx: 0.2, dy: 0, matchScore: 0.9, neighbourAgreement: 1 }
  assert.deepEqual(selectLeadingEdge([slow], current, EDGE), [])
})

// 위쪽 절반만 에코인 장. dx만 쓰는 구현(row = v.row)이면 셋 다 안쪽으로 남아 걸러진다.
function halfFieldVertical() {
  const width = 20, height = 40
  const values = new Int16Array(width * height)
  for (let row = 0; row < 20; row += 1) {
    for (let col = 0; col < width; col += 1) values[row * width + col] = 5000
  }
  return { width, height, stride: 4, values }
}

test('dy로 움직이는 벡터도 앞면 판정에 dy를 쓴다', () => {
  const current = halfFieldVertical()
  const mk = (row) => ({ col: 10, row, dx: 0, dy: 2, matchScore: 0.9, neighbourAgreement: 1 })
  const kept = selectLeadingEdge([mk(5), mk(19), mk(10)], current, EDGE)
  assert.deepEqual(kept.map((v) => v.row), [19])
})

test('격자 밖을 내다보는 벡터는 앞면으로 치지 않는다', () => {
  const current = halfField()
  // col 39는 오른쪽 끝. 3칸 앞은 격자 밖이다 — 에코 없음으로 오인하면 안 된다.
  const atEdge = { col: 39, row: 10, dx: 2, dy: 0, matchScore: 0.9, neighbourAgreement: 1 }
  assert.deepEqual(selectLeadingEdge([atEdge], current, EDGE), [])
})

// gridToLatLon 실측(radar-echo-parser.js): +x 동쪽, +y 북쪽. 남쪽이 아니다 —
// 이 스텁을 뒤집으면 화살표가 전부 180도 돌아간다.
const stubGridToLatLon = (x, y) => ({ lon: 126 + x * 0.001, lat: 38 + y * 0.001 })

test('GeoJSON은 Point와 방위·속도를 낸다', () => {
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 3, dy: 0, matchScore: 0.812, neighbourAgreement: 0.875 }],
    { gridToLatLon: stubGridToLatLon, workStride: 4, frameIntervalMs: 300000 },
  )
  assert.equal(geojson.type, 'FeatureCollection')
  const f = geojson.features[0]
  assert.equal(f.geometry.type, 'Point')
  assert.ok(Math.abs(f.properties.bearingDeg - 90) < 2, `동쪽이어야 하는데 ${f.properties.bearingDeg}`)
  assert.equal(f.properties.speedKt, 39) // 3칸 × 2km ÷ (5/60)h ÷ 1.852 = 38.9
  assert.equal(f.properties.matchScore, 0.81)
  assert.equal(f.properties.neighbourAgreement, 0.88)
})

test('북쪽으로 가는 벡터는 방위 0/360 근처를 낸다', () => {
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 0, dy: 3, matchScore: 0.8, neighbourAgreement: 0.8 }],
    { gridToLatLon: stubGridToLatLon, workStride: 4, frameIntervalMs: 300000 },
  )
  const bearing = geojson.features[0].properties.bearingDeg
  assert.ok(Math.min(bearing, 360 - bearing) < 2, `북쪽이어야 하는데 ${bearing}`)
})

test('좌표를 못 구하는 벡터는 조용히 버린다', () => {
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 3, dy: 0, matchScore: 0.5, neighbourAgreement: 0.5 }],
    { gridToLatLon: () => ({ lon: NaN, lat: NaN }), workStride: 4, frameIntervalMs: 300000 },
  )
  assert.deepEqual(geojson.features, [])
})
