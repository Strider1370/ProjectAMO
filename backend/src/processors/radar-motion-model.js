// 레이더 에코 이동벡터의 순수 계산.
// 2026-07-26 게이트 A에서 개별 화살표 정확도 86.6%를 낸 구성을 그대로 옮긴 것이다.
// 참조 구현: backend/scripts/measure-motion-accuracy.mjs
// 격자는 { width, height, stride, values: Int16Array } 형태를 받는다.
// no-data는 이 파일에 오기 전에 createMotionInput이 0으로 클램프한다.

const HSR_CELL_KM = 0.5

export const MOTION_MODEL_DEFAULTS = Object.freeze({
  workStride: 4,
  patchRadiusKm: 12,
  spacingKm: 8,
  maxSpeedKmh: 100,
  minSpeedKt: 3,
  edgeLookaheadKm: 6,
  minReflectivity: 2000,
  frameIntervalMs: 5 * 60 * 1000,
})

export function cellKm(settings) {
  return settings.workStride * HSR_CELL_KM
}

export function searchRadiusCells(settings) {
  const hours = settings.frameIntervalMs / 3600000
  return Math.max(1, Math.ceil(settings.maxSpeedKmh * hours / cellKm(settings)))
}

function valueAt(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null
  return grid.values[row * grid.width + col]
}

function sampleAt(grid, col, row) {
  const v = valueAt(grid, col, row)
  return v === null ? 0 : v
}

// 평균 절대차. 낮을수록 잘 맞은 것이다.
function patchMismatch(previous, current, prevCol, prevRow, currCol, currRow, half) {
  let sum = 0, n = 0
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) {
      sum += Math.abs(sampleAt(previous, prevCol + dx, prevRow + dy) - sampleAt(current, currCol + dx, currRow + dy))
      n += 1
    }
  }
  return sum / n
}

// 두 프레임에서 각 지점의 변위를 구한다. 정수 칸 단위다.
// 소수점 보정은 게이트 A에서 이득이 없어(-0.2%p) 넣지 않는다.
export function deriveMotionField(previous, current, settings, deadlineAtMs = Infinity) {
  const km = cellKm(settings)
  const half = Math.max(1, Math.round(settings.patchRadiusKm / km))
  const spacing = Math.max(1, Math.round(settings.spacingKm / km))
  const search = searchRadiusCells(settings)
  const vectors = []

  for (let row = half; row < current.height - half; row += spacing) {
    // 마감시한은 바깥 루프마다 확인한다. 다 만든 뒤 버리면 5분 주기 수집이 밀린다.
    if (Date.now() >= deadlineAtMs) return []
    for (let col = half; col < current.width - half; col += spacing) {
      if (current.values[row * current.width + col] < settings.minReflectivity) continue
      let best = null
      for (let dy = -search; dy <= search; dy += 1) {
        for (let dx = -search; dx <= search; dx += 1) {
          const score = patchMismatch(previous, current, col - dx, row - dy, col, row, half)
          if (!best || score < best.score) best = { dx, dy, score }
        }
      }
      if (best) vectors.push({ col, row, dx: best.dx, dy: best.dy, matchScore: best.score })
    }
  }
  return vectors
}

// 이웃과 방향이 얼마나 맞는지 기록만 한다. 값은 바꾸지 않는다 —
// 중앙값 평활화는 아직 측정되지 않아 보류 항목이다.
export function annotateNeighbourAgreement(vectors, settings) {
  const spacing = Math.max(1, Math.round(settings.spacingKm / cellKm(settings)))
  const key = (col, row) => `${col}:${row}`
  const byKey = new Map(vectors.map((v) => [key(v.col, v.row), v]))

  return vectors.map((v) => {
    let agree = 0, total = 0
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue
        const n = byKey.get(key(v.col + ox * spacing, v.row + oy * spacing))
        if (!n) continue
        total += 1
        const m1 = Math.hypot(v.dx, v.dy), m2 = Math.hypot(n.dx, n.dy)
        if (m1 < 0.25 || m2 < 0.25) { if (Math.abs(m1 - m2) < 0.5) agree += 1; continue }
        if ((v.dx * n.dx + v.dy * n.dy) / (m1 * m2) > 0.7) agree += 1 // 사잇각 약 45도 이내
      }
    }
    return { ...v, neighbourAgreement: total ? agree / total : 0 }
  })
}

// 자기 이동 방향으로 edge_lookahead_km 앞에 에코가 없으면 앞면이다.
// 덩어리 분할이나 윤곽선 추출을 하지 않는다 — 규모를 가리지 않는 것이 목적이다.
export function selectLeadingEdge(vectors, current, settings) {
  const km = cellKm(settings)
  const lookahead = settings.edgeLookaheadKm / km
  const hours = settings.frameIntervalMs / 3600000
  const minCells = settings.minSpeedKt * 1.852 * hours / km

  return vectors.filter((v) => {
    const mag = Math.hypot(v.dx, v.dy)
    if (mag < minCells) return false
    const col = Math.round(v.col + (v.dx / mag) * lookahead)
    const row = Math.round(v.row + (v.dy / mag) * lookahead)
    const ahead = valueAt(current, col, row)
    // 격자 밖(null)은 '에코 없음'이 아니라 '모름'이다. 앞면으로 치지 않는다.
    if (ahead === null) return false
    return ahead < settings.minReflectivity
  })
}

function bearingDegrees(start, end) {
  const toRad = Math.PI / 180
  const lat1 = start.lat * toRad, lat2 = end.lat * toRad
  const dLon = (end.lon - start.lon) * toRad
  const deg = Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  ) / toRad
  return (deg + 360) % 360
}

export function motionVectorsToGeoJSON(vectors, options) {
  const { gridToLatLon, workStride, frameIntervalMs } = options
  const km = cellKm({ workStride })
  const hours = frameIntervalMs / 3600000
  const features = []

  for (const v of vectors) {
    const start = gridToLatLon(v.col * workStride, v.row * workStride)
    const end = gridToLatLon((v.col + v.dx) * workStride, (v.row + v.dy) * workStride)
    if (!start || !end) continue
    if (![start.lon, start.lat, end.lon, end.lat].every(Number.isFinite)) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [start.lon, start.lat] },
      properties: {
        bearingDeg: Math.round(bearingDegrees(start, end)),
        speedKt: Math.round(Math.hypot(v.dx, v.dy) * km / hours / 1.852),
        matchScore: Number(v.matchScore.toFixed(2)),
        neighbourAgreement: Number((v.neighbourAgreement ?? 0).toFixed(2)),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
