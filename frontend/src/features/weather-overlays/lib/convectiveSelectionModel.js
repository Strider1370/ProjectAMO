export function makeConvectiveRequestKey({ tm, lat, lon, minFl }) {
  if (!tm || !Number.isFinite(lat) || !Number.isFinite(lon) || (minFl !== 'all' && !Number.isFinite(Number(minFl)))) return null
  return `${tm}:${lat}:${lon}:${minFl}`
}

export function canApplyConvectiveResponse({ requestToken, currentToken, requestKey, currentKey, aborted }) {
  return !aborted && requestToken === currentToken && requestKey === currentKey
}
