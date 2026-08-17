import test from 'node:test'
import assert from 'node:assert/strict'
import {
  destination, sweepDeg, arcPoints, circleRing, sectorRing,
  arrowPath, initialBearing, greatCircleNm, corridorRing, averageBearing, rebuild,
  translateGen, anchorOf,
} from './shapeBuilders.js'

const RKSI = [126.451, 37.469]
const near = (a, b, tol) => Math.abs(a - b) <= tol

// --- 기본 계산 ---

test('북쪽으로 60해리 가면 위도가 1도 오른다', () => {
  const [lng, lat] = destination(RKSI, 0, 60)
  assert.ok(near(lat, 37.469 + 1, 0.01), `위도 ${lat}`)
  assert.ok(near(lng, 126.451, 0.001), `경도 ${lng}`)
})

test('간 만큼 거리가 나온다', () => {
  for (const b of [0, 45, 90, 180, 270, 359]) {
    assert.ok(near(greatCircleNm(RKSI, destination(RKSI, b, 5)), 5, 0.001), `방위 ${b}`)
  }
})

test('간 방향이 방위와 같다', () => {
  for (const b of [0, 45, 90, 180, 270]) {
    const got = initialBearing(RKSI, destination(RKSI, b, 5))
    assert.ok(near((got - b + 540) % 360 - 180, 0, 0.1), `방위 ${b} → ${got}`)
  }
})

test('날짜변경선을 넘어도 경도가 범위 안에 있다', () => {
  const [lng] = destination([179.9, 0], 90, 60)
  assert.ok(lng >= -180 && lng <= 180, `경도 ${lng}`)
  assert.ok(lng < 0, '넘어갔으면 음수여야 한다')
})

// --- 각도 규칙: 공역 고시문과 같아야 한다 ---

test('270도에서 090도는 북쪽을 지나 180도', () => {
  assert.equal(sweepDeg(270, 90), 180)
})

test('090도에서 270도도 180도 (남쪽을 지나서)', () => {
  assert.equal(sweepDeg(90, 270), 180)
})

test('시작과 끝이 같으면 한 바퀴로 본다', () => {
  assert.equal(sweepDeg(120, 120), 360)
})

// --- 원 ---

test('원은 닫혀 있고 모든 점이 반경만큼 떨어져 있다', () => {
  const ring = circleRing(RKSI, 5)
  assert.deepEqual(ring[0], ring[ring.length - 1])
  for (const p of ring) assert.ok(near(greatCircleNm(RKSI, p), 5, 0.01))
})

test('반경이 커지면 점도 그만큼 멀어진다', () => {
  assert.ok(near(greatCircleNm(RKSI, circleRing(RKSI, 20)[0]), 20, 0.01))
})

// --- 호 ---

test('호는 시작방위와 끝방위에서 시작하고 끝난다', () => {
  const pts = arcPoints(RKSI, 5, 270, 90)
  assert.ok(near(initialBearing(RKSI, pts[0]), 270, 0.2))
  assert.ok(near(initialBearing(RKSI, pts[pts.length - 1]), 90, 0.2))
})

test('호는 북쪽을 지난다 (270→090)', () => {
  const pts = arcPoints(RKSI, 5, 270, 90)
  const mid = pts[Math.floor(pts.length / 2)]
  assert.ok(near(initialBearing(RKSI, mid), 0, 1), '중간이 북쪽이어야 한다')
})

test('호는 닫히지 않는다', () => {
  const pts = arcPoints(RKSI, 5, 270, 90)
  assert.notDeepEqual(pts[0], pts[pts.length - 1])
})

// --- 섹터 ---

test('섹터는 중심에서 시작해 중심으로 닫힌다', () => {
  const ring = sectorRing(RKSI, 5, 270, 90)
  assert.deepEqual(ring[0], RKSI)
  assert.deepEqual(ring[ring.length - 1], RKSI)
})

