const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name ?? '').localeCompare(String(b.name ?? ''))

export function documentScopedId(documentId, id) {
  return `${documentId}:${id}`
}

export function itemMatchesQuery(item, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase()
  return !needle || String(item.name ?? '').toLocaleLowerCase().includes(needle)
}

export function groupMatchesQuery(group, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase()
  return !needle || String(group.name ?? '').toLocaleLowerCase().includes(needle)
}

export function ancestorGroupIds(document, groupId) {
  const byId = new Map((document?.groups ?? []).map((group) => [group.id, group]))
  const ancestors = []
  const seen = new Set()
  let id = groupId
  while (id && !seen.has(id) && byId.has(id)) {
    ancestors.push(id)
    seen.add(id)
    id = byId.get(id)?.parentId ?? null
  }
  return ancestors
}

// Exposes a selected Placemark even when its original folder is collapsed or the
// item is after the initial chunk. Malformed cyclic folder references terminate at
// the first repeated id rather than making the panel traversal loop forever.
export function selectedItemReveal(document, itemId, itemLimit = 120) {
  const item = document?.items?.find((candidate) => candidate.id === itemId)
  if (!item) return null
  const groupIds = ancestorGroupIds(document, item.groupId)
  const parentId = groupIds[0] ?? '__ungrouped__'
  const siblings = (document?.items ?? []).filter((candidate) => {
    const candidateGroup = ancestorGroupIds(document, candidate.groupId)[0] ?? '__ungrouped__'
    return candidateGroup === parentId
  }).sort(byOrder)
  const index = siblings.findIndex((candidate) => candidate.id === itemId)
  return {
    expanded: new Set([...groupIds, parentId]),
    parentId,
    revealed: Math.max(itemLimit, (Math.floor(Math.max(index, 0) / itemLimit) + 1) * itemLimit),
  }
}

// Imported documents keep their original folder hierarchy. This view model deliberately
// keeps one row per MapDocument item; a compound item may render as many map features.
export function buildMapPanelTree(document) {
  const groups = [...(document?.groups ?? [])].sort(byOrder)
  const items = [...(document?.items ?? [])].sort(byOrder)
  const nodes = new Map(groups.map((group) => [group.id, {
    type: 'group', group, children: [], items: [], itemCount: 0,
  }]))
  const roots = []
  for (const node of nodes.values()) {
    const parent = node.group.parentId ? nodes.get(node.group.parentId) : null
    // Broken imported files occasionally have a self parent or cycle. Keep that
    // folder readable at the top level instead of losing it or recursing forever.
    const ancestry = new Set([node.group.id])
    let ancestor = parent
    while (ancestor && !ancestry.has(ancestor.group.id)) {
      ancestry.add(ancestor.group.id)
      ancestor = ancestor.group.parentId ? nodes.get(ancestor.group.parentId) : null
    }
    if (parent && !ancestor) parent.children.push(node)
    else roots.push(node)
  }

  const ungrouped = []
  for (const item of items) {
    const node = item.groupId ? nodes.get(item.groupId) : null
    if (node) node.items.push(item)
    else ungrouped.push(item)
  }

  const count = (node) => {
    node.children.sort((a, b) => byOrder(a.group, b.group))
    node.items.sort(byOrder)
    node.itemCount = node.items.length + node.children.reduce((sum, child) => sum + count(child), 0)
    return node.itemCount
  }
  roots.sort((a, b) => byOrder(a.group, b.group)).forEach(count)
  if (ungrouped.length) {
    roots.push({ type: 'ungrouped', id: '__ungrouped__', children: [], items: ungrouped, itemCount: ungrouped.length })
  }
  return roots
}

function filterNode(node, query) {
  const groupMatch = node.type === 'group' && groupMatchesQuery(node.group, query)
  const children = node.children.map((child) => filterNode(child, query)).filter(Boolean)
  const items = node.items.filter((item) => itemMatchesQuery(item, query))
  if (!groupMatch && !children.length && !items.length) return null
  return { ...node, children, items, groupMatch }
}

export function filterMapPanelTree(tree, query) {
  if (!String(query ?? '').trim()) return tree
  return tree.map((node) => filterNode(node, query)).filter(Boolean)
}

// A group can contain thousands of original Placemark entries. The caller owns the
// revealed count, so "더 보기" does not turn a folder click into a giant DOM update.
export function flattenMapPanelRows(tree, { expanded = new Set(), query = '', revealed = {}, itemLimit = 120 } = {}) {
  const searching = Boolean(String(query).trim())
  const rows = []
  const walk = (node, depth) => {
    const id = node.type === 'group' ? node.group.id : node.id
    const open = searching || expanded.has(id)
    rows.push({ type: node.type, node, depth, open, id })
    if (!open) return

    const limit = searching ? Math.max(itemLimit, revealed[id] ?? itemLimit) : (revealed[id] ?? itemLimit)
    const shownItems = node.items.slice(0, limit)
    shownItems.forEach((item) => rows.push({ type: 'item', item, parentId: id, depth: depth + 1 }))
    if (node.items.length > shownItems.length) {
      rows.push({ type: 'more', parentId: id, depth: depth + 1, remaining: node.items.length - shownItems.length })
    }
    node.children.forEach((child) => walk(child, depth + 1))
  }
  tree.forEach((node) => walk(node, 0))
  return rows
}

export function documentItemCount(document) {
  return document?.items?.length ?? 0
}

export function documentGroupCount(document) {
  return document?.groups?.length ?? 0
}
