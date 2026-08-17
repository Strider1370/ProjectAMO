// 자료 34종의 판정 기준표. 스펙 2026-08-10-admin-console-redesign-design.md의 표가 원본이다.
// cron 식을 시간 간격으로 번역하는 코드는 두지 않는다 — 발표 지연 같은 현장 사정은 사람이 조정해야 하고,
// 숫자를 직접 적는 편이 짧고 정직하다. 수집 주기를 바꾸면 이 표도 같이 고칠 것.
const m = (min) => min * 60_000
const h = (hour) => hour * 3_600_000

export const SOURCES = {
  kma_aviation: { label: '기상청 항공키', apiHubCategory: 'aviation' },
  kma_radar: { label: '레이더·위성키', apiHubCategory: 'radar_satellite' },
  kma_nwp: { label: '수치예보키', apiHubCategory: 'kim_nwp' },
  noaa: { label: 'NOAA', apiHubCategory: null },
  kac: { label: '공항공사', apiHubCategory: null },
  external: { label: '기타 외부', apiHubCategory: null },
}

export const CHARACTERS = {
  report: { label: '항공 보고·예보' },
  hazard: { label: '위험기상 경보' },
  observation: { label: '실황 관측' },
  nwp: { label: '수치예보' },
  general: { label: '일반예보·환경' },
  ops: { label: '운항 정보' },
}

// 밤에는 수집기가 프레임을 걸러내므로 판정하지 않는다.
const NIGHT = { kind: 'night' }
// 00–04시 KST에는 cron 자체가 돌지 않는다.
const EARLY_MORNING = { kind: 'hours', fromHourKst: 0, toHourKst: 4 }

// 일부러 꺼둔 자료를 가려내는 조건. 꺼둔 것은 멈춘 것이 아니라서 판정도 알림도 하지 않는다 —
// 안 그러면 "에코탑 24시간째 멈춤" 같은 알림이 손쓸 일도 없이 매일 온다.
// 레이더·위성 계열은 열쇠가 없으면 수집기 자체가 등록되지 않으므로(index.js) 그것도 꺼둔 것으로 본다.
const OFF = {
  echoTop: (c) => c.radar_echo_top?.enabled === false,
  kimNwp: (c) => c.kim_nwp?.enabled === false,
  convective: (c) => c.satellite?.convective_enabled === false,
  graphics: (c) => c.radar_graphics?.enabled === false,
  radarKey: (c) => !c.api?.radar_satellite_auth_key,
}
const anyOf = (...checks) => (c) => checks.some((check) => check(c))

