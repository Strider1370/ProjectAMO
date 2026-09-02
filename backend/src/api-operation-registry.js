import { CronExpressionParser } from 'cron-parser'

import { CATALOG } from './admin/data-health-catalog.js'

export const API_HUB_ENDPOINTS = {
  metar: 'METAR', taf: 'TAF', warning: '공항 경보', sigmet: 'SIGMET', airmet: 'AIRMET', airport_info: '공항 정보', takeoff_fcst: '이륙 예보', sigwx_low: '저고도 SIGWX', amos: 'AMOS', sfc_vis: '지상 시정', special_warning: '기상특보', uv: '자외선', lightning: '낙뢰', typhoon_now: '태풍 현황', typhoon_list: '태풍 목록', ground_forecast: '단기 예보', mid_land: '중기 육상예보', mid_ta: '중기 기온예보', asos_ceiling: 'ASOS 운고', kim_grid: 'KIM 격자', ktg: 'KTG 격자', radar_echo: '레이더 반사도', radar_qcd: '레이더 QCD (Echo Top)', radar_wissdom: 'WISSDOM', radar_qpf: 'QPF', radar_hsr: '레이더 HSR', radar_hci: '레이더 HCI', satellite_ir: 'GK2A IR', satellite_visible: 'GK2A 가시', satellite_fog: 'GK2A 안개', satellite_ci: 'GK2A CI', satellite_ctps: 'GK2A CTPS',
}

const pathMatchers = {
  metar: (p) => p.endsWith('/getMetar'), taf: (p) => p.endsWith('/getTaf'), warning: (p) => p.endsWith('/getWarning'), sigmet: (p) => p.endsWith('/getSigmet'), airmet: (p) => p.endsWith('/getAirmet'), airport_info: (p) => p.endsWith('/getAirPort'), takeoff_fcst: (p) => p.endsWith('/getAirInfo'), sigwx_low: (p) => p.includes('amo_sigwx'), amos: (p) => p.includes('amos.php'), sfc_vis: (p) => p.includes('nph-sfc_obs_nc_api'), special_warning: (p) => p.includes('wrn_now'), uv: (p) => p.includes('kma_sfctm_uv'), lightning: (p) => p.includes('lgt_pnt'), typhoon_now: (p) => p.includes('typ_now'), typhoon_list: (p) => p.includes('typ_lst'), ground_forecast: (p) => p.includes('getVilageFcst') || p.includes('getLandFcst'), mid_land: (p) => p.includes('getMidLandFcst'), mid_ta: (p) => p.includes('getMidTa'), asos_ceiling: (p) => p.includes('kma_sfctm2'), kim_grid: (p) => p.includes('nph-kim'), ktg: (p) => p.includes('amo_nwp_file_down'), radar_qcd: (p) => p.includes('rdr_site_file'), radar_echo: (p) => p.includes('rdr_cmp_file'), radar_wissdom: (p) => p.includes('nph-rdr_wis'), radar_qpf: (p) => p.includes('nph-qpf'), radar_hsr: (p) => p.includes('nph-rdr_cmp1'), radar_hci: (p) => p.includes('nph-rdr_cmp1'), satellite_ir: (p) => p.includes('/GK2A/LE1B/') && !p.includes('/VI006/'), satellite_visible: (p) => p.includes('/GK2A/LE1B/VI006/'), satellite_fog: (p) => p.includes('/GK2A/LE2/FOG/'), satellite_ci: (p) => p.includes('/GK2A/LE2/CI/'), satellite_ctps: (p) => p.includes('/GK2A/LE2/CTPS/'),
}

