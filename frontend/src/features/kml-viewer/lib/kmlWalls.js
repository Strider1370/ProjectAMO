// 파일의 "고도 벽"(10NM wall, 5000ft, Wireframe …)은 얇은 판자 수천 장을 이어붙인
// 울타리다. 판자 한 장은 땅에 붙은 점 둘과 그 바로 위 점 둘로 된 세로 사각형이다.
//
// Mapbox는 임의의 3D 도형을 못 그린다. 할 줄 아는 것은 하나뿐 — 바닥 모양을 주면
// 몇 미터부터 몇 미터까지 기둥으로 뽑아올리기(fill-extrusion). 마침 이 울타리는
// 그렇게 뽑아올린 기둥의 옆면과 같은 것이므로, 판자를 한 장씩 세울 필요 없이
// 아래쪽 모서리만 이어 바닥 고리를 되찾으면 된다.

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1]

export function wallToExtrusion(feature) {
  const g = feature?.geometry
  const panels = g?.type === 'GeometryCollection' ? g.geometries ?? [] : [g]

  let base = Infinity
  let top = -Infinity
  const ground = []
  for (const panel of panels) {
    if (panel?.type !== 'Polygon') return null
    const pts = panel.coordinates?.[0] ?? []
    let low = Infinity
    let high = -Infinity
    for (const p of pts) {
      const z = p[2]
      if (typeof z !== 'number') return null
      if (z < low) low = z
      if (z > high) high = z
    }
    if (low === high) return null // 세워진 판자가 아니라 평면 도형이다
    base = Math.min(base, low)
    top = Math.max(top, high)
    // 이 판자에서 땅에 붙은 점만, 나온 순서대로. 이웃 판자와 한 점씩 겹치므로
    // 이어 붙인 뒤 겹친 것을 걷어내면 원래의 바닥 고리가 된다.
    for (const p of pts) {
      if (p[2] !== low) continue
      const xy = [p[0], p[1]]
      if (!same(xy, ground[ground.length - 1])) ground.push(xy)
    }
  }

  if (ground.length < 3) return null
  if (!same(ground[0], ground[ground.length - 1])) ground.push([...ground[0]])
  if (ground.length < 4) return null

  return {
    type: 'Feature',
    properties: { ...feature.properties, __base: base, __height: top },
    geometry: { type: 'Polygon', coordinates: [ground] },
  }
}

// 바닥·천장 높이는 위에서 심은 값을 그대로 읽는다. 색은 다른 레이어와 마찬가지로
// 파일이 정한 것을 쓴다 — 벽이라고 우리가 색을 고르지 않는다.
// ponytail: 파일은 "벽면"만 그리는데 fill-extrusion은 속이 찬 기둥을 그린다 —
// 천장 뚜껑이 생겨 위에서 보면 원판으로 덮인다. 벽면만 그리려면 판자마다 얇은 띠로
// 부풀려야 하고(선분 → 폭 20m 사각형), 그러면 도형 수가 판자 수만큼 늘어난다.
// 껍데기만 필요하다는 것이 본 기능에서 확정되면 그때 바꾼다.
export const EXTRUSION_PAINT = {
  'fill-extrusion-color': ['coalesce', ['get', 'fill'], ['get', 'stroke'], '#3388ff'],
  'fill-extrusion-base': ['get', '__base'],
  'fill-extrusion-height': ['get', '__height'],
  'fill-extrusion-opacity': 0.4,
}

export function buildWalls(list) {
  const out = []
  for (const layer of list) {
    for (const f of layer.features) {
      const wall = wallToExtrusion(f)
      if (wall) {
        wall.properties.__folder = layer.id
        out.push(wall)
      }
    }
  }
  return out
}
