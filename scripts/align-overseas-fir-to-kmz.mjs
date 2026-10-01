// 해외 FIR(VATSIM 원본)을 국토부 공역 KMZ의 FIR 경계에 맞춘다.
// scripts/airspace-kmz-to-geojson.py가 KMZ에서 FIR만 뽑아 넘겨 부른다. 직접 돌릴 때:
//   node scripts/align-overseas-fir-to-kmz.mjs <VATSIM 원본> <KMZ FIR GeoJSON> <출력>
//
// 1. KMZ에 있는 주변 FIR(평양·심양·상해·후쿠오카)은 경계를 KMZ 것으로 바꾼다.
// 2. 나머지 해외 FIR(우한·베이징·타이베이·하바롭스크 등)에서 KMZ FIR(인천 포함)과 겹치는 부분을 잘라 낸다.
// 3. VATSIM에서는 주변 FIR이었지만 KMZ 경계 밖으로 남은 조각은, 가장 많이 맞닿은 이웃 FIR에 붙인다.
//    어느 이웃과도 닿지 않는 조각(먼바다 등)은 버린다.
// 라벨 점(role: external-label)과 FIR 이름·코드는 원본 그대로 둔다.
import fs from 'fs'
import { area, buffer, difference, featureCollection, flatten, intersect, union } from '@turf/turf'

const [rawPath, kmzPath, outPath] = process.argv.slice(2)
if (!rawPath || !kmzPath || !outPath) {
  console.error('usage: node scripts/align-overseas-fir-to-kmz.mjs <vatsim> <kmz-firs> <out>')
  process.exit(1)
}
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
const kmz = JSON.parse(fs.readFileSync(kmzPath, 'utf8'))
const SLIVER_M2 = 1_000_000 // 1 km² 미만 조각은 좌표 반올림 차이로 보고 버린다.
const TOUCH_KM = 5 // 조각이 이웃과 맞닿았는지 볼 때 넓히는 거리

const kmzByName = new Map(kmz.features.map((feature) => [feature.properties.name, feature]))
const kmzAll = union(featureCollection(kmz.features))
const isFir = (feature) => feature.properties?.role === 'overseas-fir'
const polygonFeature = (geometry, properties = {}) => ({ type: 'Feature', properties, geometry })
const minus = (a, b) => (a ? difference(featureCollection([a, b])) : null)
const pieces = (feature) => (feature ? flatten(feature).features.filter((piece) => area(piece) >= SLIVER_M2) : [])

const replaced = raw.features.filter((feature) => isFir(feature) && kmzByName.has(feature.properties.fir_lbl_1))
const others = raw.features.filter((feature) => isFir(feature) && !kmzByName.has(feature.properties.fir_lbl_1))

// 2. 이웃 FIR에서 KMZ FIR과 겹치는 부분을 잘라 낸다.
const adjusted = new Map(others.map((feature) => [feature, minus(polygonFeature(feature.geometry), kmzAll)]))

// 3. 주변 FIR이 VATSIM에서 차지했지만 KMZ 경계 밖인 조각을 이웃에 붙인다.
let given = 0
let dropped = 0
for (const feature of replaced) {
  for (const piece of pieces(minus(polygonFeature(feature.geometry), kmzAll))) {
    const reach = buffer(piece, TOUCH_KM, { units: 'kilometers' })
    let best = null
    let bestArea = 0
    for (const other of others) {
      const overlap = intersect(featureCollection([reach, polygonFeature(other.geometry)]))
      const size = overlap ? area(overlap) : 0
      if (size > bestArea) { best = other; bestArea = size }
    }
    if (!best) { dropped += 1; continue }
    const current = adjusted.get(best)
    adjusted.set(best, current ? union(featureCollection([current, piece])) : piece)
    given += 1
  }
}

const features = raw.features.map((feature) => {
  if (!isFir(feature)) return feature
  const name = feature.properties.fir_lbl_1
  if (kmzByName.has(name)) {
    const source = kmzByName.get(name)
    return { ...feature, properties: { ...feature.properties, source: source.properties.source, cycle: source.properties.cycle },
      geometry: source.geometry }
  }
  const geometry = adjusted.get(feature)?.geometry
  if (!geometry) return null
  return { ...feature, properties: { ...feature.properties, alignedTo: kmz.features[0]?.properties.cycle }, geometry }
}).filter(Boolean)

fs.writeFileSync(outPath, `${JSON.stringify({ ...raw, features })}\n`, 'utf8')
console.log(`fir-overseas: KMZ 경계 ${replaced.length}개, 이웃 ${others.length}개 정리, 남은 조각 ${given}개 이웃에 붙임, ${dropped}개 버림`)