// 한 바퀴짜리 섹터에 중심을 끼우면 원에 중심까지 갔다 오는 흠집이 생긴다.
test('한 바퀴 섹터는 그냥 원이다', () => {
  const ring = sectorRing(RKSI, 5, 120, 120)
  assert.ok(!ring.some((p) => p[0] === RKSI[0] && p[1] === RKSI[1]), '중심이 끼면 안 된다')
})

// --- 화살표 ---

test('화살표는 몸통과 촉을 한 붓으로 그린다', () => {
  const to = destination(RKSI, 90, 10)
  const path = arrowPath(RKSI, to)
  assert.equal(path.length, 5)
  assert.deepEqual(path[0], RKSI)
  assert.deepEqual(path[1], to)
  assert.deepEqual(path[3], to, '촉을 그리려면 끝점을 되짚어야 한다')
})

test('촉은 끝점 근처에 있고 뒤를 향한다', () => {
  const to = destination(RKSI, 90, 10)
  const [, , left, , right] = arrowPath(RKSI, to)
  for (const barb of [left, right]) {
    assert.ok(greatCircleNm(to, barb) < 3, '촉이 너무 길다')
    assert.ok(greatCircleNm(RKSI, barb) < 10, '촉이 앞으로 뻗으면 안 된다')
  }
})

// --- 회랑 ---

test('회랑은 중심선 좌우로 폭의 절반씩 벌어진다', () => {
  const line = [RKSI, destination(RKSI, 90, 20)]
  const ring = corridorRing(line, 4)
  // 첫 점(왼쪽)과 마지막 직전 점(오른쪽 끝에서 되돌아온 것)이 중심선에서 2NM
  assert.ok(near(greatCircleNm(RKSI, ring[0]), 2, 0.01), `${greatCircleNm(RKSI, ring[0])}`)
})

test('회랑은 닫힌 링이다', () => {
  const ring = corridorRing([RKSI, destination(RKSI, 90, 20)], 4)
  assert.deepEqual(ring[0], ring[ring.length - 1])
})

test('폭이 0이거나 점이 하나면 만들지 않는다', () => {
  assert.equal(corridorRing([RKSI], 4), null)
  assert.equal(corridorRing([RKSI, destination(RKSI, 90, 5)], 0), null)
  assert.equal(corridorRing(null, 4), null)
})

// 350도와 010도의 평균은 000도지 180도가 아니다. 이걸 틀리면 북쪽을 지나는
// 꺾임에서 회랑이 통째로 뒤집힌다.
test('방위 평균이 북쪽을 넘어가도 맞다', () => {
  assert.ok(near(averageBearing(350, 10), 0, 0.01))
  assert.ok(near(averageBearing(10, 350), 0, 0.01))
  assert.ok(near(averageBearing(80, 100), 90, 0.01))
})

test('정반대 방위는 앞 구간을 따른다', () => {
  assert.equal(averageBearing(90, 270), 90)
})

// --- rebuild ---

test('원과 섹터는 면, 호와 화살표는 선이 된다', () => {
  assert.equal(rebuild({ type: 'circle', center: RKSI, radiusNm: 5 }).type, 'Polygon')
  assert.equal(rebuild({ type: 'sector', center: RKSI, radiusNm: 5, fromDeg: 270, toDeg: 90 }).type, 'Polygon')
  assert.equal(rebuild({ type: 'arc', center: RKSI, radiusNm: 5, fromDeg: 270, toDeg: 90 }).type, 'LineString')
  assert.equal(rebuild({ type: 'arrow', from: RKSI, to: destination(RKSI, 90, 5) }).type, 'LineString')
  assert.equal(rebuild({ type: 'corridor', centerline: [RKSI, destination(RKSI, 90, 10)], widthNm: 4 }).type, 'Polygon')
})

test('값이 모자라면 만들지 않는다', () => {
  assert.equal(rebuild(null), null)
  assert.equal(rebuild({ type: '없는것' }), null)
  assert.equal(rebuild({ type: 'circle', center: RKSI, radiusNm: 0 }), null)
  assert.equal(rebuild({ type: 'arrow', from: RKSI }), null)
})

