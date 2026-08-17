// 숫자로 정의되는 도형들 — 원·호·섹터·화살표·회랑.
//
// 손으로 찍는 점·선·면과 성격이 다르다. 이것들은 "중심 · 반경 5NM · 방위 270°에서
// 090°"처럼 값으로 정의되고, 값이 바뀌면 도형을 다시 만든다. 그래서 꼭짓점을 끌어
// 고치는 것이 아니라 숫자를 고친다.
//
// 공역 고시문이 실제로 이 꼴이다. 구글어스에는 원 도구조차 없어서 맥케이 작성자는
// 관제권을 다각형으로 손수 근사했다.
//
// 새 라이브러리를 넣지 않는다. @turf/destination과 @turf/buffer가 없지만, 우리가
// 필요한 것은 구면 삼각법 몇 줄과 수직 밀어내기뿐이다.

// 지구 평균 반지름(해리). 항공 거리는 전부 해리로 다룬다.
const R_NM = 3440.065

// 호를 몇 도마다 끊을 것인가. 원 하나가 72각형이 된다.
//
// 2도(180각형)로 시작했다가 5도로 줄였다. 눈에 보이는 차이는 없다 — 5도에서
// 실제 원과의 최대 어긋남은 반경의 0.024%로, 반경 20NM에서 9m다. 대신 좌표가
// 절반 이하로 줄어 파일과 화면이 가벼워진다.
const STEP_DEG = 5
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

/**
 * 시작점에서 방위(진북 기준)로 거리만큼 간 지점. 대권 기준.
 * @param {[number,number]} from [lng, lat]
 * @param {number} bearingDeg 진북 기준 방위
 * @param {number} distNm 해리
 */
export function destination(from, bearingDeg, distNm) {
  const [lng, lat] = from
  const d = distNm / R_NM
  const t = rad(bearingDeg)
  const p1 = rad(lat)
  const l1 = rad(lng)
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t))
  const l2 = l1 + Math.atan2(
    Math.sin(t) * Math.sin(d) * Math.cos(p1),
    Math.cos(d) - Math.sin(p1) * Math.sin(p2),
  )
  // 날짜변경선을 넘어가도 -180~180 안에 들어오게 접는다.
  return [((deg(l2) + 540) % 360) - 180, deg(p2)]
}

/**
 * 시작방위에서 끝방위까지 시계방향으로 몇 도인가.
 * 270°→090°은 180°다(북쪽을 지나서). 이 방향 규칙이 공역 고시문과 같다.
 */
export function sweepDeg(fromDeg, toDeg) {
  const s = ((toDeg - fromDeg) % 360 + 360) % 360
  // 시작과 끝이 같으면 한 바퀴로 본다 — 0도짜리 호는 그릴 것이 없다.
  return s === 0 ? 360 : s
}

/** 호 위의 점들. 시작방위에서 끝방위까지 시계방향. */
export function arcPoints(center, radiusNm, fromDeg, toDeg, stepDeg = STEP_DEG) {
  const sweep = sweepDeg(fromDeg, toDeg)
  const n = Math.max(2, Math.ceil(sweep / stepDeg))
  return Array.from({ length: n + 1 }, (_, i) => destination(center, fromDeg + (sweep * i) / n, radiusNm))
}

/** 원 — 닫힌 링. */
export function circleRing(center, radiusNm, stepDeg = STEP_DEG) {
  const pts = arcPoints(center, radiusNm, 0, 360, stepDeg)
  // arcPoints는 360도에서 첫 점과 끝 점이 같은 자리로 돌아온다 — 이미 닫혀 있다.
  return pts
}

/** 섹터 — 파이 조각. 중심 → 호 → 중심으로 닫는다. */
export function sectorRing(center, radiusNm, fromDeg, toDeg, stepDeg = STEP_DEG) {
  const arc = arcPoints(center, radiusNm, fromDeg, toDeg, stepDeg)
  // 한 바퀴짜리 섹터는 그냥 원이다. 중심을 끼우면 원에 흠집이 생긴다.
  if (sweepDeg(fromDeg, toDeg) === 360) return arc
  return [center, ...arc, center]
}

/**
 * 화살표 — 몸통과 화살촉을 한 붓으로 그린다.
 *
 * 선 하나로 만드는 이유: KML에는 화살촉이라는 것이 없다. 촉을 별도 도형으로 두면
 * 도형이 둘로 늘고 색·굵기를 따로 관리해야 한다. 되짚어 그리면 하나로 끝난다.
 */
export function arrowPath(from, to, headNm = null) {
  const b = initialBearing(from, to)
  const dist = greatCircleNm(from, to)
  const head = headNm ?? Math.max(0.2, Math.min(dist * 0.2, 3))
  const back = (b + 180) % 360
  const left = destination(to, (back - 25 + 360) % 360, head)
  const right = destination(to, (back + 25) % 360, head)
  return [from, to, left, to, right]
}

