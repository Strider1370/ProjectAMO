// 지도형 브리핑 공항 카드(6단계, spec §2.3): 접힌 3줄 = 머리(역할·ICAO·공항명·비행등급·깃발) + METAR 한 줄 + TAF ±1시간 한 줄.
// 판정은 서버가 한 것(sections.current.airports, adverse.hazards의 공항경보, routeNotams)을 모아 글로 만들기만 한다.
// "상세"는 기존 공항 패널을 연다 — 앱 공항 목록(국내 + 해외 METAR 수집 공항)에 있는 공항만.

const ROLE_KO = { departure: '출발', arrival: '도착', alternate: '교체' }
const CATEGORY_LEVEL = { VFR: 'vfr', MVFR: 'mvfr', IFR: 'ifr', LIFR: 'lifr' }

function metarText(metar) {
  const obs = metar?.observation
  if (!obs) return null
  const d = obs.display ?? {}
  const visibility = obs.visibility?.cavok ? 'CAVOK' : Number.isFinite(obs.visibility?.value) ? String(obs.visibility.value).padStart(4, '0') : null
  const clouds = obs.visibility?.cavok ? null : d.clouds
  return [d.wind, visibility, d.weather && d.weather !== '-' ? d.weather : null, clouds, d.temperature].filter(Boolean).join(' ') || null
}

// 출발·도착이 같은 공항이면 한 장(역할 '출발/도착').
function roleLabel(airport) {
  const roles = airport.roles?.length ? airport.roles : [airport.role]
  return roles.map((role) => ROLE_KO[role] ?? role).join('/')
}

export function airportCards(briefing, { airportList = [], nameFor = (icao) => icao } = {}) {
  const airports = briefing?.sections?.current?.airports ?? []
  const hazards = briefing?.sections?.adverse?.hazards ?? []
  const notams = briefing?.routeNotams ?? []
  const known = new Map(airportList.map((airport) => [airport.icao, airport]))
  const seen = new Set()
  const cards = []
  for (const airport of airports) {
    if (!airport?.icao || seen.has(airport.icao)) continue
    seen.add(airport.icao)
    const listed = known.get(airport.icao)
    const warnings = hazards.filter((hazard) => hazard.airportScope === airport.icao)
    const window = airport.tafWindow
    cards.push({
      icao: airport.icao,
      role: airport.role,
      roleLabel: roleLabel(airport),
      name: nameFor(airport.icao),
      category: airport.category && airport.category !== 'UNKNOWN' ? airport.category : null,
      categoryLevel: CATEGORY_LEVEL[airport.category] ?? 'unknown',
      position: Number.isFinite(listed?.lat) && Number.isFinite(listed?.lon) ? [listed.lon, listed.lat] : null,
      canOpenPanel: Boolean(listed),
      metar: { text: metarText(airport.metar), time: airport.observationTime ?? null, speci: airport.reportType === 'SPECI' },
      taf: window
        ? { basis: window.basis, text: window.outOfRange ? 'TAF 유효기간 밖' : (window.at?.text ?? null), changes: window.changes ?? [], outOfRange: Boolean(window.outOfRange), previous: Boolean(window.previous) }
        : { basis: airport.role === 'departure' ? 'ETD' : 'ETA', text: null, changes: [], outOfRange: false, previous: false },
      flags: {
        warnings: warnings.filter((hazard) => hazard.code !== 'WIND_SHEAR').map((hazard) => hazard.label),
        windshear: warnings.some((hazard) => hazard.code === 'WIND_SHEAR'),
        notams: notams.filter((notam) => notam.airportIcao === airport.icao).length,
      },
    })
  }
  return cards
}

// "앞뒤 변화 n건"의 툴팁: "TEMPO 13–19 30010KT 6000 …" 한 줄씩.
export function changeLines(changes, formatHour = (iso) => iso) {
  return (changes ?? []).map((change) => `${change.type} ${formatHour(change.start)}${change.end ? `–${formatHour(change.end)}` : ''} ${change.text ?? ''}`.trim())
}
