function hashesDiffer(prev, next) {
  return (prev?.hash || null) !== (next?.hash || null)
}

function framesDiffer(prev, next) {
  return (prev?.tm || null) !== (next?.tm || null)
}

function graphicsMetaDiffer(prev, next) {
  return framesDiffer(prev, next)
    || Boolean(prev?.hash && next?.hash && hashesDiffer(prev, next))
    || Boolean(prev?.updated_at && next?.updated_at && prev.updated_at !== next.updated_at)
}

function overlayMetaDiffer(prev, next) {
  return (prev?.tmfc || null) !== (next?.tmfc || null)
    || (prev?.source_hash || null) !== (next?.source_hash || null)
    || (prev?.updated_at || null) !== (next?.updated_at || null)
    || (prev?.render_version || null) !== (next?.render_version || null)
}

export function detectSnapshotChanges(prev, next) {
  const changes = {
    metar: hashesDiffer(prev?.metar, next?.metar),
    metarOverseas: hashesDiffer(prev?.metarOverseas || prev?.metar_overseas, next?.metarOverseas || next?.metar_overseas),
    taf: hashesDiffer(prev?.taf, next?.taf),
    tafOverseas: hashesDiffer(prev?.tafOverseas || prev?.taf_overseas, next?.tafOverseas || next?.taf_overseas),
    warning: hashesDiffer(prev?.warning, next?.warning),
    sigmet: hashesDiffer(prev?.sigmet, next?.sigmet),
    sigmetOverseas: hashesDiffer(prev?.sigmetOverseas || prev?.sigmet_overseas, next?.sigmetOverseas || next?.sigmet_overseas),
    airmet: hashesDiffer(prev?.airmet, next?.airmet),
    sigwxLow: hashesDiffer(prev?.sigwxLow, next?.sigwxLow),
    amos: hashesDiffer(prev?.amos, next?.amos),
    lightning: hashesDiffer(prev?.lightning, next?.lightning),
    adsb: hashesDiffer(prev?.adsb, next?.adsb),
    groundForecast: hashesDiffer(prev?.groundForecast || prev?.ground_forecast, next?.groundForecast || next?.ground_forecast),
    groundOverview: hashesDiffer(prev?.groundOverview || prev?.ground_overview, next?.groundOverview || next?.ground_overview),
    environment: hashesDiffer(prev?.environment, next?.environment),
    airportInfo: hashesDiffer(prev?.airportInfo, next?.airportInfo),
    echoMeta: framesDiffer(prev?.echoMeta, next?.echoMeta),
    wissdomMeta: graphicsMetaDiffer(prev?.wissdomMeta || prev?.wissdom, next?.wissdomMeta || next?.wissdom),
    qpfMeta: graphicsMetaDiffer(prev?.qpfMeta || prev?.qpf, next?.qpfMeta || next?.qpf),
    rainviewerMeta: framesDiffer(prev?.rainviewerMeta || prev?.rainviewer, next?.rainviewerMeta || next?.rainviewer),
    satMeta: framesDiffer(prev?.satMeta, next?.satMeta),
    convectiveMeta: framesDiffer(prev?.convectiveMeta, next?.convectiveMeta) || hashesDiffer(prev?.convectiveMeta, next?.convectiveMeta),
    sigwxFrontMeta: overlayMetaDiffer(prev?.sigwxFrontMeta, next?.sigwxFrontMeta),
    sigwxCloudMeta: overlayMetaDiffer(prev?.sigwxCloudMeta, next?.sigwxCloudMeta),
    flightCategory: hashesDiffer(prev?.flightCategory, next?.flightCategory),
    ktg: hashesDiffer(prev?.ktg, next?.ktg),
  }
  if (prev?.viewRevision !== next?.viewRevision) {
    for (const key of Object.keys(changes)) changes[key] = true
  }
  return changes
}

export function hasSnapshotChanges(changes) {
  return Object.values(changes).some(Boolean)
}