const health = { metar: ['metar'], taf: ['taf'], warning: ['warning'], sigmet: ['sigmet'], airmet: ['airmet'], airport_info: ['airport_info'], takeoff_fcst: ['takeoff_fcst'], sigwx_low: ['sigwx_low'], amos: ['amos'], special_warning: ['kma_special_warning'], lightning: ['lightning'], typhoon_now: ['typhoon'], typhoon_list: ['typhoon'], ground_forecast: ['ground_forecast'], mid_land: ['ground_forecast'], mid_ta: ['ground_forecast'], asos_ceiling: ['asos_ceiling'], kim_grid: ['kim_nwp'], ktg: ['ktg'], radar_echo: ['radar'], radar_qcd: ['echo_top'], radar_wissdom: ['wissdom'], radar_qpf: ['qpf'], radar_hsr: ['radar'], radar_hci: ['hci'], satellite_ir: ['satellite'], satellite_visible: ['satellite_visible'], satellite_fog: ['satellite'], satellite_ci: ['convective'], satellite_ctps: ['convective'], sfc_vis: ['environment'], uv: ['environment'] }
const category = (id) => ['kim_grid', 'ktg'].includes(id) ? 'kim_nwp' : id.startsWith('radar_') || id.startsWith('satellite_') ? 'radar_satellite' : 'aviation'
const policy = { timeoutMs: 10_000, maxRetries: 0, allowedOverrides: ['signal', 'headers', 'method', 'body'] }

