import { CronExpressionParser } from 'cron-parser'

import { CATALOG } from './admin/data-health-catalog.js'
import config from './config.js'
import { COLLECTOR_REGISTRY } from './collector-registry.js'

export const API_HUB_ENDPOINTS = {
  metar: 'METAR', taf: 'TAF', warning: '공항 경보', sigmet: 'SIGMET', airmet: 'AIRMET', airport_info: '공항 정보', takeoff_fcst: '이륙 예보', sigwx_low: '저고도 SIGWX', amos: 'AMOS', sfc_vis: '지상 시정', special_warning: '기상특보', uv: '자외선', lightning: '낙뢰', typhoon_now: '태풍 현황', typhoon_list: '태풍 목록', ground_forecast: '단기 예보', mid_land: '중기 육상예보', mid_ta: '중기 기온예보', asos_ceiling: 'ASOS 운고', kim_grid: 'KIM 격자', ktg: 'KTG 격자', radar_echo: '레이더 반사도', radar_qcd: '레이더 QCD (Echo Top)', radar_wissdom: 'WISSDOM', radar_qpf: 'QPF', radar_hsr: '레이더 HSR', radar_hci: '레이더 HCI', satellite_ir: 'GK2A IR', satellite_visible: 'GK2A 가시', satellite_fog: 'GK2A 안개', satellite_ci: 'GK2A CI', satellite_ctps: 'GK2A CTPS',
}

const pathMatchers = {
  metar: (p) => p.endsWith('/getMetar'), taf: (p) => p.endsWith('/getTaf'), warning: (p) => p.endsWith('/getWarning'), sigmet: (p) => p.endsWith('/getSigmet'), airmet: (p) => p.endsWith('/getAirmet'), airport_info: (p) => p.endsWith('/getAirPort'), takeoff_fcst: (p) => p.endsWith('/getAirInfo'), sigwx_low: (p) => p.includes('amo_sigwx'), amos: (p) => p.includes('amos.php'), sfc_vis: (p) => p.includes('nph-sfc_obs_nc_api'), special_warning: (p) => p.includes('wrn_now'), uv: (p) => p.includes('kma_sfctm_uv'), lightning: (p) => p.includes('lgt_pnt'), typhoon_now: (p) => p.includes('typ_now'), typhoon_list: (p) => p.includes('typ_lst'), ground_forecast: (p) => p.includes('getVilageFcst') || p.includes('getLandFcst'), mid_land: (p) => p.includes('getMidLandFcst'), mid_ta: (p) => p.includes('getMidTa'), asos_ceiling: (p) => p.includes('kma_sfctm2'), kim_grid: (p) => p.includes('nph-kim'), ktg: (p) => p.includes('amo_nwp_file_down'), radar_qcd: (p) => p.includes('rdr_site_file'), radar_echo: (p) => p.includes('rdr_cmp_file'), radar_wissdom: (p) => p.includes('nph-rdr_wis'), radar_qpf: (p) => p.includes('nph-qpf'), radar_hsr: (p) => p.includes('nph-rdr_cmp1'), radar_hci: (p) => p.includes('nph-rdr_cmp1'), satellite_ir: (p) => p.includes('/GK2A/LE1B/') && !p.includes('/VI006/'), satellite_visible: (p) => p.includes('/GK2A/LE1B/VI006/'), satellite_fog: (p) => p.includes('/GK2A/LE2/FOG/'), satellite_ci: (p) => p.includes('/GK2A/LE2/CI/'), satellite_ctps: (p) => p.includes('/GK2A/LE2/CTPS/'),
}

