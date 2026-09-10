export function linkedItemKey(item) {
  if (item == null) return null
  if (typeof item === 'string' || typeof item === 'number') return String(item)
  if (item.itemKey) return String(item.itemKey)
  const id = item.id ?? item.itemId
  if (id == null) return null
  return `${item.sourceKind || item.source || 'annotation'}:${id}`
}

export function nextPinnedSelection(currentId, requestedId) {
  const next = linkedItemKey(requestedId)
  return next && next !== linkedItemKey(currentId) ? next : null
}

export function activeLinkedSelection(previewId, pinnedId) {
  return linkedItemKey(previewId) || linkedItemKey(pinnedId)
}

export function shouldResetLinkedSelection(previousFlightId, nextFlightId) {
  return previousFlightId != null && String(previousFlightId) !== String(nextFlightId)
}