export const CATALOG = [
  { key: 'metar', label: 'METAR 국내', source: 'kma_aviation', character: 'report', normalMs: m(5), lateMs: m(20), stoppedMs: m(40) },
  { key: 'taf', label: 'TAF 국내', source: 'kma_aviation', character: 'report', normalMs: m(10), lateMs: m(30), stoppedMs: h(1) },
  { key: 'sigmet', label: 'SIGMET 국내', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'airmet', label: 'AIRMET', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'sigwx_low', label: 'SIGWX', source: 'kma_aviation', character: 'hazard', normalMs: h(6), lateMs: h(9), stoppedMs: h(18) },
  { key: 'amos', label: 'AMOS', source: 'kma_aviation', character: 'report', normalMs: m(5), lateMs: m(20), stoppedMs: m(40) },
  { key: 'warning', label: '기상특보', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'kma_special_warning', label: '기상특보(KMA)', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'lightning', label: '낙뢰', source: 'kma_aviation', character: 'observation', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'typhoon', label: '태풍', source: 'kma_aviation', character: 'hazard', normalMs: m(30), lateMs: m(90), stoppedMs: h(3), eventDriven: true },
  { key: 'takeoff_fcst', label: '이륙예보', source: 'kma_aviation', character: 'report', normalMs: h(1), lateMs: h(3), stoppedMs: h(6) },
  { key: 'airport_info', label: '공항정보', source: 'kma_aviation', character: 'ops', normalMs: h(12.5), lateMs: h(26), stoppedMs: h(50) },
  { key: 'ground_forecast', label: '지상예보', source: 'kma_aviation', character: 'general', normalMs: h(3), lateMs: h(7), stoppedMs: h(14) },
  { key: 'environment', label: '대기환경', source: 'kma_aviation', character: 'general', normalMs: h(1), lateMs: h(3), stoppedMs: h(6) },
  { key: 'asos_ceiling', label: '운고(ASOS)', source: 'kma_aviation', character: 'report', normalMs: h(1), lateMs: h(3), stoppedMs: h(6) },

  { key: 'radar', label: '레이더(합성 HSR)', source: 'kma_radar', character: 'observation', statsKey: 'hsr', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/hsr/hsr_meta.json', disabledWhen: anyOf(OFF.graphics, OFF.radarKey),},
  { key: 'echo_top', label: '에코탑(재산출)', source: 'kma_radar', character: 'observation', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), meta: 'radar/echotop/echotop_meta.json', disabledWhen: anyOf(OFF.echoTop, OFF.radarKey),},
  { key: 'hci', label: '합성 HCI', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/hci/hci_meta.json', disabledWhen: anyOf(OFF.graphics, OFF.radarKey),},
  { key: 'wissdom', label: 'WISSDOM', source: 'kma_radar', character: 'nwp', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/wissdom/wissdom_meta.json', disabledWhen: anyOf(OFF.graphics, OFF.radarKey),},
  { key: 'qpf', label: 'QPF', source: 'kma_radar', character: 'nwp', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/qpf/qpf_meta.json', disabledWhen: anyOf(OFF.graphics, OFF.radarKey),},
  { key: 'satellite', label: '위성', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'satellite/sat_meta.json', disabledWhen: OFF.radarKey,},
  { key: 'satellite_visible', label: '위성 가시', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), quiet: NIGHT, meta: 'satellite/visible/visible_meta.json', disabledWhen: OFF.radarKey,},
  { key: 'convective', label: '대류 CI·CTPS', source: 'kma_radar', character: 'observation', statsKey: 'satellite', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'satellite/convective/convective_meta.json', disabledWhen: anyOf(OFF.convective, OFF.radarKey),},
  { key: 'flight_category_overlay', label: '비행범주', source: 'kma_radar', character: 'report', statsKey: 'flight_category', normalMs: m(20), lateMs: h(1), stoppedMs: h(2) },

  { key: 'kim_nwp', label: 'KIM 수치예보 격자', source: 'kma_nwp', character: 'nwp', statsKey: 'kim_surface_wind', normalMs: h(6), lateMs: h(9), stoppedMs: h(18), meta: 'kim_nwp/latest.json', disabledWhen: OFF.kimNwp,},
  { key: 'ktg', label: '난류(KTG)', source: 'kma_nwp', character: 'nwp', normalMs: h(6), lateMs: h(9), stoppedMs: h(18), meta: 'ktg/latest.json' },

  { key: 'metar_overseas', label: 'METAR 해외', source: 'noaa', character: 'report', normalMs: m(5), lateMs: m(20), stoppedMs: m(40) },
  { key: 'taf_overseas', label: 'TAF 해외', source: 'noaa', character: 'report', normalMs: m(10), lateMs: m(30), stoppedMs: h(1) },
  { key: 'sigmet_overseas', label: 'SIGMET 해외', source: 'noaa', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },

  { key: 'terminal_flights', label: '운항편', source: 'kac', character: 'ops', normalMs: m(1), lateMs: m(15), stoppedMs: m(30), quiet: EARLY_MORNING },
  { key: 'notam', label: 'NOTAM', source: 'kac', character: 'ops', normalMs: h(6), lateMs: h(9), stoppedMs: h(18) },

  { key: 'rainviewer', label: '해외 레이더', source: 'external', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/rainviewer_meta.json' },
  { key: 'overseas_forecast', label: '해외예보', source: 'external', character: 'general', normalMs: h(1), lateMs: h(3), stoppedMs: h(6), quiet: EARLY_MORNING },
].map((row) => ({ statsKey: row.key, quiet: null, eventDriven: false, meta: null, disabledWhen: null, ...row }))

const groupBy = (field, dict) => () =>
  Object.entries(dict).map(([id, meta]) => ({ id, ...meta, rows: CATALOG.filter((r) => r[field] === id) }))

export const bySource = groupBy('source', SOURCES)
export const byCharacter = groupBy('character', CHARACTERS)

export default { CATALOG, SOURCES, CHARACTERS, bySource, byCharacter }