/** a→b 초기 대권 방위(진북 0~360). geo.js에도 같은 것이 있으나 여기는 turf 없이 쓴다. */
export function initialBearing(a, b) {
  const p1 = rad(a[1])
  const p2 = rad(b[1])
  const dl = rad(b[0] - a[0])
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** 두 점 대권 거리(해리). */
export function greatCircleNm(a, b) {
  const p1 = rad(a[1])
  const p2 = rad(b[1])
  const dp = p2 - p1
  const dl = rad(b[0] - a[0])
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * 회랑 — 중심선 좌우로 폭의 절반씩 밀어낸 띠.
 *
 * ponytail: 꺾이는 지점에서 앞뒤 구간 방위의 평균으로 밀어낸다. 제대로 하려면
 * 두 변의 교점을 구해야 하고(마이터), 급하게 꺾이면 띠가 자기를 파고든다.
 * 항로 회랑은 완만해서 실제로는 드러나지 않는다. 예각이 문제가 되면 그때
 * 마이터로 바꾼다.
 */
export function corridorRing(coords, widthNm) {
  if (!coords || coords.length < 2 || !(widthNm > 0)) return null
  const half = widthNm / 2
  const bearings = coords.slice(0, -1).map((c, i) => initialBearing(c, coords[i + 1]))

  // 각 꼭짓점에서 쓸 방위: 끝점은 자기 구간, 중간점은 앞뒤 평균.
  const at = (i) => {
    if (i === 0) return bearings[0]
    if (i === coords.length - 1) return bearings[bearings.length - 1]
    return averageBearing(bearings[i - 1], bearings[i])
  }

  const left = coords.map((c, i) => destination(c, (at(i) - 90 + 360) % 360, half))
  const right = coords.map((c, i) => destination(c, (at(i) + 90) % 360, half))
  return [...left, ...right.reverse(), left[0]]
}

/** 방위 두 개의 평균. 350°와 010°의 평균은 000°지 180°가 아니다. */
export function averageBearing(a, b) {
  const x = Math.cos(rad(a)) + Math.cos(rad(b))
  const y = Math.sin(rad(a)) + Math.sin(rad(b))
  // 정반대 방향이면 평균이 정해지지 않는다. 되짚어 접히는 선이므로 앞 구간을 따른다.
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return a
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/**
 * 정의를 통째로 옮긴다. 도형을 끌면 중심(또는 시작·끝점, 중심선)도 함께 가야 한다.
 * 안 그러면 화면에서는 옮겨졌는데 정의는 제자리에 남아, 반경을 고치는 순간
 * 도형이 원래 자리로 튀어 돌아간다.
 */
export function translateGen(gen, dLng, dLat) {
  if (!gen) return gen
  const mv = ([lng, lat]) => [lng + dLng, lat + dLat]
  const out = { ...gen }
  if (gen.center) out.center = mv(gen.center)
  if (gen.from) out.from = mv(gen.from)
  if (gen.to) out.to = mv(gen.to)
  if (gen.centerline) out.centerline = gen.centerline.map(mv)
  return out
}

/** 정의의 기준점 — 자편각을 어디서 잴지, 얼마나 옮겼는지를 여기서 본다. */
export function anchorOf(gen) {
  return gen?.center ?? gen?.from ?? gen?.centerline?.[0] ?? null
}

/**
 * 값으로 정의된 도형을 GeoJSON 기하로 만든다.
 *
 * `declDeg`는 자편각(동편차 +). 방위를 자북 기준으로 받았을 때 진북으로 바꾼다 —
 * 공역 고시문의 radial은 대개 자북 기준이고, 한국은 서편차 약 −8°다. 5NM 호에서
 * 8°는 0.7NM이라 무시할 수 없다.
 */
export function rebuild(gen, declDeg = 0) {
  if (!gen) return null
  const toTrue = (d) => (gen.magnetic ? d + declDeg : d)
  switch (gen.type) {
    case 'circle': {
      if (!(gen.radiusNm > 0)) return null
      return { type: 'Polygon', coordinates: [circleRing(gen.center, gen.radiusNm)] }
    }
    case 'arc': {
      if (!(gen.radiusNm > 0)) return null
      return { type: 'LineString', coordinates: arcPoints(gen.center, gen.radiusNm, toTrue(gen.fromDeg), toTrue(gen.toDeg)) }
    }
    case 'sector': {
      if (!(gen.radiusNm > 0)) return null
      return { type: 'Polygon', coordinates: [sectorRing(gen.center, gen.radiusNm, toTrue(gen.fromDeg), toTrue(gen.toDeg))] }
    }
    case 'arrow': {
      if (!gen.from || !gen.to) return null
      return { type: 'LineString', coordinates: arrowPath(gen.from, gen.to) }
    }
    case 'corridor': {
      const ring = corridorRing(gen.centerline, gen.widthNm)
      return ring ? { type: 'Polygon', coordinates: [ring] } : null
    }
    default:
      return null
  }
}
