import { copyJson, circleGeometry, validCoordinate } from './mapDocument.js'
import { destination, greatCircleNm } from '../../draw-spike/lib/shapeBuilders.js'

const feature = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties })
const point = (coordinates, properties) => feature({ type: 'Point', coordinates }, properties)

export function editorPreview(editor) {
  const features = []
  const edit = editor.geometryEdit
  if (edit) {
    const item = edit.item
    features.push(feature(item.geometry, { role: 'shape' }))
    if (item.kind === 'circle') {
      features.push(point(item.definition.center, { role: 'center' }))
      features.push(point(destination(item.definition.center, 90, item.definition.radiusNm), { role: 'radius' }))
    } else if (item.geometry.type === 'Point') features.push(point(item.geometry.coordinates, { role: 'vertex', ring: 0, index: 0 }))
    else {
      const polygon = item.geometry.type === 'Polygon'
      const rings = polygon ? item.geometry.coordinates : [item.geometry.coordinates]
      rings.forEach((ring, ringIndex) => {
        const count = polygon ? ring.length - 1 : ring.length
        for (let index = 0; index < count; index += 1) {
          features.push(point(ring[index], { role: 'vertex', ring: ringIndex, index }))
          if (index < ring.length - 1) {
            const a = ring[index], b = ring[index + 1]
            features.push(point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { role: 'midpoint', ring: ringIndex, index: index + 1 }))
          }
        }
      })
    }
  } else if (editor.draft) {
    const { coordinates: points, pointer, kind } = editor.draft
    points.forEach((p, index) => features.push(point(p, { role: 'vertex', index })))
    const preview = [...points, ...(pointer && points.length ? [pointer] : [])]
    if (kind === 'circle' && points.length && pointer) {
      const radiusNm = greatCircleNm(points[0], pointer)
      if (radiusNm > 0) features.unshift(feature(circleGeometry({ center: points[0], radiusNm }), { role: 'shape' }))
    } else if (kind === 'polygon' && preview.length >= 3) features.unshift(feature({ type: 'Polygon', coordinates: [[...preview, preview[0]]] }, { role: 'shape' }))
    else if (preview.length >= 2) features.unshift(feature({ type: 'LineString', coordinates: preview }, { role: 'shape' }))
  }
  return { type: 'FeatureCollection', features }
}

/** Preview edits deliberately allow transient invalid rings; commit validates the completed shape. */
export function dragEditorHandle(original, handle, coordinate) {
  if (!validCoordinate(coordinate)) return original
  const item = copyJson(original)
  if (item.kind === 'circle') {
    if (handle.role === 'radius') item.definition.radiusNm = greatCircleNm(item.definition.center, coordinate)
    else item.definition.center = coordinate
    if (!(item.definition.radiusNm > 0)) return original
    item.geometry = circleGeometry(item.definition)
    return item
  }
  if (item.geometry.type === 'Point') { item.geometry.coordinates = coordinate; return item }
  const polygon = item.geometry.type === 'Polygon'
  const ringIndex = Number(handle.ring ?? 0), index = Number(handle.index)
  const ring = polygon ? item.geometry.coordinates[ringIndex].slice(0, -1) : item.geometry.coordinates
  if (handle.role === 'midpoint') ring.splice(index, 0, coordinate)
  else ring[index] = coordinate
  if (polygon) item.geometry.coordinates[ringIndex] = [...ring, [...ring[0]]]
  return item
}

export function translateEditorItem(original, from, to) {
  const delta = [to[0] - from[0], to[1] - from[1]]
  const item = copyJson(original)
  const move = (p) => {
    const next = [((p[0] + delta[0] + 540) % 360) - 180, p[1] + delta[1], ...p.slice(2)]
    if (!validCoordinate(next)) throw new Error('이 위치로 도형을 옮길 수 없습니다.')
    return next
  }
  if (item.kind === 'circle') { item.definition.center = move(item.definition.center); item.geometry = circleGeometry(item.definition); return item }
  const walk = (value) => typeof value[0] === 'number' ? move(value) : value.map(walk)
  item.geometry.coordinates = walk(item.geometry.coordinates)
  return item
}
