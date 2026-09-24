export function getWindDirection(metarData, airport) {
  const value = metarData?.airports?.[airport]?.observation?.wind?.direction
  return Number.isFinite(value) ? value : null
}

function getRunwayHeading(runwayGroup) {
  const match = String(runwayGroup ?? '').match(/(\d{2})/)
  if (!match) return null
  const runwayNumber = Number(match[1])
  if (!Number.isFinite(runwayNumber)) return null
  return (runwayNumber % 36) * 10
}

function getHeadingDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY
  return Math.abs(((a - b + 540) % 360) - 180)
}

export function pickBestRunwayGroup(runwayGroups, windDirection) {
  const unique = [...new Set((runwayGroups ?? []).filter(Boolean))]
  if (unique.length === 0) return null
  if (!Number.isFinite(windDirection)) return unique[0]
  return unique
    .map((runwayGroup) => ({
      runwayGroup,
      heading: getRunwayHeading(runwayGroup),
    }))
    .sort((a, b) => {
      const diffA = getHeadingDifference(a.heading, windDirection)
      const diffB = getHeadingDifference(b.heading, windDirection)
      if (diffA !== diffB) return diffA - diffB
      return (a.heading ?? 0) - (b.heading ?? 0)
    })[0]?.runwayGroup ?? unique[0]
}

export function filterProceduresByRunway(procedures, runwayGroup) {
  if (!runwayGroup) return procedures
  const filtered = procedures.filter((proc) => (proc.runways ?? []).includes(runwayGroup))
  return filtered.length > 0 ? filtered : procedures
}

export function chooseIapKeyForRunway(entry, iapData, runwayGroup) {
  const candidateKeys = entry?.candidateIapKeys ?? []
  if (candidateKeys.length === 0) return null
  if (!runwayGroup) return entry?.defaultIapKey ?? candidateKeys[0]
  return candidateKeys.find((key) =>
    getIapRunwayGroups(iapData?.iapRoutes?.[key]).includes(runwayGroup),
  ) ?? entry?.defaultIapKey ?? candidateKeys[0]
}

function getIapRunwayGroups(iapRoute) {
  return iapRoute?.representativeFor?.runwayGroup ?? iapRoute?.runways ?? []
}
