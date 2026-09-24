// Describe exact stored forecast coverage, not a new freshness tolerance or
// an implicit interpolation outside published frames.
export function modelTimeCoverage(request, model) {
  const times = (model?.availableTimes ?? []).map((time) => Date.parse(time.validTime)).filter(Number.isFinite)
  const requested = request.nwpTimeSelection
    ? [Date.parse(request.nwpTimeSelection.baseTime), ...(request.nwpTimeSelection.waypointOverrides ?? [])
      .map((item) => Date.parse(request.nwpTimeSelection.baseTime) + item.offsetHours * 3_600_000)]
    : [Date.parse(request.etd), Date.parse(request.eta)]
  const start = times.length ? Math.min(...times) : null, end = times.length ? Math.max(...times) : null
  return { status: !times.length || requested.some((time) => !Number.isFinite(time)) ? 'unknown'
    : requested.some((time) => time < start || time > end) ? 'outside_available_frames' : 'within_available_frames',
    availableStart: start == null ? null : new Date(start).toISOString(),
    availableEnd: end == null ? null : new Date(end).toISOString(),
    selectedKimRun: model?.crossSection?.run ?? null, selectedKtgRun: model?.turbulence?.run ?? null,
    note: 'KIM frame range only; does not prove spatial, altitude or KTG time coverage.' }
}
