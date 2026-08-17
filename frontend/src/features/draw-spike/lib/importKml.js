// 불러온 KML → 우리가 그리는 도형.
//
// 읽는 일 자체는 my-map/lib/parseMyMapFile.js가 이미 한다. 여기가 하는 일은
// 그 결과(GeoJSON)를 우리 도형 속성 이름으로 바꿔 끼우는 것뿐이다.
//
// 이름이 다른 이유: 파일은 `stroke`·`fill-opacity` 같은 지도 업계 이름을 쓰고,
// 우리 화면은 `color`·`fillOpacity`를 쓴다. 이 자리에서 한 번만 맞춰 준다.
import { ICONS, DEFAULT_ICON } from './iconCatalog.js'

const M_TO_FT = 1 / 0.3048
const DEFAULTS = { color: '#2563eb', opacity: 1, width: 2, fillOpacity: 0.3 }

/** 아이콘 주소 → 우리 목록의 id. 못 찾으면 기본 아이콘. */
export function iconIdFromHref(href) {
  if (!href) return DEFAULT_ICON
  // 파일은 http로 적고 우리 목록은 https다. 규약을 빼고 견줘야 맞는다.
  const strip = (u) => String(u).replace(/^https?:\/\//, '')
  const target = strip(href)
  return ICONS.find((i) => strip(i.url) === target)?.id ?? DEFAULT_ICON
}

/** 좌표에 실린 고도(m) 중 가장 높은 값 → ft. 고도가 없으면 0. */
export function topAltitudeFt(geometry) {
  let maxM = 0
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (typeof c[2] === 'number' && c[2] > maxM) maxM = c[2]
      return
    }
    c.forEach(walk)
  }
  if (geometry?.coordinates) walk(geometry.coordinates)
  return maxM > 0 ? Math.round(maxM * M_TO_FT) : 0
}

/**
 * 도형 묶음을 낱개로 편다.
 *
 * mapbox-gl-draw는 점·선·면 하나씩만 받는다. 파일에는 여러 조각을 한 이름으로
 * 묶은 도형(MultiGeometry)이 흔한데 — 맥케이 파일에 98곳 있다 — 그대로 주면
 * 통째로 사라진다. 조각으로 나눠 넣고 이름만 그대로 물려준다.
 */
export function flattenGeometry(geometry) {
  if (!geometry) return []
  const { type, coordinates, geometries } = geometry
  if (type === 'GeometryCollection') return (geometries ?? []).flatMap(flattenGeometry)
  if (type === 'MultiPoint') return coordinates.map((c) => ({ type: 'Point', coordinates: c }))
  if (type === 'MultiLineString') return coordinates.map((c) => ({ type: 'LineString', coordinates: c }))
  if (type === 'MultiPolygon') return coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
  if (['Point', 'LineString', 'Polygon'].includes(type)) return [geometry]
  return []
}

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

/**
 * 파서가 준 폴더 목록 → draw에 그대로 넣을 수 있는 feature 배열.
 * @param {Array<{name:string, features:Array}>} layers parseMyMapFile의 `list`
 */
export function layersToFeatures(layers, unfiled = '(폴더 없음)') {
  const out = []
  for (const layer of layers ?? []) {
    for (const f of layer.features ?? []) {
      const p = f.properties ?? {}
      for (const geometry of flattenGeometry(f.geometry)) {
        out.push({
          type: 'Feature',
          properties: {
            name: p.name ?? '',
            description: p.description ?? '',
            // 선 색이 없으면 면 색이라도 쓴다. 둘 다 없을 때만 기본값.
            color: p.stroke ?? p.fill ?? DEFAULTS.color,
            opacity: num(p['stroke-opacity'], DEFAULTS.opacity),
            width: num(p['stroke-width'], DEFAULTS.width),
            fillOpacity: num(p['fill-opacity'], DEFAULTS.fillOpacity),
            icon: iconIdFromHref(p.icon),
            folder: layer.name && layer.name !== unfiled ? layer.name : unfiled,
            ceilFt: topAltitudeFt(geometry),
            floorFt: 0,
          },
          geometry,
        })
      }
    }
  }
  return out
}
