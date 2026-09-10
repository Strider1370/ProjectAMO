function itemKey(item) {
  if (item?.itemKey) return String(item.itemKey)
  const id = item?.id ?? item?.itemId
  return id == null ? null : `${item.sourceKind || item.source || 'annotation'}:${id}`
}

function intervals(item) {
  return (item?.distanceIntervals || item?.routeIntervals || []).flatMap((interval) => {
    const startNm = Number(interval.startNm ?? interval.fromNm)
    const endNm = Number(interval.endNm ?? interval.toNm)
    return Number.isFinite(startNm) && Number.isFinite(endNm) ? [{ startNm, endNm }] : []
  })
}

function altitude(item) {
  const value = item?.altitude ?? item?.altitudeRangeFt
  const minFt = Number(value?.minFt ?? value?.from)
  const maxFt = Number(value?.maxFt ?? value?.to)
  return Number.isFinite(minFt) && Number.isFinite(maxFt) && maxFt > minFt ? { minFt, maxFt } : null
}

export function buildLinkedProfileBands({ linkedItems = [], maxDistance, yMax, xFor, yFor, activeItemId = null } = {}) {
  if (!(maxDistance > 0) || !(yMax > 0) || typeof xFor !== 'function' || typeof yFor !== 'function') return []
  return linkedItems.flatMap((item) => {
    const key = itemKey(item)
    const range = altitude(item)
    return intervals(item).flatMap((interval, intervalIndex) => {
      const startNm = Math.max(0, Math.min(maxDistance, interval.startNm))
      const endNm = Math.max(0, Math.min(maxDistance, interval.endNm))
      if (endNm < startNm) return []
      const rawLeft = xFor(startNm)
      const rawRight = xFor(endNm)
      const width = Math.max(5, rawRight - rawLeft)
      const x = rawRight - rawLeft < 5 ? rawLeft - width / 2 : rawLeft
      const upperFt = range ? Math.min(yMax, range.maxFt) : yMax
      const lowerFt = range ? Math.max(0, range.minFt) : 0
      if (range && upperFt <= lowerFt) return []
      return [{
        key: `${key || 'linked'}-${intervalIndex}`,
        itemKey: key,
        title: item.title || item.summary || '연결 항목',
        x,
        width,
        y: range ? yFor(upperFt) : yFor(yMax),
        height: range ? yFor(lowerFt) - yFor(upperFt) : yFor(0) - yFor(yMax),
        positionOnly: !range,
        active: key != null && String(activeItemId) === key,
      }]
    })
  })
}

export default buildLinkedProfileBands
