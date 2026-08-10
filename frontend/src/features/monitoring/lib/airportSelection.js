const MILITARY_AIRFIELDS = new Set(['RKTU', 'RKTN', 'RKTH', 'RKJJ', 'RKJK', 'RKNW', 'RKPS'])

export function isMonitoringSelectableAirport(icao) {
  return typeof icao === 'string' && !MILITARY_AIRFIELDS.has(icao)
}

export function filterMonitoringAirportChoices(icaos) {
  return [...new Set(icaos)].filter(isMonitoringSelectableAirport)
}

export function resolveMonitoringAirportSelection(previous, availableIcaos, defaultAirport = 'RKSI') {
  const available = filterMonitoringAirportChoices(availableIcaos)
  if (available.includes(previous)) return previous
  if (available.includes(defaultAirport)) return defaultAirport
  return available[0] || null
}
