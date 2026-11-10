export const SATELLITE_NC_PATH = '/api/typ01/url/sat_file_nc_down.php'
export const SATELLITE_NC_URL = `https://apihub.kma.go.kr${SATELLITE_NC_PATH}`

// tm is the upstream UTC observation time, never the KST display filename.
export function buildSatelliteNcUrl({ endpoint = SATELLITE_NC_URL, level, element, area = 'ko', tm, key, map }) {
  if (!/^\d{12}$/.test(tm || '')) throw new Error('Invalid satellite UTC timestamp')
  const url = new URL(endpoint)
  url.searchParams.set('lvl', level.toLowerCase())
  url.searchParams.set(level.toLowerCase() === 'l1b' ? 'chn' : 'data', element.toLowerCase())
  url.searchParams.set('area', area.toLowerCase())
  url.searchParams.set('tm', tm)
  if (map) url.searchParams.set('map', map)
  url.searchParams.set('authKey', key)
  return url.toString()
}

export function satelliteOperationId(url) {
  if (url.pathname !== SATELLITE_NC_PATH) return null
  const level = url.searchParams.get('lvl')?.toLowerCase()
  const element = url.searchParams.get(level === 'l1b' ? 'chn' : 'data')?.toLowerCase()
  if (level === 'l1b') return element === 'vi006' ? 'satellite_visible' : element === 'ir105' ? 'satellite_ir' : null
  if (level === 'l2') return element === 'fog' ? 'satellite_fog' : element === 'ctps' ? 'satellite_ctps' : null
  return null
}
