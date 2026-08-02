const NO_DATA = '자료 없음'

function hhmmInTz(date, tz) {
  // tz는 localStorage(time_zone)에서 그대로 오는 검증 안 된 값이다(TimeZoneContext.jsx).
  // '/'가 있다고 실제 IANA 존인 건 아니다 — 손으로 깨진 값('Foo/Bar')도 통과시키면
  // Intl이 RangeError를 던지고, 그게 fcStamps useMemo까지 올라가 지도 전체가 사라진다
  // (da05f2e에서 이미 겪은 실패 형태). 시도해보고 안 되면 KST로 내려간다 — 조용히 틀린
  // 시각보다야 낫지만, 지도가 사라지는 것보단 훨씬 낫다.
  const fmt = (zone) => new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
  try {
    return fmt(tz === 'UTC' ? 'UTC' : tz)
  } catch {
    return fmt('Asia/Seoul')
  }
}

/** `YYYYMMDDHH[mm]`(UTC)를 Date로. 형식이 아니면 null. */
function parseUtcTm(tm) {
  if (typeof tm !== 'string' || tm.length < 10) return null
  return new Date(Date.UTC(
    +tm.slice(0, 4), +tm.slice(4, 6) - 1, +tm.slice(6, 8),
    +tm.slice(8, 10), tm.length >= 12 ? +tm.slice(10, 12) : 0))
}

/**
 * 층별 기준 시각. 갱신 주기가 서로 달라 하나로 합치면 안 된다 —
 * 시정 20분, 운고 하루 네 번, 관측지점 매시.
 *
 * 세 값의 원래 시간대가 다르다: computed_at은 UTC(ISO), kim.run은 UTC,
 * stations.tm은 KST. 모두 tz로 맞춰 내보낸다.
 */
export function legendStamps(sources, hasData, computedAt, tz = 'KST') {
  if (!hasData) return { visibility: NO_DATA, ceiling: NO_DATA, stations: NO_DATA, stationCount: 0 }

  const visDate = computedAt ? new Date(computedAt) : null
  const kimDate = parseUtcTm(sources?.kim?.run)
  const stnTm = sources?.stations?.tm
  // 관측 시각만 이미 KST다. UTC로 되돌린 뒤 같은 경로로 형식을 맞춘다.
  const stnDate = stnTm ? new Date((parseUtcTm(stnTm)?.getTime() ?? NaN) - 9 * 3600 * 1000) : null

  const fmt = (d) => (d && !Number.isNaN(d.getTime()) ? hhmmInTz(d, tz) : NO_DATA)
  return {
    visibility: fmt(visDate),
    ceiling: fmt(kimDate),
    stations: fmt(stnDate),
    stationCount: (sources?.stations?.asos ?? 0) + (sources?.stations?.amos ?? 0),
  }
}
