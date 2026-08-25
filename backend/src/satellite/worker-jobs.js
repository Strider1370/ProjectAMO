function asDate(now) {
  const date = new Date(now)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid satellite worker time')
  return date
}

export async function runSatelliteJob({ kind, mode, now, frame, fillAll = false, deps = {} }) {
  const date = asDate(now)
  if (kind === 'satellite') {
    const processSatellite = deps.processSatellite || (await import('../processors/satellite-processor.js')).processSatellite
    return processSatellite({ now: date, mode, frame, fillAll, deps })
  }
  if (kind === 'satellite_visible' && mode === 'current') {
    if (deps.processSatelliteVisible) {
      const result = await deps.processSatelliteVisible({ now: date, fillAll, deps })
      return { result: { type: 'satellite_visible', ...result }, followUps: [] }
    }
    const { processSatelliteVisibleJob } = await import('../processors/satellite-visible-processor.js')
    return processSatelliteVisibleJob({ now: date, fillAll, deps })
  }
  throw new Error('invalid satellite worker job')
}
