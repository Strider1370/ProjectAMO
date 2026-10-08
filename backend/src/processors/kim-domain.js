// KIM 수집 영역. 영역마다 저장 폴더·요청 범위·저장 가능한 예보시각이 다르다.
// kr(한반도)은 기존 kim_nwp/ 폴더를 그대로 써서 운영 자료와 한반도 전용 기능(브리핑·단면·운고)이 바뀌지 않는다.
// ea(확대 영역)는 kim_nwp_ea/에 따로 두어 같은 발표회차라도 한반도 회차와 섞이거나 서로의 정리 대상이 되지 않는다.
//
// 저장소(kim-nwp-store.js)가 이 모듈을 쓰므로 config를 가져오지 않는다. config는 가져오는 순간 DATA_PATH를 읽어
// 저장소만 쓰는 시험·도구의 데이터 폴더 지정보다 먼저 굳어 버린다. 요청 범위는 kimDomainRequest(config, id)로 읽는다.
import { KIM_NWP_FORECAST_HOURS } from './kim-nwp-model.js'

export const KIM_DEFAULT_DOMAIN = 'kr'
export const KIM_DOMAIN_IDS = Object.freeze(['kr', 'ea'])

// 확대 영역: +0~24h 1시간, +27~48h 3시간(00 UTC는 +36h, 06 UTC는 +48h까지 받는다).
export const KIM_EXPANDED_FORECAST_HOURS = Object.freeze([
  ...Array.from({ length: 25 }, (_, hf) => hf),
  ...Array.from({ length: 8 }, (_, i) => 27 + i * 3),
])

const DOMAINS = Object.freeze({
  kr: Object.freeze({ id: 'kr', storeDir: 'kim_nwp', forecastHours: KIM_NWP_FORECAST_HOURS, bulkOnly: false }),
  ea: Object.freeze({ id: 'ea', storeDir: 'kim_nwp_ea', forecastHours: KIM_EXPANDED_FORECAST_HOURS, bulkOnly: true }),
})

function invalidDomain() {
  const error = new Error('Invalid KIM domain')
  error.code = 'invalid_kim_domain'
  return error
}

export function kimDomain(id = KIM_DEFAULT_DOMAIN) {
  const domain = Object.hasOwn(DOMAINS, id) ? DOMAINS[id] : null
  if (!domain) throw invalidDomain()
  return domain
}

// 요청 범위(sub)·경계. config에서 매번 읽는다(시험이 config 값을 바꿔 쓴다).
export function kimDomainRequest(config, id = KIM_DEFAULT_DOMAIN) {
  kimDomain(id)
  const source = id === 'ea' ? config.kim_expanded : config.kim_surface_wind
  return { sub: source.sub, bounds: source.bounds }
}

// API 질의값 해석. 없으면 한반도.
export function parseKimDomain(value) {
  if (value === undefined || value === null || value === '') return KIM_DEFAULT_DOMAIN
  const id = String(value)
  if (!KIM_DOMAIN_IDS.includes(id)) throw invalidDomain()
  return id
}
