import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadDotenv(startDir) {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    const envPath = path.join(dir, '.env')
    if (fs.existsSync(envPath)) { dotenv.config({ path: envPath }); return }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
}
loadDotenv(__dirname)

const projectRoot = path.resolve(__dirname, '../..')

function resolveDataPath(dataPath) {
  if (!dataPath) {
    return path.join(projectRoot, 'backend', 'data')
  }
  return path.isAbsolute(dataPath) ? dataPath : path.resolve(projectRoot, dataPath)
}

import airportsData from '../../shared/airports.js'

export const airports = airportsData

const DEFAULT_OVERSEAS_AIRPORTS = [
  'RCKH', 'RCMQ', 'RCTP', 'RJAA', 'RJBB', 'RJCC', 'RJFF', 'RJFK', 'RJFR', 'RJFT',
  'RJGG', 'RJOA', 'RJOH', 'RJOM', 'RJOT', 'RJSS', 'RJTT', 'ROAH', 'ROMY', 'RPLC',
  'RPLL', 'RPVM', 'VDPP', 'VHHH', 'VMMC', 'VTBS', 'VTCC', 'VVCR', 'VVDN', 'VVNB',
  'VVPQ', 'VVTS', 'WADD', 'WBKK', 'WIII', 'WMKK', 'WSSS', 'ZBAA', 'ZBAD', 'ZGGG',
  'ZGSZ', 'ZMCK', 'ZSHC', 'ZSPD', 'ZSQD', 'ZSSS', 'ZYTL', 'ZYTX',
]

function loadOverseasAirportIds() {
  const filePath = path.join(projectRoot, 'frontend', 'public', 'data', 'navdata', 'airports-overseas.json')
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const ids = Object.keys(data || {}).filter((id) => /^[A-Z0-9]{4}$/.test(id)).sort()
    return ids.length > 0 ? ids : DEFAULT_OVERSEAS_AIRPORTS
  } catch {
    return DEFAULT_OVERSEAS_AIRPORTS
  }
}

const aviationAuthKey = process.env.KMA_AVIATION_AUTH_KEY || process.env.KMA_AUTH_KEY || process.env.API_AUTH_KEY || ''
const radarSatelliteAuthKey = process.env.KMA_RADAR_SATELLITE_AUTH_KEY || aviationAuthKey
const kimNwpAuthKey = process.env.KMA_KIM_NWP_AUTH_KEY || aviationAuthKey

export const api = {
  base_url: process.env.API_BASE_URL || 'https://apihub.kma.go.kr/api/typ02/openApi',
  lightning_url: process.env.LIGHTNING_API_URL || 'https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php',
  amos_url: process.env.AMOS_API_URL || 'https://apihub.kma.go.kr/api/typ01/url/amos.php',
  sigwx_low_url: process.env.SIGWX_LOW_API_URL || 'https://apihub.kma.go.kr/api/typ01/url/amo_sigwx.php',
  radar_url: process.env.RADAR_API_URL || 'https://apihub.kma.go.kr/api/typ04/url/rdr_cmp_file.php',
  airkorea_pm_url: process.env.AIRKOREA_PM_URL || 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty',
  kma_uv_url: process.env.KMA_UV_URL || 'https://apihub.kma.go.kr/api/typ01/url/kma_sfctm_uv.php',
  kim_grid_url: process.env.KIM_GRID_API_URL || 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_xy_txt2',
  endpoints: {
    metar: '/AmmIwxxmService/getMetar',
    taf: '/AmmIwxxmService/getTaf',
    warning: '/AmmService/getWarning',
    sigmet: '/AmmIwxxmService/getSigmet',
    airmet: '/AmmIwxxmService/getAirmet',
    airport_info: '/AirPortService/getAirPort',
    takeoff_fcst: '/AirInfoService/getAirInfo',
  },
  // 기존 항공·일반 KMA 수집기 기본 키. 새 역할별 키가 비어 있으면 이 값으로 안전하게 폴백한다.
  auth_key: aviationAuthKey,
  radar_satellite_auth_key: radarSatelliteAuthKey,
  kim_nwp_auth_key: kimNwpAuthKey,
  airkorea_key: process.env.AIRKOREA_API_KEY || '',
  kma_uv_key: process.env.KMA_UV_API_KEY || aviationAuthKey,
  default_params: { pageNo: 1, numOfRows: 10, dataType: 'XML' },
  timeout_ms: 10000,
  max_retries: 3,
}

