import { kmlWithFolders } from '@tmcw/togeojson'
import { readKmlFromBuffer } from './kmzUnzip.js'
import { buildLayerList } from './kmlFolderTree.js'

// 올린 바이트를 화면이 쓸 수 있는 폴더 목록으로 바꾼다.
//
// 어느 단계에서 실패했는지 남기는 것이 이 함수의 절반이다. 빈 화면으로 죽으면
// 조종사는 자기 파일이 잘못된 건지 우리가 못 읽는 건지 알 수 없다.
//
// 전역 DOMParser만 쓴다. 브라우저는 내장이라 항상 있고, node --test에는 없으므로
// 시험 파일이 xmldom을 globalThis에 심어준다. 여기서 xmldom을 직접 import하면
// 브라우저에서 한 줄도 실행되지 않는 268KB가 번들에 실린다(routeImport.js와 같은 이유).

function fail(stage, message) {
  const error = new Error(message)
  error.stage = stage
  return error
}

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

export async function parseMyMapFile(arrayBuffer, fileName = '') {
  let text
  try {
    text = await readKmlFromBuffer(arrayBuffer, fileName)
  } catch (e) {
    throw fail('압축 해제', e?.message ?? '압축 파일을 열 수 없습니다.')
  }

  // 깨진 문서에서 해석기마다 반응이 다르다. 브라우저 DOMParser는 예외를 던지지 않고
  // <parsererror>를 심고, xmldom은 예외를 던진다. 둘 다 같은 단계 오류로 묶는다 —
  // 검사하지 않으면 "폴더 0개"만 뜨고 실패인 줄 모른다.
  let doc
  try {
    doc = new DOMParser().parseFromString(text, 'text/xml')
  } catch {
    doc = null
  }
  if (!doc
    || doc.getElementsByTagName('parsererror').length > 0
    || doc.getElementsByTagName('kml').length === 0) {
    throw fail('지도 내용 해석', '지도 내용을 해석하지 못했습니다. 파일이 손상되었을 수 있습니다.')
  }

  let list
  try {
    list = buildLayerList(kmlWithFolders(doc))
  } catch (e) {
    throw fail('도형 변환', e?.message ?? '도형을 변환하지 못했습니다.')
  }

  const stats = { folders: 0, features: 0, polygons: 0, lines: 0, points: 0 }
  for (const layer of list) {
    // 최상위 도형을 담으려고 우리가 만든 가상 폴더는 파일의 폴더가 아니다.
    if (layer.name !== '(폴더 없음)') stats.folders += 1
    stats.features += layer.features.length
    for (const f of layer.features) countGeometry(f.geometry, stats)
  }
  return { list, stats }
}
