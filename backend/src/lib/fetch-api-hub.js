import apiHubUsage from '../api-hub-usage.js'

export function createFetchApiHub({ usage = apiHubUsage, fetchImpl = fetch } = {}) {
  return async function fetchApiHub({ credential, url, options = {}, endpoint }) {
    usage.assertAllowed(credential)
    const upstream = await fetchImpl(url, options)
    const body = await upstream.arrayBuffer()
    await usage.record(credential, { bytes: body.byteLength, status: upstream.status, endpoint })
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  }
}

export const fetchApiHub = createFetchApiHub()

export function endpointFor(url) {
  const pathname = url.pathname
  if (pathname.endsWith('/getMetar')) return 'metar'
  if (pathname.endsWith('/getTaf')) return 'taf'
  if (pathname.endsWith('/getWarning')) return 'warning'
  if (pathname.endsWith('/getSigmet')) return 'sigmet'
  if (pathname.endsWith('/getAirmet')) return 'airmet'
  if (pathname.endsWith('/getAirPort')) return 'airport_info'
  if (pathname.endsWith('/getAirInfo')) return 'takeoff_fcst'
  if (pathname.includes('amo_sigwx')) return 'sigwx_low'
  if (pathname.includes('amos.php')) return 'amos'
  if (pathname.includes('wrn_now')) return 'special_warning'
  if (pathname.includes('kma_sfctm_uv')) return 'uv'
  if (pathname.includes('lgt_pnt')) return 'lightning'
  if (pathname.includes('typ_now')) return 'typhoon_now'
  if (pathname.includes('typ_lst')) return 'typhoon_list'
  if (pathname.includes('getVilageFcst') || pathname.includes('getLandFcst')) return 'ground_forecast'
  if (pathname.includes('kma_sfctm2')) return 'asos_ceiling'
  if (pathname.includes('nph-sfc_obs_nc_api')) return 'sfc_vis'
  if (pathname.includes('nph-kim')) return 'kim_grid'
  if (pathname.includes('amo_nwp_file_down')) return 'ktg'
  if (pathname.includes('rdr_site_file')) return 'radar_qcd'
  if (pathname.includes('rdr_cmp_file')) return 'radar_echo'
  if (pathname.includes('nph-rdr_wis')) return 'radar_wissdom'
  if (pathname.includes('nph-qpf')) return 'radar_qpf'
  if (pathname.includes('nph-rdr_cmp1')) return url.searchParams.get('cmp') === 'HCI' ? 'radar_hci' : 'radar_hsr'
  if (pathname.includes('/GK2A/LE1B/')) return pathname.includes('/VI006/') ? 'satellite_visible' : 'satellite_ir'
  if (pathname.includes('/GK2A/LE2/FOG/')) return 'satellite_fog'
  if (pathname.includes('/GK2A/LE2/CI/')) return 'satellite_ci'
  if (pathname.includes('/GK2A/LE2/CTPS/')) return 'satellite_ctps'
  return null
}

let installed = false
export function installApiHubFetchGuard() {
  if (installed) return
  installed = true
  const rawFetch = globalThis.fetch
  const guardedFetch = createFetchApiHub({ fetchImpl: rawFetch })
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.hostname !== 'apihub.kma.go.kr' || !url.searchParams.has('authKey')) return rawFetch(input, options)
    const endpoint = endpointFor(url)
    if (!endpoint) {
      const error = new Error('unknown_api_hub_endpoint')
      error.code = 'unknown_api_hub_endpoint'
      throw error
    }
    return guardedFetch({ credential: url.searchParams.get('authKey'), url: input, options, endpoint })
  }
}
