// 국내 레이더 관측 반경의 합집합 경계를 만들어 frontend/public/data/radar-coverage.geojson에 쓴다.
//
// 지점 위경도와 관측반경은 기상청 QCD 볼륨(HDF5) 자체가 담고 있다 — 손으로 적은 값이 아니라
// 자료에서 읽은 값이다. 레이더는 이사 가지 않으므로 결과를 정적 파일로 저장하고, 지점이
// 늘거나 반경이 바뀔 때만 이 스크립트를 다시 돌린다.
//
//   node scripts/build-radar-coverage.mjs            # 저장된 지점 목록으로 다시 생성
//   node scripts/build-radar-coverage.mjs --probe    # 기상청에서 지점 정보를 새로 받아 갱신
//
// 합집합 경계는 격자 마스크를 만든 뒤 외곽선을 따라가 뽑는다(Moore 이웃 추적). 원을 하나씩
// 반투명으로 겹쳐 그리면 겹친 부분만 진해지고, 폴리곤 여러 개를 구멍으로 뚫으면 겹침이
// 정의되지 않는다 — 경계선 하나로 합쳐야 마스크와 테두리 양쪽에 쓸 수 있다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const OUTPUT = path.join(repoRoot, 'frontend/public/data/radar-coverage.geojson')
const SITES_FILE = path.join(here, 'radar-sites.json')

// 격자 간격 0.01° ≈ 1.1 km. 240 km 반경을 1 km 안쪽으로 그린다.
const STEP = 0.01
const AREA = { south: 30.0, north: 41.5, west: 120.5, east: 133.5 }
const EARTH_KM = 6371.0088

function distanceKm(aLat, aLon, bLat, bLon) {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLon = (bLon - aLon) * toRad
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

async function probeSites() {
  const { default: config } = await import(path.join(repoRoot, 'backend/src/config.js'))
  const { parseQcdVolume } = await import(path.join(repoRoot, 'backend/src/parsers/radar-qcd-parser.js'))
  const candidates = (process.env.RADAR_QCD_PROBE_SITES
    || 'BRI,GDK,KWK,KSN,MYN,PSN,GSN,SSP,JNI,IIA,GNG,PMK,SBS,YIT,CHY,MUJ,SDG,ODS').split(',')
  const now = new Date(Date.now() + 9 * 3600_000 - 20 * 60_000)
  now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 5) * 5, 0, 0)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  const tm = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}`

  const sites = []
  for (const stn of candidates.map((s) => s.trim()).filter(Boolean)) {
    try {
      const url = `${config.radar_echo_top.url}?tm=${tm}&data=qcd&stn=${stn}&authKey=${config.api.radar_satellite_auth_key}`
      const buffer = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).arrayBuffer())
      if (!(buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x48)) continue
      const volume = await parseQcdVolume(buffer, { stn })
      if (!Number.isFinite(volume.latitude) || !Number.isFinite(volume.longitude)) continue
      sites.push({ stn, lat: volume.latitude, lon: volume.longitude, rangeKm: Math.max(...volume.rangeM) / 1000 })
      console.log(`${stn}  ${volume.latitude.toFixed(4)}, ${volume.longitude.toFixed(4)}  반경 ${(Math.max(...volume.rangeM) / 1000).toFixed(0)} km`)
    } catch { /* 응답이 없는 지점은 건너뛴다 — 우리 키로 열리는 지점만 쓴다 */ }
  }
  if (!sites.length) throw new Error('지점 정보를 하나도 받지 못했다')
  fs.writeFileSync(SITES_FILE, `${JSON.stringify({ probedTm: tm, sites }, null, 2)}\n`)
  return sites
}

function buildMask(sites) {
  const cols = Math.round((AREA.east - AREA.west) / STEP)
  const rows = Math.round((AREA.north - AREA.south) / STEP)
  const mask = new Uint8Array(cols * rows)
  for (let row = 0; row < rows; row += 1) {
    const lat = AREA.north - row * STEP
    for (let col = 0; col < cols; col += 1) {
      const lon = AREA.west + col * STEP
      for (const site of sites) {
        if (distanceKm(lat, lon, site.lat, site.lon) <= site.rangeKm) { mask[row * cols + col] = 1; break }
      }
    }
  }
  return { mask, cols, rows }
}

// Moore 이웃 추적 — 마스크 바깥 테두리를 시계방향으로 한 바퀴 돈다.
function traceOutline({ mask, cols, rows }) {
  const at = (col, row) => (col < 0 || col >= cols || row < 0 || row >= rows ? 0 : mask[row * cols + col])
  let start = null
  for (let row = 0; row < rows && !start; row += 1) {
    for (let col = 0; col < cols; col += 1) if (at(col, row)) { start = [col, row]; break }
  }
  if (!start) throw new Error('마스크가 비어 있다')

  const NEIGHBOURS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const ring = []
  let [cx, cy] = start
  let dir = 0
  do {
    ring.push([cx, cy])
    let moved = false
    for (let i = 0; i < 8; i += 1) {
      const d = (dir + 6 + i) % 8 // 직전 진행방향의 오른쪽부터 훑는다
      const [dx, dy] = NEIGHBOURS[d]
      if (at(cx + dx, cy + dy)) { cx += dx; cy += dy; dir = d; moved = true; break }
    }
    if (!moved) break
  } while (!(cx === start[0] && cy === start[1]) && ring.length < cols * rows)
  return ring
}

// 1 km 격자를 그대로 쓰면 점이 수만 개다 — 벗어남이 2 km를 넘지 않는 선에서 줄인다.
function simplify(points, toleranceKm = 2) {
  const kept = [points[0]]
  for (const point of points.slice(1)) {
    const last = kept[kept.length - 1]
    if (distanceKm(last[1], last[0], point[1], point[0]) >= toleranceKm) kept.push(point)
  }
  return kept
}

const sites = process.argv.includes('--probe') || !fs.existsSync(SITES_FILE)
  ? await probeSites()
  : JSON.parse(fs.readFileSync(SITES_FILE, 'utf8')).sites

console.log(`지점 ${sites.length}곳 — 반경 ${Math.min(...sites.map((s) => s.rangeKm)).toFixed(0)}~${Math.max(...sites.map((s) => s.rangeKm)).toFixed(0)} km`)
const grid = buildMask(sites)
const outline = traceOutline(grid)
const ring = simplify(outline.map(([col, row]) => [
  +(AREA.west + col * STEP).toFixed(4),
  +(AREA.north - row * STEP).toFixed(4),
]))
ring.push(ring[0])

// 마스크는 세계 사각형에 합집합을 구멍으로 뚫은 폴리곤 하나다(FIR 바깥 마스크와 같은 방식).
const WORLD = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
const geojson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { role: 'coverage' }, geometry: { type: 'Polygon', coordinates: [ring] } },
    { type: 'Feature', properties: { role: 'outside-mask' }, geometry: { type: 'Polygon', coordinates: [WORLD, ring] } },
  ],
}
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
fs.writeFileSync(OUTPUT, `${JSON.stringify(geojson)}\n`)
console.log(`경계점 ${ring.length}개 → ${path.relative(repoRoot, OUTPUT)} (${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB)`)
