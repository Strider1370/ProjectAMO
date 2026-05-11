function hashesDiffer(prev, next) {
  return (prev?.hash || null) !== (next?.hash || null)
}

function framesDiffer(prev, next) {
  return (prev?.tm || null) !== (next?.tm || null)
}

function overlayMetaDiffer(prev, next) {
  return (prev?.tmfc || null) !== (next?.tmfc || null)
    || (prev?.source_hash || null) !== (next?.source_hash || null)
    || (prev?.updated_at || null) !== (next?.updated_at || null)
    || (prev?.render_version || null) !== (next?.render_version || null)
}

export function detectSnapshotChanges(prev, next) {
  return {
    metar: hashesDiffer(prev?.metar, next?.metar),
    taf: hashesDiffer(prev?.taf, next?.taf),
    warning: hashesDiffer(prev?.warning, next?.warning),
    sigmet: hashesDiffer(prev?.sigmet, next?.sigmet),
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
    satMeta: framesDiffer(prev?.satMeta, next?.satMeta),
    sigwxFrontMeta: overlayMetaDiffer(prev?.sigwxFrontMeta, next?.sigwxFrontMeta),
    sigwxCloudMeta: overlayMetaDiffer(prev?.sigwxCloudMeta, next?.sigwxCloudMeta),
  }
}

export function hasSnapshotChanges(changes) {
  return Object.values(changes).some(Boolean)
}
