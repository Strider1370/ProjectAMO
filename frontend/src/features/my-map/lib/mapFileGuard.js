// 브리핑의 경로 불러오기는 "선 하나를 비행경로로 삼는" 기능이다. 지도 파일을 거기
// 올리면 도형 수천 개를 경로로 해석하려다 이상해진다.
//
// 판정은 보수적으로 한다. 지금 정상 동작하는 경우를 막으면 새 기능이 아니라 회귀다.
// 선이 여럿인 파일은 지금도 "어느 것을 쓸지" 고르는 화면이 있으므로 그것만으로는
// 막지 않는다. 면이 하나라도 있으면 경로 파일이 아니고(맥케이 파일은 16,170개),
// 선·지점이 터무니없이 많아도 경로가 아니다.
export const MAP_FILE_LIMITS = { maxLines: 20, maxPoints: 200 }

function countGeometry(g, out) {
  if (!g) return
  if (g.type === 'GeometryCollection') {
    for (const x of g.geometries ?? []) countGeometry(x, out)
    return
  }
  if (g.type === 'Polygon') out.polygons += 1
  else if (g.type === 'MultiPolygon') out.polygons += (g.coordinates?.length ?? 0)
  else if (g.type === 'LineString') out.lines += 1
  else if (g.type === 'MultiLineString') out.lines += (g.coordinates?.length ?? 0)
  else if (g.type === 'Point') out.points += 1
  else if (g.type === 'MultiPoint') out.points += (g.coordinates?.length ?? 0)
}

export function describeMapFile(geojson) {
  const features = geojson?.features ?? []
  const out = { features: features.length, polygons: 0, lines: 0, points: 0 }
  for (const f of features) countGeometry(f?.geometry, out)
  out.isMap = out.polygons > 0 || out.lines > MAP_FILE_LIMITS.maxLines || out.points > MAP_FILE_LIMITS.maxPoints
  return out
}
