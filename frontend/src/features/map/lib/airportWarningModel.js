const WARNING_KO = {
  WIND_SHEAR: '급변풍', LOW_VISIBILITY: '저시정', STRONG_WIND: '강풍', HEAVY_RAIN: '호우',
  LOW_CEILING: '저운고', THUNDERSTORM: '뇌우', TYPHOON: '태풍', HEAVY_SNOW: '대설', YELLOW_DUST: '황사',
}

// UTC 유효기간으로 판별한다. 시각이 없는 경보는 현재 수신 목록의 상태를 따른다.
export function airportWarningState(warningData, nowMs) {
  const warnedAirports = []
  const warningLabels = {}
  let nextChangeAtMs = Infinity
  for (const [icao, airport] of Object.entries(warningData?.airports || {})) {
    const active = (Array.isArray(airport?.warnings) ? airport.warnings : []).filter((warning) => {
      if (!warning) return false
      const start = Date.parse(warning.valid_start)
      const end = Date.parse(warning.valid_end)
      if (Number.isFinite(start) && Number.isFinite(end) && end <= start) return false
      if (Number.isFinite(end) && end <= nowMs) return false
      if (Number.isFinite(start) && start > nowMs) {
        nextChangeAtMs = Math.min(nextChangeAtMs, start)
        return false
      }
      if (Number.isFinite(end)) nextChangeAtMs = Math.min(nextChangeAtMs, end)
      return true
    })
    if (!active.length) continue
    warnedAirports.push(icao)
    warningLabels[icao] = [...new Set(active.map((warning) =>
      WARNING_KO[warning.wrng_type_key] || warning.wrng_type_name || '경보'))]
  }
  return { warnedAirports, warningLabels, nextChangeAtMs }
}
