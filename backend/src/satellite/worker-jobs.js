function asDate(now) {
  const date = new Date(now)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid satellite worker time')
  return date
}

export async function runSatelliteJob({ kind, mode, now, frame, deps = {} }) {
  const date = asDate(now)
  if (kind === 'satellite') {
    const processSatellite = deps.processSatellite || (await import('../processors/satellite-processor.js')).processSatellite
    return processSatellite({ now: date, mode, frame, deps })
  }
  if (kind === 'satellite_visible' && mode === 'current') {
    if (deps.processSatelliteVisible) {
      const result = await deps.processSatelliteVisible({ now: date, deps })
      return { result: { type: 'satellite_visible', ...result }, followUps: [] }
    }
    const { processSatelliteVisibleJob } = await import('../processors/satellite-visible-processor.js')
    return processSatelliteVisibleJob({ now: date, deps })
  }
  throw new Error('invalid satellite worker job')
}