export const environment = {
  timeout_ms: 15000,
  pm_station_by_airport: {
    RKSI: '운서',
    RKSS: '공항대로',
    RKPC: '연동',
    RKPK: '삼락동',
    RKJB: '무안읍',
    RKNY: '양양읍',
    RKPU: '송정동',
    RKJY: '율촌면',
  },
  uv_station_by_airport: {
    RKSI: { stn: 112, name: '인천' },
    RKSS: { stn: 108, name: '서울' },
    RKPC: { stn: 185, name: '고산' },
    RKPK: { stn: 159, name: '부산' },
    RKJB: { stn: 165, name: '목포' },
    RKNY: { stn: 105, name: '강릉' },
    RKPU: { stn: 152, name: '울산' },
    RKJY: { stn: 165, name: '목포' },
  },
}

export const ground_forecast = {
  timeout_ms: 15000,
  short_endpoint: '/VilageFcstMsgService/getLandFcst',
  village_endpoint: '/VilageFcstInfoService_2.0/getVilageFcst',
  mid_land_endpoint: '/MidFcstInfoService/getMidLandFcst',
  mid_temp_endpoint: '/MidFcstInfoService/getMidTa',
  quality_drop_tolerance: 0,
  airports: {
    RKSS: { short_reg_id: '11B20102', mid_land_reg_id: '11B00000', mid_temp_reg_id: '11B20102' },
    RKSI: { short_reg_id: '11B20201', mid_land_reg_id: '11B00000', mid_temp_reg_id: '11B20201' },
    RKPC: { short_reg_id: '11G00201', mid_land_reg_id: '11G00000', mid_temp_reg_id: '11G00201' },
    RKJY: { short_reg_id: '11F20401', mid_land_reg_id: '11F20000', mid_temp_reg_id: '11F20401' },
    RKJB: { short_reg_id: '21F20804', mid_land_reg_id: '11F20000', mid_temp_reg_id: '21F20804' },
    RKPU: { short_reg_id: '11H20101', mid_land_reg_id: '11H20000', mid_temp_reg_id: '11H20101' },
    RKNY: { short_reg_id: '11D20403', mid_land_reg_id: '11D20000', mid_temp_reg_id: '11D20403' },
    RKPK: { short_reg_id: '11H20304', mid_land_reg_id: '11H20000', mid_temp_reg_id: '11H20304' },
  },
}

export const lightning = {
  range_km: 32,
  itv_minutes: 5,
  nationwide: {
    lat: 36.2,
    lon: 127.8,
    range_km: 800,
  },
  zones: {
    alert: 8,
    danger: 16,
    caution: 32,
  },
}

export const amos = {
  dtm_minutes: 60,
  timeout_ms: 12000,
  stale_tolerance_minutes: 60,
}

export const radar_echo = {
  cmp: (process.env.RADAR_CMP_TYPE || 'hsr').toLowerCase(),
  delay_minutes: 10,
  max_images: 36,
  range_km: 100,
  crop_size: 200,
  timeout_ms: 30000,
}

// 레이더 사이트 QCD 원자료 기반 재산출 Echo Top(18 dBZ, MSL).
// KMA 공식 ETOP이 아니라 ProjectAMO가 원자료로 계산한 참고 산출물이다.
export const radar_echo_top = {
  url: process.env.RADAR_QCD_API_URL || 'https://apihub.kma.go.kr/api/typ04/url/rdr_site_file.php',
  // Task 1 실측으로 확정한 목록. 빈 값이면 프로세서가 명시적으로 실패한다.
  sites: (process.env.RADAR_QCD_SITES || '').split(',').map((s) => s.trim()).filter(Boolean),
  threshold_dbz: 18,
  stride: 4,          // HSR 0.5 km 격자를 4칸씩 솎아 2 km 합성 격자를 만든다.
  concurrency: 4,     // 한 프레임에서 동시에 받는 사이트 수.
  timeout_ms: 45000,
  retry: 1,
  // 레이더(radar_echo)와 반드시 같아야 한다. 에코탑은 선택 시각과 tm이 정확히 일치할 때만
  // 표시하므로(FR-002/FR-005), 지연이 다르면 실시간 보기에서 레이더 최신 시각에 에코탑
  // 프레임이 없어 레이어가 늘 숨는다. 실측 결과 QCD는 5분 지연으로도 전부 내려온다(여유 5분).
  delay_minutes: 10,
  max_frames: 36,     // 3시간 보존 — 레이더(radar_echo.max_images)와 같은 시간 범위.
  enabled: process.env.RADAR_ECHO_TOP_ENABLED !== '0',
}

// 해외 레이더 — RainViewer 메타(목차) JSON만 수집. 타일은 브라우저가 CDN에서 직접 받는다(프록시 금지).
export const rainviewer = {
  url: process.env.RAINVIEWER_API_URL || 'https://api.rainviewer.com/public/weather-maps.json',
  timeout_ms: 10000,
}

