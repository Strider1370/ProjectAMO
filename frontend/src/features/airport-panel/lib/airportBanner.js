const PRECIPITATION = /(?:TS|SH|RA|SN|DZ|SG|IC|PL|GR|GS|UP)/
const LOW_VISIBILITY = /(?:FG|BR|HZ|FU|VA|DU|SA)/

function observationText(observation) {
  return [
    observation?.display?.weather_icon,
    observation?.display?.weather,
    ...((observation?.weather || []).flatMap((weather) => [weather?.descriptor, ...(weather?.phenomena || [])])),
  ].filter(Boolean).join(' ').toUpperCase()
}

function isAirportDaytime(time, longitude) {
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return true
  const offset = Number.isFinite(longitude) ? longitude / 15 : 9
  const hour = (date.getUTCHours() + offset + 24) % 24
  return hour >= 6 && hour < 18
}

export function resolveAirportBanner(metar, airport) {
  const observation = metar?.observation || {}
  const weather = observationText(observation)
  if (PRECIPITATION.test(weather)) return 'precipitation'
  if (LOW_VISIBILITY.test(weather)) return 'fog'
  if (!isAirportDaytime(metar?.header?.observation_time || metar?.header?.issue_time, airport?.lon)) return 'night'

  const clouds = [
    ...(observation.clouds || []).map((cloud) => cloud?.amount),
    observation?.display?.clouds,
  ].filter(Boolean).join(' ').toUpperCase()
  if (/(?:OVC|BKN|VV)/.test(clouds)) return 'overcast'
  if (/(?:SCT|FEW)/.test(clouds)) return 'partly-cloudy'
  return 'clear'
}