const health = { metar: ['metar'], taf: ['taf'], warning: ['warning'], sigmet: ['sigmet'], airmet: ['airmet'], airport_info: ['airport_info'], takeoff_fcst: ['takeoff_fcst'], sigwx_low: ['sigwx_low'], amos: ['amos'], special_warning: ['kma_special_warning'], lightning: ['lightning'], typhoon_now: ['typhoon'], typhoon_list: ['typhoon'], ground_forecast: ['ground_forecast'], mid_land: ['ground_forecast'], mid_ta: ['ground_forecast'], asos_ceiling: ['asos_ceiling'], kim_grid: ['kim_nwp'], ktg: ['ktg'], radar_echo: ['radar'], radar_qcd: ['echo_top'], radar_wissdom: ['wissdom'], radar_qpf: ['qpf'], radar_hsr: ['radar'], radar_hci: ['hci'], satellite_ir: ['satellite'], satellite_visible: ['satellite_visible'], satellite_fog: ['satellite'], satellite_ci: ['convective'], satellite_ctps: ['convective'], sfc_vis: ['environment'], uv: ['environment'] }
const category = (id) => ['kim_grid', 'ktg'].includes(id) ? 'kim_nwp' : id.startsWith('radar_') || id.startsWith('satellite_') ? 'radar_satellite' : 'aviation'
const policy = { timeoutMs: 10_000, maxAttempts: 1, allowedOverrides: ['signal', 'headers', 'method', 'body'] }

