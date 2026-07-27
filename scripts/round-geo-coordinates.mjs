#!/usr/bin/env node
// 행정구역 경계 GeoJSON의 좌표 정밀도를 낮춘다.
//
// 왜: 원본은 좌표가 소수점 14~15자리(≈0.0000001mm)로 저장돼 있는데, 지도 최대 확대가
// 16단계라 화면 1픽셀이 실제 수 미터다. 6자리면 11cm — 이미 화면 한 점보다 훨씬 작다.
// 나머지 자릿수는 전송량만 불린다(sido+sigungu 전송 6.7MB → 3.0MB).
//
// 경계 데이터를 원본에서 다시 받아 교체할 때 이 스크립트를 다시 돌려야 한다.
// 안 그러면 6MB가 조용히 되돌아온다.
//
//   node scripts/round-geo-coordinates.mjs [자릿수]   (기본 6)

import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const DECIMALS = Number(process.argv[2] ?? 6)
const FILES = [
  'frontend/public/Geo/sido.json',
  'frontend/public/Geo/sigungu.json',
  'frontend/public/Geo/korea_neighbors_masked.v1.geojson',
]

if (!Number.isInteger(DECIMALS) || DECIMALS < 4 || DECIMALS > 9) {
  throw new Error(`자릿수는 4~9 사이 정수여야 한다 (받은 값: ${process.argv[2]})`)
}

// 좌표 배열은 [lon, lat] 또는 그 중첩. 숫자 쌍에 닿을 때까지 내려간다.
function roundCoords(node) {
  if (typeof node[0] === 'number') return node.map((n) => Number(n.toFixed(DECIMALS)))
  return node.map(roundCoords)
}

const kb = (n) => (n / 1024).toFixed(0).padStart(5)

for (const file of FILES) {
  const before = readFileSync(file, 'utf8')
  const json = JSON.parse(before)
  for (const feature of json.features) {
    // properties(sido/sidonm 등)는 그대로 둔다 — 좌표만 손댄다.
    feature.geometry.coordinates = roundCoords(feature.geometry.coordinates)
  }
  const after = JSON.stringify(json)
  writeFileSync(file, after)
  console.log(
    `${file}\n  원본 ${kb(before.length)} KB → ${kb(after.length)} KB` +
    ` | 전송(gzip) ${kb(gzipSync(before).length)} KB → ${kb(gzipSync(after).length)} KB`,
  )
}
