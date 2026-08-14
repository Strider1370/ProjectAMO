// 폴더 목록에서 지금 화면에 그릴 줄만 고른다.
//
// 맥케이 파일 기준 폴더가 176개인데 최상위가 101개고, 그중 하위 폴더를 가진 것은
// 4개뿐이다. 접기로 줄어드는 것은 75줄뿐이라 실제로는 찾기가 주된 도구다. 그래서
// 찾기는 접힘 상태를 무시하고 동작한다 — 맞는 폴더가 접힌 조상 안에 있다고 해서
// 결과가 안 나오면 찾기의 뜻이 없다.

const norm = (s) => String(s ?? '').trim().toLowerCase()

export function hasChildren(list, id) {
  return list.some((l) => l.parentId === id)
}

export function toggleExpanded(expanded, id) {
  const next = new Set(expanded)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function visibleRows(list, { expanded = new Set(), query = '' } = {}) {
  const byId = new Map(list.map((l) => [l.id, l]))
  const q = norm(query)

  if (q) {
    // 맞는 폴더 자신과 조상 전부를 남긴다. 조상이 없으면 화면에 들어갈 자리가 없다.
    const keep = new Set()
    for (const l of list) {
      if (!norm(l.name).includes(q)) continue
      keep.add(l.id)
      let p = l.parentId
      while (p) { keep.add(p); p = byId.get(p)?.parentId ?? null }
    }
    return list.filter((l) => keep.has(l.id))
  }

  // 조상이 전부 펼쳐져 있어야 보인다. 최상위는 조상이 없으므로 항상 보인다.
  return list.filter((l) => {
    let p = l.parentId
    while (p) {
      if (!expanded.has(p)) return false
      p = byId.get(p)?.parentId ?? null
    }
    return true
  })
}