const canonicalPaths = {
  metar: '/api/typ02/openApi/AmmIwxxmService/getMetar', taf: '/api/typ02/openApi/AmmIwxxmService/getTaf', warning: '/api/typ02/openApi/AmmService/getWarning', sigmet: '/api/typ02/openApi/AmmIwxxmService/getSigmet', airmet: '/api/typ02/openApi/AmmIwxxmService/getAirmet', airport_info: '/api/typ02/openApi/AirPortService/getAirPort', takeoff_fcst: '/api/typ02/openApi/AirInfoService/getAirInfo', sigwx_low: '/api/typ01/url/amo_sigwx.php', amos: '/api/typ01/url/amos.php', sfc_vis: '/api/typ01/cgi-bin/url/nph-sfc_obs_nc_api', special_warning: '/api/typ01/url/wrn_now_data_new.php', uv: '/api/typ01/url/kma_sfctm_uv.php', lightning: '/api/typ01/url/lgt_pnt.php', typhoon_now: '/api/typ01/url/typ_now.php', typhoon_list: '/api/typ01/url/typ_lst.php', ground_forecast: '/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst', mid_land: '/api/typ02/openApi/MidFcstInfoService/getMidLandFcst', mid_ta: '/api/typ02/openApi/MidFcstInfoService/getMidTa', asos_ceiling: '/api/typ01/url/kma_sfctm2.php', kim_grid: '/api/typ01/cgi-bin/url/nph-kim_nc_xy_txt2', ktg: '/api/typ01/url/amo_nwp_file_down.php', radar_echo: '/api/typ04/url/rdr_cmp_file.php', radar_qcd: '/api/typ04/url/rdr_site_file.php', radar_wissdom: '/api/typ03/cgi/rdr/nph-rdr_wis.php', radar_qpf: '/api/typ03/cgi/rdr/nph-qpf.php', radar_hsr: '/api/typ03/cgi/rdr/nph-rdr_cmp1.php?cmp=HSR', radar_hci: '/api/typ03/cgi/rdr/nph-rdr_cmp1.php?cmp=HCI', satellite_ir: '/api/typ05/api/GK2A/LE1B/IR105/KO/data', satellite_visible: '/api/typ05/api/GK2A/LE1B/VI006/KO/data', satellite_fog: '/api/typ05/api/GK2A/LE2/FOG/KO/data', satellite_ci: '/api/typ05/api/GK2A/LE2/CI/KO/data', satellite_ctps: '/api/typ05/api/GK2A/LE2/CTPS/KO/data',
}
const collectorById = { metar: 'metar', taf: 'taf', warning: 'warning', sigmet: 'sigmet', airmet: 'airmet', airport_info: 'airport_info', takeoff_fcst: 'takeoff_fcst', sigwx_low: 'sigwx_low', amos: 'amos', special_warning: 'kma_special_warning', lightning: 'lightning', typhoon_now: 'typhoon', typhoon_list: 'typhoon', ground_forecast: 'ground_forecast', mid_land: 'ground_forecast', mid_ta: 'ground_forecast', asos_ceiling: 'asos_ceiling', kim_grid: 'kim_surface_wind', ktg: 'ktg', radar_qcd: 'echo_top', radar_wissdom: 'wissdom', radar_qpf: 'qpf', radar_hsr: 'hsr', radar_hci: 'hci', sfc_vis: 'flight_category' }
const groundForecastFallback = {
  trigger: { causeCode: 'SELF_SIGNED_CERT_IN_CHAIN' },
  transport: { kind: 'https_request', rejectUnauthorized: false, headers: { 'User-Agent': 'KMA-Weather-Dashboard/1.0' } },
  maxAdditionalAttempts: 1,
}
function apiHubPolicyFor(id) {
  if (['radar_wissdom', 'radar_qpf', 'radar_hsr', 'radar_hci'].includes(id)) return { timeoutMs: 30_000, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (id === 'asos_ceiling') return { timeoutMs: config.asos_ceiling.timeout_ms, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (id === 'radar_qcd') return { timeoutMs: config.radar_echo_top.timeout_ms, maxAttempts: 1 + config.radar_echo_top.retry, allowedOverrides: ['signal'] }
  if (['radar_echo', 'sfc_vis'].includes(id)) return { timeoutMs: 30_000, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (id === 'kim_grid') return { timeoutMs: config.kim_surface_wind.timeout_ms, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (id === 'ktg') return { timeoutMs: config.ktg.timeout_ms, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (id.startsWith('satellite_')) return { timeoutMs: config.satellite.timeout_ms, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (id === 'amos') return { timeoutMs: config.amos.timeout_ms, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (id === 'lightning') return { timeoutMs: 30_000, maxAttempts: 3, retryDelayMs: 3_000, allowedOverrides: ['signal'] }
  if (id === 'typhoon_now' || id === 'typhoon_list') return { timeoutMs: 15_000, maxAttempts: 1, allowedOverrides: ['signal'] }
  if (['ground_forecast', 'mid_land', 'mid_ta'].includes(id)) return { timeoutMs: config.ground_forecast.timeout_ms, maxAttempts: 1, allowedOverrides: ['signal'], transportFallback: groundForecastFallback }
  if (id === 'uv') return { timeoutMs: config.environment.timeout_ms, maxAttempts: 1, allowedOverrides: ['signal'] }
  return { timeoutMs: config.api.timeout_ms, maxAttempts: config.api.max_retries, allowedOverrides: ['signal', 'maxAttempts', 'retryDelayMs', 'skipApiHeader'] }
}

export const API_OPERATION_REGISTRY = Object.entries(API_HUB_ENDPOINTS).map(([id, label]) => ({ id, label, provider: 'KMA API Hub', collectorType: collectorById[id] || null, dataHealthKeys: health[id] || ['environment'], callContract: collectorById[id] ? { kind: 'collector' } : { kind: 'conditional', label: '수집 시' }, credentialCategory: category(id), apiHub: true, canonicalUrl: `https://apihub.kma.go.kr${canonicalPaths[id]}`, requestPolicy: apiHubPolicyFor(id), match: (url) => url.hostname === 'apihub.kma.go.kr' && pathMatchers[id](url.pathname) && (id !== 'radar_hsr' || url.searchParams.get('cmp') !== 'HCI') && (id !== 'radar_hci' || url.searchParams.get('cmp') === 'HCI') }))
  .concat([
    { id: 'adsb', label: 'ADS-B', provider: 'ADS-B Exchange', collectorType: null, dataHealthKeys: [], callContract: { kind: 'on_demand' }, credentialCategory: null, apiHub: false, canonicalUrl: `${config.adsb.url}/point/36.5/127.5/250`, requestPolicy: { ...policy, timeoutMs: config.adsb.timeout_ms }, match: (url) => url.hostname === new URL(config.adsb.url).hostname && url.pathname.startsWith(new URL(config.adsb.url).pathname) },
    { id: 'iiac_arrivals', label: 'IIAC 도착편', provider: 'IIAC', collectorType: 'terminal_flights', dataHealthKeys: ['terminal_flights'], callContract: { kind: 'cron', expression: '*/10 6-19 * * *', timezone: 'Asia/Seoul' }, credentialCategory: null, apiHub: false, canonicalUrl: config.api.iiac_arrivals_url, requestPolicy: { ...policy, timeoutMs: config.api.timeout_ms }, match: (url) => url.hostname === new URL(config.api.iiac_arrivals_url).hostname && url.pathname === new URL(config.api.iiac_arrivals_url).pathname },
    { id: 'kac_flights', label: 'KAC 운항편', provider: '한국공항공사', collectorType: 'terminal_flights', dataHealthKeys: ['terminal_flights'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, canonicalUrl: config.api.kac_flight_url, requestPolicy: { ...policy, timeoutMs: config.api.timeout_ms }, match: (url) => url.hostname === new URL(config.api.kac_flight_url).hostname && url.pathname === new URL(config.api.kac_flight_url).pathname },
    { id: 'airkorea_pm', label: 'AirKorea PM', provider: 'AirKorea', collectorType: 'environment', dataHealthKeys: ['environment'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, canonicalUrl: config.api.airkorea_pm_url, requestPolicy: { ...policy, timeoutMs: config.environment.timeout_ms }, match: (url) => url.hostname === new URL(config.api.airkorea_pm_url).hostname && url.pathname === new URL(config.api.airkorea_pm_url).pathname },
    ...[['noaa_metar', 'METAR 해외', 'metar_overseas', '/metar'], ['noaa_taf', 'TAF 해외', 'taf_overseas', '/taf'], ['noaa_sigmet', 'SIGMET 해외', 'sigmet_overseas', '/isigmet']].map(([id, label, collectorType, pathname]) => ({ id, label, provider: 'NOAA', collectorType, dataHealthKeys: [collectorType], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, canonicalUrl: `${config.noaa.base_url}${pathname}`, requestPolicy: { ...policy, timeoutMs: config.noaa.timeout_ms }, match: (url) => url.hostname === new URL(config.noaa.base_url).hostname && url.pathname === `${new URL(config.noaa.base_url).pathname}${pathname}` })),
    { id: 'rainviewer', label: 'RainViewer', provider: 'RainViewer', collectorType: 'rainviewer', dataHealthKeys: ['rainviewer'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, canonicalUrl: config.rainviewer.url, requestPolicy: { ...policy, timeoutMs: config.rainviewer.timeout_ms }, match: (url) => url.hostname === new URL(config.rainviewer.url).hostname && url.pathname === new URL(config.rainviewer.url).pathname },
    { id: 'met_norway', label: 'MET Norway', provider: 'MET Norway', collectorType: 'overseas_forecast', dataHealthKeys: ['overseas_forecast'], callContract: { kind: 'collector' }, credentialCategory: null, apiHub: false, canonicalUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/compact', requestPolicy: { ...policy, timeoutMs: config.api.timeout_ms }, match: (url) => url.hostname === 'api.met.no' && url.pathname === '/weatherapi/locationforecast/2.0/compact' },
  ])

function registryError(code) { const error = new Error(code); error.code = code; return error }

const ALLOWED_OVERRIDES = new Set(['signal', 'headers', 'method', 'body', 'maxAttempts', 'retryDelayMs', 'skipApiHeader'])

export function assertApiOperationRegistry(registry = API_OPERATION_REGISTRY, collectors = COLLECTOR_REGISTRY) {
  const ids = new Set(); const dataKeys = new Set(CATALOG.map((row) => row.key)); const collectorTypes = new Set(collectors.map((item) => item.type))
  for (const operation of registry) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw registryError('invalid_api_operation_registry')
    const operationKeys = Object.keys(operation).sort()
    const requiredOperationKeys = ['apiHub', 'callContract', 'canonicalUrl', 'collectorType', 'credentialCategory', 'dataHealthKeys', 'id', 'label', 'match', 'provider', 'requestPolicy']
    if (!operation?.id || typeof operation.id !== 'string' || !operation.id || operationKeys.length !== requiredOperationKeys.length || !requiredOperationKeys.every((key, index) => key === operationKeys[index]) || typeof operation.label !== 'string' || !operation.label || typeof operation.provider !== 'string' || !operation.provider || typeof operation.apiHub !== 'boolean' || typeof operation.match !== 'function' || typeof operation.canonicalUrl !== 'string' || !operation.canonicalUrl || !Array.isArray(operation.dataHealthKeys) || (operation.collectorType !== null && typeof operation.collectorType !== 'string') || ids.has(operation.id)) throw registryError('invalid_api_operation_registry')
    ids.add(operation.id)
    const policyKeys = Object.keys(operation.requestPolicy || {}).sort()
    const requiredPolicyKeys = ['allowedOverrides', 'maxAttempts', 'timeoutMs', ...(operation.requestPolicy?.retryDelayMs === undefined ? [] : ['retryDelayMs']), ...(operation.requestPolicy?.transportFallback === undefined ? [] : ['transportFallback'])].sort()
    const fallback = operation.requestPolicy?.transportFallback
    const validFallback = fallback === undefined || (fallback && typeof fallback === 'object' && !Array.isArray(fallback) && Object.keys(fallback).sort().join(',') === 'maxAdditionalAttempts,transport,trigger' && Number.isInteger(fallback.maxAdditionalAttempts) && fallback.maxAdditionalAttempts === 1 && fallback.trigger && typeof fallback.trigger === 'object' && !Array.isArray(fallback.trigger) && Object.keys(fallback.trigger).join(',') === 'causeCode' && fallback.trigger.causeCode === 'SELF_SIGNED_CERT_IN_CHAIN' && fallback.transport && typeof fallback.transport === 'object' && !Array.isArray(fallback.transport) && Object.keys(fallback.transport).sort().join(',') === 'headers,kind,rejectUnauthorized' && fallback.transport.kind === 'https_request' && fallback.transport.rejectUnauthorized === false && fallback.transport.headers && typeof fallback.transport.headers === 'object' && !Array.isArray(fallback.transport.headers) && Object.keys(fallback.transport.headers).join(',') === 'User-Agent' && fallback.transport.headers['User-Agent'] === 'KMA-Weather-Dashboard/1.0')
    if (!operation.requestPolicy || policyKeys.length !== requiredPolicyKeys.length || !requiredPolicyKeys.every((key, index) => key === policyKeys[index]) || !Number.isFinite(operation.requestPolicy.timeoutMs) || operation.requestPolicy.timeoutMs <= 0 || !Number.isInteger(operation.requestPolicy.maxAttempts) || operation.requestPolicy.maxAttempts < 1 || (operation.requestPolicy.retryDelayMs !== undefined && (!Number.isFinite(operation.requestPolicy.retryDelayMs) || operation.requestPolicy.retryDelayMs < 0)) || !validFallback || !Array.isArray(operation.requestPolicy.allowedOverrides) || operation.requestPolicy.allowedOverrides.some((key) => typeof key !== 'string' || !ALLOWED_OVERRIDES.has(key))) throw registryError('invalid_api_operation_policy')
    if (!operation.callContract || !['collector', 'cron', 'conditional', 'on_demand'].includes(operation.callContract.kind)) throw registryError('invalid_api_operation_contract')
    if (operation.apiHub && !['aviation', 'radar_satellite', 'kim_nwp'].includes(operation.credentialCategory)) throw registryError('invalid_api_operation_category')
    if (!operation.apiHub && operation.credentialCategory !== null) throw registryError('invalid_api_operation_category')
    const contractKeys = Object.keys(operation.callContract).sort()
    const exactKeys = (keys) => keys.length === contractKeys.length && keys.every((key, index) => key === contractKeys[index])
    if (operation.callContract.kind === 'on_demand' && (!exactKeys(['kind']) || operation.collectorType !== null)) throw registryError('invalid_api_operation_contract')
    if (operation.callContract.kind === 'collector' && (!exactKeys(['kind']) || !operation.collectorType || !collectorTypes.has(operation.collectorType))) throw registryError('unresolved_api_operation_collector')
    if (operation.callContract.kind === 'cron') {
      if (operation.collectorType && !collectorTypes.has(operation.collectorType)) throw registryError('unresolved_api_operation_collector')
      if (!exactKeys(operation.callContract.quiet ? ['expression', 'kind', 'quiet', 'timezone'] : ['expression', 'kind', 'timezone']) || typeof operation.callContract.expression !== 'string' || typeof operation.callContract.timezone !== 'string') throw registryError('invalid_api_operation_contract')
      try { CronExpressionParser.parse(operation.callContract.expression, { tz: operation.callContract.timezone }) } catch { throw registryError('invalid_api_operation_contract') }
      const quiet = operation.callContract.quiet
      if (quiet && (Object.keys(quiet).sort().join(',') !== 'fromHourKst,toHourKst' || !Number.isInteger(quiet.fromHourKst) || !Number.isInteger(quiet.toHourKst) || quiet.fromHourKst < 0 || quiet.fromHourKst > 23 || quiet.toHourKst < 0 || quiet.toHourKst > 23 || quiet.fromHourKst === quiet.toHourKst)) throw registryError('invalid_api_operation_contract')
    }
    if (operation.callContract.kind === 'conditional' && (!exactKeys(['kind', 'label']) || typeof operation.callContract.label !== 'string' || !operation.callContract.label)) throw registryError('invalid_api_operation_contract')
    if (operation.callContract.kind === 'on_demand' ? operation.dataHealthKeys.length !== 0 : operation.dataHealthKeys.length === 0) throw registryError('missing_api_operation_data_health_keys')
    if (operation.dataHealthKeys.some((key) => !dataKeys.has(key))) throw registryError('invalid_api_operation_data_health_key')
    try { if (!operation.match(new URL(operation.canonicalUrl))) throw registryError('invalid_api_operation_matcher') } catch (error) { if (error.code) throw error; throw registryError('invalid_api_operation_matcher') }
  }
  for (const candidate of registry) if (registry.filter((operation) => operation.match(new URL(candidate.canonicalUrl))).length !== 1) throw registryError('ambiguous_api_operation_matcher')
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
function cadenceLabel(expression) { const [minute, hour] = expression.split(' '); if (minute.startsWith('*/') && hour === '*') return `${minute.slice(2)}분마다`; if (minute.startsWith('*/') && /^\d+-\d+$/.test(hour)) return `${minute.slice(2)}분마다 (${hourRangeLabel(hour)})`; if (/^\d+(,\d+)+$/.test(hour) && /^\d+(,\d+)+$/.test(minute)) return hour.split(',').flatMap((h) => minute.split(',').map((m) => `${h.padStart(2, '0')}:${m.padStart(2, '0')}`)).join(', '); if (/^\d+(,\d+)+$/.test(hour)) return hour.split(',').map((value) => `${value.padStart(2, '0')}:${minute.padStart(2, '0')}`).join(', '); return `${minute}분 ${hour}시` }
function operatingHoursLabel(expression, timezone) { const hour = expression.split(' ')[1]; return /^\d+-\d+$/.test(hour) ? `${hourRangeLabel(hour)} ${timezone === 'Asia/Seoul' ? 'KST' : timezone}` : null }

export function describeExpectedApiCall(operation, collector, nowMs) {
  const contract = operation.callContract
  if (contract.kind === 'on_demand') return { kind: 'on_demand', label: '온디맨드' }
  if (contract.kind === 'conditional') return { kind: 'conditional', label: contract.label }
  const schedule = contract.kind === 'collector' ? collector?.schedule : contract
  if (!schedule?.expression || !schedule.timezone) throw registryError('unresolved_api_operation_collector')
  const parsed = CronExpressionParser.parse(schedule.expression, { currentDate: new Date(nowMs), tz: schedule.timezone })
  let next = parsed.next()
  const quiet = schedule.quiet
  while (quiet && (() => { const kstHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(next.toISOString()))); return quiet.fromHourKst < quiet.toHourKst ? kstHour >= quiet.fromHourKst && kstHour < quiet.toHourKst : kstHour >= quiet.fromHourKst || kstHour < quiet.toHourKst })()) next = parsed.next()
  const nextExpectedAt = next.toISOString()
  return { kind: 'scheduled', cadenceLabel: cadenceLabel(schedule.expression), timezone: schedule.timezone, operatingHoursLabel: operatingHoursLabel(schedule.expression, schedule.timezone), cronExpression: schedule.expression, nextExpectedAt }
}

assertApiOperationRegistry()
