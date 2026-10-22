// 공항 METAR·TAF 과거 보기 자료(GET /api/airports/:icao/history). METAR = 최근 3시간, TAF = 현재 + 직전 2개 발표.
export async function fetchAirportHistory(icao, type, { signal } = {}) {
  const response = await fetch(`/api/airports/${encodeURIComponent(icao)}/history?type=${encodeURIComponent(type)}`, { signal })
  if (!response.ok) throw new Error(`history ${response.status}`)
  return response.json()
}
