import fs from 'node:fs'
import path from 'node:path'

// 관리자 콘솔: 자료 종류별 마지막 수신 시각. 대부분은 store.js를 거쳐 메모리 캐시(fetched_at)에
// 남지만, 레이더 계열(래스터 타일을 같이 만드는 처리기)은 자기 폴더에 직접 meta.json을 쓰고
// store를 거치지 않는다 — 그 파일들은 수정시각(mtime)으로 "마지막 갱신"을 판단한다.
// 두 방식을 하나로 합치려고 store를 흉내 내게 만들기보다, 있는 그대로 두 갈래로 읽는 쪽이 더 작다.
const STORE_TYPES = [
  ['metar', 'METAR(국내)'],
  ['metar_overseas', 'METAR(해외)'],
  ['taf', 'TAF(국내)'],
  ['taf_overseas', 'TAF(해외)'],
  ['sigmet', 'SIGMET(국내)'],
  ['sigmet_overseas', 'SIGMET(해외)'],
  ['airmet', 'AIRMET'],
  ['warning', '기상특보'],
  ['sigwx_low', 'SIGWX'],
  ['lightning', '낙뢰'],
  ['amos', 'AMOS(공항기상)'],
  ['kim_surface_wind', '지상바람(KIM)'],
  ['ground_forecast', '지상예보'],
  ['environment', '대기환경'],
  ['airport_info', '공항정보'],
  ['takeoff_fcst', '이륙예보'],
  ['notam', 'NOTAM'],
  ['typhoon', '태풍'],
]

const META_FILE_TYPES = [
  ['radar_echo', '레이더', 'radar/echo_meta.json'],
  ['echo_top', '에코탑(재산출)', 'radar/echotop/echotop_meta.json'],
  ['satellite', '위성', 'satellite/sat_meta.json'],
  ['rainviewer', '해외 레이더', 'radar/rainviewer_meta.json'],
  ['ktg', '난류(KTG)', 'ktg/latest.json'],
]

function isCurrentlyFailing(entry) {
  return Boolean(entry?.last_failure && entry.last_failure === entry.last_run)
}

// getCached(type)와 getStats()를 주입받는다(store.js·stats.js 직접 의존 대신) — basePath만 있으면
// 순수 함수로 테스트 가능하게.
export function readDataHealth(basePath, { getCached, getStats }) {
  const statsTypes = getStats()?.types || {}
  const rows = []

  for (const [key, label] of STORE_TYPES) {
    const cached = getCached(key)
    rows.push({
      key, label,
      fetchedAt: cached?.fetched_at ?? null,
      failing: isCurrentlyFailing(statsTypes[key]),
      lastError: statsTypes[key]?.last_error ?? null,
    })
  }

  for (const [key, label, relPath] of META_FILE_TYPES) {
    let fetchedAt = null
    try {
      fetchedAt = fs.statSync(path.join(basePath, relPath)).mtime.toISOString()
    } catch { /* 아직 한 번도 안 만들어짐 */ }
    rows.push({
      key, label, fetchedAt,
      failing: isCurrentlyFailing(statsTypes[key]),
      lastError: statsTypes[key]?.last_error ?? null,
    })
  }

  return rows
}
