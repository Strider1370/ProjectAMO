const COORDINATE = /^([NS])(\d{2})(\d{2}\.\d)([EW])(\d{3})(\d{2}\.\d)$/i

function normalize(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function parseCoordinateToken(value) {
  const match = normalize(value).match(COORDINATE)
  if (!match) return null
  const lat = Number(match[2]) + Number(match[3]) / 60
  const lon = Number(match[5]) + Number(match[6]) / 60
  if (lat > 90 || lon > 180) throw new Error('좌표 범위를 확인하세요.')
  return {
    lat: Number((match[1] === 'S' ? -lat : lat).toFixed(4)),
    lon: Number((match[4] === 'W' ? -lon : lon).toFixed(4)),
  }
}

export function formatCoordinateToken({ lat, lon }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('좌표 범위를 확인하세요.')
  }
  const format = (value, positive, negative, width) => {
    const hemisphere = value < 0 ? negative : positive
    const absolute = Math.abs(value)
    let degrees = Math.floor(absolute)
    let minutes = Number(((absolute - degrees) * 60).toFixed(1))
    if (minutes >= 60) { degrees += 1; minutes = 0 }
    return `${hemisphere}${String(degrees).padStart(width, '0')}${minutes.toFixed(1).padStart(4, '0')}`
  }
  return `${format(lat, 'N', 'S', 2)}${format(lon, 'E', 'W', 3)}`
}

export function parseManualRouteString(text, { flightRule = 'IFR', userWaypoints = [] } = {}) {
  const values = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  if (values.length === 0) throw new Error('FIX 또는 좌표를 입력하세요.')
  const knownUserWaypoints = new Map(userWaypoints.map((waypoint) => [normalize(waypoint.name), waypoint]))
  const toTerm = (value) => {
    const coordinate = parseCoordinateToken(value)
    if (coordinate) return { kind: 'coordinate', coordinate }
    const name = normalize(value)
    if (!name) throw new Error('빈 FIX는 사용할 수 없습니다.')
    return knownUserWaypoints.has(name)
      ? { kind: 'user-waypoint', id: knownUserWaypoints.get(name).id, name }
      : { kind: 'fix', id: name }
  }
  const terms = [toTerm(values[0])]
  const connectors = []
  const legIntents = []
  for (let index = 1; index < values.length;) {
    const token = normalize(values[index])
    const isConnector = token === 'DCT' || /^[A-Z]\d{1,4}[A-Z]?$/i.test(token)
    if (isConnector) {
      if (flightRule !== 'IFR' && token !== 'DCT') throw new Error('VFR 문자열에는 항공로를 사용할 수 없습니다.')
      if (index + 1 >= values.length) break
      connectors.push(token)
      legIntents.push(token === 'DCT' ? { kind: 'dct' } : { kind: 'airway', routeId: token })
      terms.push(toTerm(values[index + 1]))
      index += 2
    } else {
      connectors.push('DCT')
      legIntents.push({ kind: 'auto' })
      terms.push(toTerm(values[index]))
      index += 1
    }
  }
  return { terms, connectors, legIntents }
}

export function formatManualRouteString({ terms = [], connectors = [], legIntents = [], userWaypoints = [] } = {}) {
  if (terms.length === 0 || (legIntents.length > 0 ? legIntents.length : connectors.length) !== terms.length - 1) return ''
  const names = new Map(userWaypoints.map((waypoint) => [waypoint.id, waypoint.name]))
  const result = []
  terms.forEach((term, index) => {
    result.push(term.kind === 'coordinate' ? formatCoordinateToken(term.coordinate) : term.kind === 'user-waypoint' ? names.get(term.id) : term.id)
    const intent = legIntents[index]
    const connector = intent?.kind === 'airway' ? intent.routeId : intent?.kind === 'dct' ? 'DCT' : intent?.kind === 'auto' ? null : connectors[index]
    if (connector) result.push(connector)
  })
  return result.join(' ')
}

export function parseVfrDraftText(text, { departureAirport, arrivalAirport, userWaypoints = [] } = {}) {
  const departure = normalize(departureAirport)
  const arrival = normalize(arrivalAirport)
  const parsed = parseManualRouteString(text, { flightRule: 'VFR', userWaypoints })
  const labels = parsed.terms.map((term) => term.kind === 'coordinate' ? formatCoordinateToken(term.coordinate) : term.kind === 'user-waypoint'
    ? userWaypoints.find((waypoint) => waypoint.id === term.id)?.name
    : term.id)
  if (labels.length < 2 || labels[0] !== departure || labels.at(-1) !== arrival) {
    throw new Error('출발/도착 공항이 선택값과 다릅니다.')
  }
  if (parsed.legIntents.some((intent) => intent.kind !== 'dct')) throw new Error('VFR 문자열에는 DCT만 사용할 수 있습니다.')
  const middle = parsed.terms.slice(1, -1)
  if (middle.some((term) => term.kind === 'fix' && /^[A-Z]{4}$/.test(term.id))) {
    throw new Error('중간 공항 ICAO는 사용할 수 없습니다.')
  }
  return {
    enroute: {
      terms: middle,
      connectors: Array.from({ length: Math.max(0, middle.length - 1) }, () => 'DCT'),
      legIntents: Array.from({ length: Math.max(0, middle.length - 1) }, () => ({ kind: 'dct' })),
      userWaypoints,
    },
    displayText: formatVfrDraftText({ departureAirport: departure, arrivalAirport: arrival, enroute: { terms: middle, userWaypoints } }),
  }
}

export function formatVfrDraftText({ departureAirport, arrivalAirport, enroute = {} } = {}) {
  const departure = normalize(departureAirport)
  const arrival = normalize(arrivalAirport)
  if (!departure || !arrival) return ''
  const middle = formatManualRouteString({
    terms: enroute.terms ?? [],
    connectors: enroute.connectors,
    legIntents: enroute.legIntents ?? Array.from({ length: Math.max(0, (enroute.terms?.length ?? 0) - 1) }, () => ({ kind: 'dct' })),
    userWaypoints: enroute.userWaypoints ?? [],
  })
  return [departure, middle, arrival].filter(Boolean).join(' DCT ')
}