// 공역 고시문의 radial은 대개 자북 기준이다. 한국은 서편차 약 −8°라, 이걸 빼먹으면
// 5NM 호에서 0.7NM이 어긋난다.
test('자북 기준이면 자편각만큼 돌아간다', () => {
  const gen = { type: 'arc', center: RKSI, radiusNm: 5, fromDeg: 90, toDeg: 180, magnetic: true }
  const trueBearing = initialBearing(RKSI, rebuild(gen, -8).coordinates[0])
  assert.ok(near(trueBearing, 82, 0.2), `진북 방위 ${trueBearing}`)
})

test('진북 기준이면 자편각을 무시한다', () => {
  const gen = { type: 'arc', center: RKSI, radiusNm: 5, fromDeg: 90, toDeg: 180, magnetic: false }
  assert.ok(near(initialBearing(RKSI, rebuild(gen, -8).coordinates[0]), 90, 0.2))
})

// --- 정의 옮기기 ---

// 도형을 끌어 옮겼는데 정의가 제자리에 남으면, 반경을 고치는 순간 원래 자리로 튄다.
test('원을 옮기면 중심도 옮겨진다', () => {
  const moved = translateGen({ type: 'circle', center: RKSI, radiusNm: 5 }, 1, -0.5)
  assert.deepEqual(moved.center, [RKSI[0] + 1, RKSI[1] - 0.5])
})

test('화살표는 시작점과 끝점이 함께 옮겨진다', () => {
  const to = destination(RKSI, 90, 10)
  const moved = translateGen({ type: 'arrow', from: RKSI, to }, 2, 0)
  assert.deepEqual(moved.from, [RKSI[0] + 2, RKSI[1]])
  assert.deepEqual(moved.to, [to[0] + 2, to[1]])
})

test('회랑은 중심선 전체가 옮겨진다', () => {
  const line = [RKSI, destination(RKSI, 90, 10)]
  const moved = translateGen({ type: 'corridor', centerline: line, widthNm: 4 }, 0, 1)
  assert.equal(moved.centerline.length, 2)
  for (let i = 0; i < 2; i += 1) assert.ok(near(moved.centerline[i][1], line[i][1] + 1, 1e-9))
})

test('옮겨도 크기는 그대로다', () => {
  const gen = { type: 'circle', center: RKSI, radiusNm: 5 }
  const moved = translateGen(gen, 1, 1)
  assert.equal(moved.radiusNm, 5)
  assert.ok(near(greatCircleNm(moved.center, rebuild(moved).coordinates[0][0]), 5, 0.01))
})

test('원본을 건드리지 않는다', () => {
  const gen = { type: 'circle', center: RKSI, radiusNm: 5 }
  translateGen(gen, 1, 1)
  assert.deepEqual(gen.center, RKSI)
})

test('기준점은 종류에 맞게 나온다', () => {
  assert.deepEqual(anchorOf({ type: 'circle', center: RKSI }), RKSI)
  assert.deepEqual(anchorOf({ type: 'arrow', from: RKSI, to: [1, 1] }), RKSI)
  assert.deepEqual(anchorOf({ type: 'corridor', centerline: [RKSI, [1, 1]] }), RKSI)
  assert.equal(anchorOf(null), null)
})

// 2도(180각형)에서 5도(72각형)로 줄였다. 눈에 안 보이는 차이여야 한다.
test('원은 72각형이고 실제 원과의 어긋남이 반경의 0.1% 아래다', () => {
  const ring = circleRing(RKSI, 20)
  assert.equal(ring.length, 73)
  // 이웃한 두 점의 중점이 실제 원보다 얼마나 안쪽으로 들어오는가
  const mid = [(ring[0][0] + ring[1][0]) / 2, (ring[0][1] + ring[1][1]) / 2]
  const err = 20 - greatCircleNm(RKSI, mid)
  assert.ok(err / 20 < 0.001, `어긋남 ${(err / 20 * 100).toFixed(3)}%`)
})
