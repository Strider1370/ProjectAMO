// #13 알림센터 표시 포맷 — 피드 행(type/target/fromVal/toVal + routeDep/Dest/Altn)을 한 줄 문구로.
// 백엔드 sender.formatAlert 미러(ko): 역할(출발/도착/교체)·전→후·통지체. 심각도 태그는 배지가 담당(문장엔 미포함).
// 임계 라벨/문구 변경 시 backend/src/alerts/sender.js와 동기화.

// 공항 ICAO → 계획상 역할. 피드가 routeDep/Dest/Altn을 줄 때만, 없으면 ICAO만.
function airportRole(icao, n) {
  if (icao && icao === n.routeDep) return '출발'
  if (icao && icao === n.routeDest) return '도착'
  if (icao && icao === n.routeAltn) return '교체'
  return null
}
const at = (icao, n) => { const r = airportRole(icao, n); return r ? `${r} ${icao}` : (icao ?? '') }
const shift = (from, to, unit = '') => (from != null && from !== '' ? `${from} → ${to}${unit}` : `${to}${unit}`)

export function formatNotification(n) {
  const t = n.target ?? ''
  const from = n.fromVal
  const to = n.toVal
  switch (n.type) {
    case 'CEIL':
      return `${at(t, n)} 운고 ${shift(from, to, 'ft')} — 최저운고 기준 미만`
    case 'VIS':
      return `${at(t, n)} 시정 ${shift(from, to, 'm')} — 최저시정 기준 미만`
    case 'ALTERNATE_FLIP':
      return `${at(t, n)} 교체공항 필요 조건 발생`
    case 'ENROUTE_HAZARD':
      return `경로상 신규 위험 (${to ?? t})`
    case 'ENROUTE_ICE_TURB':
      return `경로 ${t === 'icing' ? '착빙' : '난류'} ${shift(from, to)} 등급`
    case 'WX':
      return `${at(t, n)} 뇌전(TS) 예보`
    default:
      return `${at(t, n)} ${n.type}`
  }
}

// 심각도 → 디자인 헌법 레벨색(§5). CRITICAL/HIGH=red, MEDIUM=amber, 그 외=gray.
export function severityLevel(severity) {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'red'
  if (severity === 'MEDIUM') return 'amber'
  return 'gray'
}

// 심각도 → 배지 글자(텔레그램 태그와 동일 어휘). 색은 severityLevel, 글자는 여기.
const SEV_TAG = { CRITICAL: '위험', HIGH: '주의', MEDIUM: '정보', LOW: '참고', INFO: '참고' }
export function severityTag(severity) {
  return SEV_TAG[severity] ?? '알림'
}

export function relTime(iso) {
  const diff = Date.now() - Date.parse(iso)
  if (!Number.isFinite(diff)) return ''
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}
