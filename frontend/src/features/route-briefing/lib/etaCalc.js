export function computeFlightDurationMinutes(distanceNm, speedKt) {
  const d = Number(distanceNm)
  const v = Number(speedKt)
  if (!(d > 0) || !(v > 0)) return null
  return Math.round((d / v) * 60)
}

export function formatFlightDuration(distanceNm, speedKt) {
  const minutes = computeFlightDurationMinutes(distanceNm, speedKt)
  if (minutes == null) return null
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${minutes}분`
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`
}

export function computeEtaIso(etdIso, distanceNm, speedKt) {
  const etd = Date.parse(etdIso)
  const d = Number(distanceNm)
  const v = Number(speedKt)
  if (!Number.isFinite(etd) || !(d > 0) || !(v > 0)) return null
  const ms = (d / v) * 3600 * 1000
  return new Date(etd + ms).toISOString().replace('.000Z', 'Z')
}