export const satellite = {
  url: process.env.SATELLITE_API_URL || 'https://apihub.kma.go.kr/api/typ05/api/GK2A/LE1B',
  fog_url: process.env.SATELLITE_FOG_API_URL || 'https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2',
  channel: (process.env.SATELLITE_CHANNEL || 'IR105').toUpperCase(),
  fog_product: 'FOG',
  ci_product: 'CI',
  convective_enabled: process.env.SATELLITE_CONVECTIVE_ENABLED !== '0',
  convective_max_frames: Number(process.env.SATELLITE_CONVECTIVE_MAX_FRAMES || 18),
  region: (process.env.SATELLITE_REGION || 'KO').toUpperCase(),
  delay_minutes: 20,
  max_frames: 18,
  timeout_ms: 30000,
}

export const flight_category = {
  sfc_vis_url: process.env.SFC_VIS_URL ||
    'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-sfc_obs_nc_api',
  ctps_url: process.env.CTPS_URL ||
    'https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/CTPS/KO/data',
  timeout_ms: 30000,
  idw_grid_size: 512,
  simplify_tolerance: 0.01,
  collect_on_startup: process.env.FLIGHT_CATEGORY_ON_STARTUP !== '0',
}

export const adsb = {
  url: process.env.ADSB_API_URL || 'https://api.adsb.lol/v2',
  timeout_ms: 20000,
  max_history_frames: 36,
  centers: [
    { lat: Number(process.env.ADSB_LAT_1 || 34.0), lon: Number(process.env.ADSB_LON_1 || 124.7) },
    { lat: Number(process.env.ADSB_LAT_2 || 37.3), lon: Number(process.env.ADSB_LON_2 || 131.0) },
  ],
  dist_nm: Number(process.env.ADSB_DIST_NM || 250),
  bounds: {
    lamin: Number(process.env.ADSB_LAMIN || 30),
    lamax: Number(process.env.ADSB_LAMAX || 39),
    lomin: Number(process.env.ADSB_LOMIN || 124),
    lomax: Number(process.env.ADSB_LOMAX || 134),
  },
}

export const kim_surface_wind = {
  timeout_ms: 30000,
  sub: process.env.KIM_SURFACE_WIND_SUB || '1429,1441,1633,1609',
  bounds: {
    lonMin: Number(process.env.KIM_SURFACE_WIND_LON_MIN || 119),
    latMin: Number(process.env.KIM_SURFACE_WIND_LAT_MIN || 30),
    lonMax: Number(process.env.KIM_SURFACE_WIND_LON_MAX || 136),
    latMax: Number(process.env.KIM_SURFACE_WIND_LAT_MAX || 44),
    dx: Number(process.env.KIM_SURFACE_WIND_DX || 0.083333),
    dy: Number(process.env.KIM_SURFACE_WIND_DY || 0.083333),
  },
}

export const ktg = {
  max_runs: Number(process.env.KTG_MAX_RUNS || 2),
  timeout_ms: Number(process.env.KTG_TIMEOUT_MS || 60000),
  forecast_hours: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30],
  // 미래 예보 수집 ON: 기본 전체 hf 수집. KTG_SINGLE_FORECAST=1 이면 최근 1스텝만.
  single_forecast: process.env.KTG_SINGLE_FORECAST === '1',
  collect_on_startup: process.env.KTG_COLLECT_ON_STARTUP !== '0',
}

export const kim_nwp = {
  enabled: process.env.KIM_NWP_DISABLED !== '1',
  max_runs: Number(process.env.KIM_NWP_MAX_RUNS || 2),
  keep_raw: process.env.KIM_NWP_KEEP_RAW !== '0',
  concurrency: Number(process.env.KIM_NWP_CONCURRENCY || 4),
  // TAF(30h) 정합: 0~30h 3시간 간격(11스텝). 33·36h는 TAF 범위 밖이라 제외.
  forecast_hours: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30],
  // 미래 예보 수집 ON: 기본 전체 예보시간 수집. KIM_NWP_SINGLE_FORECAST=1 이면 최근 1스텝만.
  single_forecast: process.env.KIM_NWP_SINGLE_FORECAST === '1',
  collect_icing: process.env.KIM_NWP_COLLECT_ICING !== '0',
  collect_on_startup: process.env.KIM_NWP_COLLECT_ON_STARTUP !== '0',
  incremental_retry: process.env.KIM_NWP_INCREMENTAL_RETRY !== '0',
  icing_variables: ['w', 'rh_liq', 'tqc', 'tqi', 'tqr', 'tqs', 'cld'],
}