export const API_OPERATION_REGISTRY = Object.entries(API_HUB_ENDPOINTS).map(([id, label]) => ({ id, label, provider: 'KMA API Hub', collectorType: null, dataHealthKeys: health[id] || ['environment'], callContract: { kind: 'conditional', label: '수집 시' }, credentialCategory: category(id), apiHub: true, requestPolicy: policy, match: (url) => url.hostname === 'apihub.kma.go.kr' && pathMatchers[id](url.pathname) && (id !== 'radar_hsr' || url.searchParams.get('cmp') !== 'HCI') && (id !== 'radar_hci' || url.searchParams.get('cmp') === 'HCI') }))
  .concat([
    { id: 'adsb', label: 'ADS-B', provider: 'ADS-B Exchange', collectorType: null, dataHealthKeys: [], callContract: { kind: 'on_demand' }, credentialCategory: null, apiHub: false, requestPolicy: policy, match: (url) => url.hostname.includes('adsb') },
    { id: 'iiac_arrivals', label: 'IIAC 도착편', provider: 'IIAC', collectorType: 'terminal_flights', dataHealthKeys: ['terminal_flights'], callContract: { kind: 'cron', expression: '*/10 6-18 * * *', timezone: 'Asia/Seoul' }, credentialCategory: null, apiHub: false, requestPolicy: policy, match: (url) => url.pathname.includes('getFltArrivalsDeOdp') },
    { id: 'kac_flights', label: 'KAC 운항편', provider: '한국공항공사', collectorType: 'terminal_flights', dataHealthKeys: ['terminal_flights'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, requestPolicy: policy, match: (url) => url.hostname.includes('airport.co.kr') && url.pathname.includes('getFlightStatusList') },
    { id: 'airkorea_pm', label: 'AirKorea PM', provider: 'AirKorea', collectorType: 'environment', dataHealthKeys: ['environment'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, requestPolicy: policy, match: (url) => url.pathname.includes('getMsrstnAcctoRltmMesureDnsty') },
    { id: 'noaa', label: 'NOAA Aviation Weather', provider: 'NOAA', collectorType: null, dataHealthKeys: ['metar_overseas', 'taf_overseas', 'sigmet_overseas'], callContract: { kind: 'conditional', label: '해외 기상 수집 시' }, credentialCategory: null, apiHub: false, requestPolicy: policy, match: (url) => url.hostname.includes('aviationweather.gov') },
    { id: 'rainviewer', label: 'RainViewer', provider: 'RainViewer', collectorType: 'rainviewer', dataHealthKeys: ['rainviewer'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, requestPolicy: policy, match: (url) => url.hostname.includes('rainviewer') },
    { id: 'met_norway', label: 'MET Norway', provider: 'MET Norway', collectorType: 'overseas_forecast', dataHealthKeys: ['overseas_forecast'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, requestPolicy: policy, match: (url) => url.hostname.includes('met.no') },
  ])

function registryError(code) { const error = new Error(code); error.code = code; return error }

export function assertApiOperationRegistry(registry = API_OPERATION_REGISTRY) {
  const ids = new Set(); const dataKeys = new Set(CATALOG.map((row) => row.key))
  for (const operation of registry) {
    if (!operation?.id || !operation.label || ids.has(operation.id)) throw registryError('invalid_api_operation_registry')
    ids.add(operation.id)
    if (!operation.requestPolicy || !Number.isFinite(operation.requestPolicy.timeoutMs) || operation.requestPolicy.timeoutMs <= 0 || !Number.isInteger(operation.requestPolicy.maxRetries) || operation.requestPolicy.maxRetries < 0 || !Array.isArray(operation.requestPolicy.allowedOverrides)) throw registryError('invalid_api_operation_policy')
    if (!operation.callContract || !['collector', 'cron', 'conditional', 'on_demand'].includes(operation.callContract.kind)) throw registryError('invalid_api_operation_contract')
    if (operation.callContract.kind === 'on_demand' ? operation.dataHealthKeys.length !== 0 : operation.dataHealthKeys.length === 0) throw registryError('missing_api_operation_data_health_keys')
    if (operation.dataHealthKeys.some((key) => !dataKeys.has(key))) throw registryError('invalid_api_operation_data_health_key')
  }
  for (let i = 0; i < registry.length; i += 1) for (let j = i + 1; j < registry.length; j += 1) if (registry[i].match(new URL('https://example.invalid/')) && registry[j].match(new URL('https://example.invalid/'))) throw registryError('ambiguous_api_operation_matcher')
  return registry
}

export function resolveApiOperation({ id, url }) {
  const requestUrl = url instanceof URL ? url : new URL(url)
  const matches = API_OPERATION_REGISTRY.filter((operation) => operation.match(requestUrl))
  if (!id) { if (matches.length !== 1) throw registryError('unknown_api_operation'); return matches[0] }
  const operation = API_OPERATION_REGISTRY.find((item) => item.id === id)
  if (!operation) throw registryError('unknown_api_operation')
  if (!operation.match(requestUrl)) throw registryError('api_operation_id_url_mismatch')
  return operation
}

function hourRangeLabel(hour) { const [from, to] = hour.split('-').map((value) => value.padStart(2, '0')); return `${from}:00–${to}:59` }
function cadenceLabel(expression) { const [minute, hour] = expression.split(' '); if (minute.startsWith('*/') && hour === '*') return `${minute.slice(2)}분마다`; if (minute.startsWith('*/') && /^\d+-\d+$/.test(hour)) return `${minute.slice(2)}분마다 (${hourRangeLabel(hour)})`; return `${minute}분 ${hour}시` }
function operatingHoursLabel(expression, timezone) { const hour = expression.split(' ')[1]; return /^\d+-\d+$/.test(hour) ? `${hourRangeLabel(hour)} ${timezone === 'Asia/Seoul' ? 'KST' : timezone}` : null }

export function describeExpectedApiCall(operation, collector, nowMs) {
  const contract = operation.callContract
  if (contract.kind === 'on_demand') return { kind: 'on_demand', label: '온디맨드' }
  if (contract.kind === 'conditional') return { kind: 'conditional', label: contract.label }
  const schedule = contract.kind === 'collector' ? collector?.schedule : contract
  if (!schedule?.expression || !schedule.timezone) throw registryError('unresolved_api_operation_collector')
  const parsed = CronExpressionParser.parse(schedule.expression, { currentDate: new Date(nowMs), tz: schedule.timezone })
  const nextExpectedAt = parsed.next().toISOString()
  return { kind: 'scheduled', cadenceLabel: cadenceLabel(schedule.expression), timezone: schedule.timezone, operatingHoursLabel: operatingHoursLabel(schedule.expression, schedule.timezone), cronExpression: schedule.expression, nextExpectedAt }
}

assertApiOperationRegistry()
