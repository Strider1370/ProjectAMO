// kmlWithFolders가 준 트리를 화면 패널이 쓰기 좋은 평평한 목록으로 바꾼다.
// 계층은 depth와 parentId로 남기고, 그리기는 폴더 단위로 한다 — 작성자가 나눠 놓은
// 단위가 곧 조종사가 켜고 끄고 싶어 하는 단위다.
const NO_FOLDER = '(폴더 없음)'

export function buildLayerList(tree) {
  const list = []
  let unnamed = 0
  let serial = 0

  const visit = (node, parentId, parentPath, depth) => {
    const name = node.meta?.name?.trim() || `(이름 없는 폴더 ${++unnamed})`
    const id = `f${serial++}`
    const path = [...parentPath, name]
    const features = (node.children ?? []).filter((c) => c.type === 'Feature')
    list.push({ id, name, path, depth, parentId, features })
    for (const child of node.children ?? []) {
      if (child.type === 'folder') visit(child, id, path, depth + 1)
    }
  }

  // 최상위에 폴더 없이 놓인 도형은 묶어줄 자리가 없으므로 가상 폴더 하나를 만든다.
  // 파일에 나온 순서를 지키려고, 그런 도형이 처음 나타나는 자리에 끼워 넣는다.
  const loose = (tree.children ?? []).filter((c) => c.type === 'Feature')
  let loosePlaced = loose.length === 0
  for (const child of tree.children ?? []) {
    if (child.type === 'Feature' && !loosePlaced) {
      list.push({ id: `f${serial++}`, name: NO_FOLDER, path: [NO_FOLDER], depth: 0, parentId: null, features: loose })
      loosePlaced = true
    }
    if (child.type === 'folder') visit(child, null, [], 0)
  }
  return list
}

// 상위를 끄면 하위도 꺼진다. 화면에서 실제로 그릴 항목인지 판단한다.
export function isLayerVisible(list, id, hidden) {
  const byId = new Map(list.map((l) => [l.id, l]))
  let current = byId.get(id)
  while (current) {
    if (hidden.has(current.id)) return false
    current = current.parentId ? byId.get(current.parentId) : null
  }
  return true
}