export const notam = {
  horizon_hours: 24, // site hard-caps the search window at 24h (validateAndSearch clamps)
  timeout_ms: Number(process.env.NOTAM_TIMEOUT_MS || 30000),
  fir_codes: (process.env.NOTAM_FIR_CODES || 'RKRR').split(','),
  // 시작 시 크롤 여부. 기본 ON이되(아래 신선도 조건과 결합), NOTAM_COLLECT_ON_STARTUP=0 이면 완전히 끔.
  collect_on_startup: process.env.NOTAM_COLLECT_ON_STARTUP !== '0',
  // 시작 시 캐시가 이 시간(h)보다 오래됐을 때만 크롤. 그 안이면 유효한 최신본이라 스킵.
  // 기본 6h = 크롤 주기. 이러면 재시작해도 유효 데이터는 재크롤 없이 즉시 씀.
  startup_max_age_hours: Number(process.env.NOTAM_STARTUP_MAX_AGE_HOURS || 6),
}

// 해외 기상: NOAA Aviation Weather(JSON, 무인증). 국내(RKxx)=KMA 유지, 해외만 NOAA.
// overseas_airports = frontend/public/data/navdata/airports-overseas.json에서 파생.
// asia_firs = NOAA 국제 SIGMET(전세계 1콜)에서 남길 아시아 FIR. RKRR(국내)은 KMA와 중복되므로 제외.
// ⚠️ 프놈펜은 공항코드 VDPP이지만 FIR코드는 VDPF(ICAO 재지정) — SIGMET firId 매칭엔 VDPF.
export const noaa = {
  base_url: process.env.NOAA_BASE_URL || 'https://aviationweather.gov/api/data',
  timeout_ms: Number(process.env.NOAA_TIMEOUT_MS || 20000),
  overseas_airports: loadOverseasAirportIds(),
  asia_firs: [
    'RJJJ', 'RCAA', 'VHHK', 'ZMUB', 'ZBPE', 'ZSHA', 'ZGZU', 'ZYSH', 'ZHWH', 'ZJSA',
    'ZLHW', 'VVHN', 'VVHM', 'VDPF', 'VTBB', 'WMFC', 'WSJC', 'WIIF', 'WAAF', 'RPHI',
    'ZPKM', 'VLVT', 'WBFC', // 쿤밍(서남부 청두·쿤밍·충칭), 비엔티안(라오스), 코타키나발루
  ],
}

export const schedule = {
  notam_interval: '0 */6 * * *', // 6시간 주기(00,06,12,18 UTC)
  metar_interval: '*/5 * * * *',
  taf_interval: '*/30 * * * *',
  warning_interval: '*/5 * * * *',
  sigmet_interval: '*/5 * * * *',
  airmet_interval: '*/5 * * * *',
  sigwx_low_interval: '5 5,11,17,23 * * *',
  amos_interval: '*/5 * * * *',
  lightning_interval: '*/5 * * * *',
  radar_echo_interval: '*/5 * * * *',
  echo_top_interval: '*/5 * * * *',
  // ponytail: 10분 — RainViewer 원본 갱신 주기가 10분이라 5분 cron은 같은 데이터를 두 번 받는 낭비.
  rainviewer_interval: '*/10 * * * *',
  // 5분 — 관측 간격은 10분 그대로지만, 늦게 올라온 프레임을 다음 10분까지 기다리지 않고 줍는다.
  // 이미 받은 프레임은 파일 존재 검사로 건너뛰므로 정상 상황의 추가 다운로드는 0.
  satellite_interval: '*/5 * * * *',
  ktg_interval: '25 1,2,7,8,13,14,19,20 * * *',
  kim_surface_wind_interval: '12 0,1,2,6,7,8,12,13,14,18,19,20 * * *',
  // 동네예보 발표 8회(02,05,08,11,14,17,20,23 KST) + 30분 여유. 중기예보(06/18 발표)는 08:30·20:30 슬롯이 받는다.
  ground_forecast_interval: '30 2,5,8,11,14,17,20,23 * * *',
  environment_interval: '10 * * * *',
  airport_info_interval: '0,30 6,17 * * *',
  takeoff_fcst_interval: '8 * * * *', // 매시(KST) — 이륙예보는 정시 발표
  flight_category_interval: '5 * * * *',
}

export const storage = {
  base_path: resolveDataPath(process.env.DATA_PATH),
  max_files_per_category: 10,
  max_files_by_type: {
    lightning: 48,
    sigwx_low: 12,
  },
}

// Web Push(VAPID) — 키 없으면 발송 라우터가 503으로 응답(미설정 안내), 크래시하지 않음.
export const push = {
  vapid_public_key: process.env.VAPID_PUBLIC_KEY || '',
  vapid_private_key: process.env.VAPID_PRIVATE_KEY || '',
  vapid_subject: process.env.VAPID_SUBJECT || 'mailto:admin@projectamo.co.kr',
}

export default {
  api,
  airports,
  noaa,
  notam,
  environment,
  ground_forecast,
  flight_category,
  ktg,
  lightning,
  amos,
  radar_echo,
  radar_echo_top,
  rainviewer,
  satellite,
  adsb,
  kim_surface_wind,
  kim_nwp,
  schedule,
  storage,
  push,
}
