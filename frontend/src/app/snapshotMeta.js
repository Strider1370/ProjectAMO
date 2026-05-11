function hashesDiffer(prev, next) {
  return (prev?.hash || null) !== (next?.hash || null)
}

function framesDiffer(prev, next) {
  return (prev?.tm || null) !== (next?.tm || null)
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
    airportInfo: hashesDiffer(prev?.airportInfo, next?.airportInfo),
    echoMeta: framesDiffer(prev?.echoMeta, next?.echoMeta),
    satMeta: framesDiffer(prev?.satMeta, next?.satMeta),
  }
}

export function hasSnapshotChanges(changes) {
  return Object.values(changes).some(Boolean)
}
