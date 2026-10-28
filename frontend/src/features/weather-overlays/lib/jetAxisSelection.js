import { pressureToFl, sampleField } from './tropopauseJetSampling.js'

// 제트 지도 표시의 선택 기준. 기상학적 제트 정의(80kt)는 바꾸지 않는다.
export const JET_SELECTION = Object.freeze({ mainKm: 500, secondaryKm: 300, coreKt: 120,
  mergeKm: 100, headingDeg: 25, duplicateKm: 75, duplicateShare: 0.7, levelFl: 30 })
export const km = (a, b) => Math.hypot((b[0] - a[0]) * 111.2 * Math.cos((a[1] + b[1]) * Math.PI / 360), (b[1] - a[1]) * 111.2)
export const axisLength = points => points.slice(1).reduce((sum, point, i) => sum + km(points[i], point), 0)
const vector = (a, b) => [(b[0] - a[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), b[1] - a[1]]
const directionDifference = (a, b) => {
  const dot = a[0] * b[0] + a[1] * b[1], size = Math.hypot(...a) * Math.hypot(...b)
  return size ? Math.acos(Math.max(-1, Math.min(1, dot / size))) * 180 / Math.PI : 180
}

function nearest(point, line) {
  const scale = Math.cos(point[1] * Math.PI / 180)
  let best = { distance: Infinity }
  for (let i = 1; i < line.length; i++) {
    const a = [(line[i - 1][0] - point[0]) * scale * 111.2, (line[i - 1][1] - point[1]) * 111.2]
    const b = [(line[i][0] - point[0]) * scale * 111.2, (line[i][1] - point[1]) * 111.2]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)))
    const distance = Math.hypot(a[0] + dx * t, a[1] + dy * t)
    if (distance < best.distance) best = { distance, point: [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
      line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t], direction: vector(line[i - 1], line[i]) }
  }
  return best
}
const level = (field, point) => pressureToFl(sampleField(field, 'pmax', ...point))

function duplicate(field, jet, main, settings) {
  let matched = 0
  // 꼭짓점 수 대신 같은 거리 간격의 표본으로 중복 비율을 측정한다.
  const total = axisLength(jet.coordinates), samples = Math.max(3, Math.ceil(total / 30))
  const segments = jet.coordinates.slice(1).map((point, i) => km(jet.coordinates[i], point))
  for (let k = 0; k < samples; k++) {
    let distance = total * k / (samples - 1), i = 0
    while (i < segments.length - 1 && distance > segments[i]) distance -= segments[i++]
    const a = jet.coordinates[i], b = jet.coordinates[i + 1], t = distance / (segments[i] || 1)
    const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const near = nearest(point, main.coordinates)
    if (near.distance <= settings.duplicateKm && directionDifference(vector(a, b), near.direction) <= settings.headingDeg
      && Math.abs(level(field, point) - level(field, near.point)) <= settings.levelFl) matched++
  }
  return matched / samples >= settings.duplicateShare
}

function canJoin(field, a, b, settings) {
  const end = a.coordinates.at(-1), start = b.coordinates[0]
  const distance = km(end, start)
  if (distance > settings.mergeKm || directionDifference(vector(a.coordinates.at(-2), end), vector(start, b.coordinates[1])) > settings.headingDeg) return false
  if (Math.abs(level(field, end) - level(field, start)) > settings.levelFl) return false
  for (let i = 0, count = Math.max(2, Math.ceil(distance / 15)); i <= count; i++) {
    const point = [end[0] + (start[0] - end[0]) * i / count, end[1] + (start[1] - end[1]) * i / count]
    if (!(sampleField(field, 'vmax', ...point) >= 80)) return false
  }
  // 축을 연결할 때 흐름을 거스르는 되돌림이 생기지 않아야 한다.
  return distance < 1 || (directionDifference(vector(a.coordinates.at(-2), end), vector(end, start)) <= settings.headingDeg
    && directionDifference(vector(end, start), vector(start, b.coordinates[1])) <= settings.headingDeg)
}

export function selectJetAxes(field, settings = JET_SELECTION) {
  const original = field.jets.map((jet, id) => ({ ...jet, sourceIds: [id], lengthKm: axisLength(jet.coordinates) }))
  const rejected = []
  let pool = original.filter(jet => {
    const valid = jet.axisShown && jet.coordinates.length >= 5 && Number.isFinite(jet.p95OffsetKm) && jet.p95OffsetKm <= 50
    if (!valid) rejected.push({ jet, reason: jet.axisShown ? '품질 판단 표본 부족' : '기존 능선 검사 제외' })
    return valid
  }).sort((a, b) => b.lengthKm - a.lengthKm)
  let joined = 0
  for (let change = true; change;) {
    change = false
    outer: for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) {
      if (i === j || duplicate(field, pool[j], pool[i], settings) || !canJoin(field, pool[i], pool[j], settings)) continue
      const a = pool[i], b = pool[j], coordinates = [...a.coordinates, ...b.coordinates]
      pool = pool.filter((_, k) => k !== i && k !== j)
      pool.push({ ...a, coordinates, lengthKm: axisLength(coordinates), sourceIds: [...a.sourceIds, ...b.sourceIds],
        core: a.core.speedKt >= b.core.speedKt ? a.core : b.core })
      joined++; change = true; break outer
    }
  }
  const selected = []
  for (const jet of pool.sort((a, b) => b.lengthKm - a.lengthKm)) {
    if (!(jet.lengthKm >= settings.mainKm || jet.lengthKm >= settings.secondaryKm && jet.core.speedKt >= settings.coreKt)) {
      rejected.push({ jet, reason: '짧은 보조축' }); continue
    }
    if (selected.some(main => duplicate(field, jet, main, settings))) { rejected.push({ jet, reason: '주축과 중복' }); continue }
    selected.push({ ...jet, minor: false })
  }
  // 짧은 축의 강한 중심도 원 격자에서 확인한다. 주축과 같은 고도의 인접 중심은 중복 표기하지 않는다.
  const used = new Set(selected.flatMap(jet => jet.sourceIds)), cores = []
  for (const jet of original.filter(j => j.axisShown && !used.has(j.sourceIds[0]) && j.core.speedKt >= settings.coreKt).sort((a, b) => b.core.speedKt - a.core.speedKt)) {
    const point = [jet.core.lon, jet.core.lat], fl = level(field, point)
    if (!(sampleField(field, 'vmax', ...point) >= settings.coreKt) || !Number.isFinite(fl)) continue
    if (selected.some(main => { const near = nearest(point, main.coordinates); return near.distance < settings.duplicateKm && Math.abs(fl - level(field, near.point)) <= settings.levelFl })) continue
    if (cores.some(core => km(point, core.coordinates) < settings.duplicateKm && Math.abs(fl - core.flightLevel) <= settings.levelFl)) continue
    cores.push({ coordinates: point, speedKt: jet.core.speedKt, flightLevel: fl })
  }
  return { jets: selected, cores, rejected, stats: { original: original.filter(j => j.axisShown).length, axes: selected.length,
    cores: cores.length, joined, hidden: original.filter(j => j.axisShown && !used.has(j.sourceIds[0])).length } }
}
