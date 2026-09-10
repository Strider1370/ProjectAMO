import { mergeAdvisoryPayloads } from '../../../api/weatherApi.js'

export function organizationMapWeatherProps({ bundle, situation, dataMode = 'live', layerWeather } = {}) {
  // A presentation must never borrow a newer observation from the lounge.
  const weather = dataMode === 'pinned'
    ? bundle?.mapData || {}
    : { ...(situation?.mapData || situation?.weather || bundle?.mapData || {}), ...layerWeather }
  return {
    airports: weather.airports || [],
    metarData: weather.metar || null,
    hsrMeta: weather.hsrMeta || null,
    satMeta: weather.satMeta || null,
    satVisibleMeta: weather.satVisibleMeta || null,
    hciMeta: weather.hciMeta || null,
    wissdomMeta: weather.wissdomMeta || null,
    qpfMeta: weather.qpfMeta || null,
    echoTopMeta: weather.echoTopMeta || null,
    rainviewerMeta: weather.rainviewerMeta || null,
    convectiveMeta: weather.convectiveMeta || null,
    sigmetData: mergeAdvisoryPayloads(weather.sigmet, weather.sigmetOverseas),
    airmetData: weather.airmet || null,
    lightningData: weather.lightning || null,
    sigwxLowData: weather.sigwxLow || null,
    sigwxLowHistoryData: weather.sigwxLowHistory || null,
    sigwxFrontMeta: weather.sigwxFrontMeta || null,
    sigwxCloudMeta: weather.sigwxCloudMeta || null,
    notamData: weather.notam || null,
  }
}
