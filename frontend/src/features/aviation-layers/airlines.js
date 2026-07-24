// Operator identity from callsign. The first three letters of an ADS-B callsign are
// the ICAO airline designator (KAL123 -> KAL = Korean Air).

// Korean carriers we ship a transparent logo for (public/Symbols/airlines/{ICAO}.svg).
// Logos: Wikimedia Commons (PD-textlogo). Trademarks of their owners, used for identification only.
export const AIRLINE_LOGOS = new Set(['KAL', 'AAR', 'JJA', 'TWB', 'ESR', 'ABL', 'ASV', 'APZ', 'EOK', 'JNA', 'XUM', 'PTA', 'AIH'])

export const AIRLINE_NAMES = {
  KAL: '대한항공', AAR: '아시아나항공', JJA: '제주항공', TWB: '트리니티항공', ESR: '이스타항공',
  ABL: '에어부산', ASV: '에어서울', APZ: '에어프레미아', EOK: '에어로케이', JNA: '진에어', HGG: '하이에어',
  XUM: '섬에어', PTA: '파라타항공', AIH: '에어제타',
}

// Korean national carriers (ICAO designators). Route lookup is limited to these.
export const KOREAN_AIRLINES = new Set(['KAL', 'AAR', 'JJA', 'TWB', 'ESR', 'JNA', 'ABL', 'ASV', 'APZ', 'EOK', 'HGG', 'XUM', 'PTA', 'AIH'])

export function airlineCode(callsign) {
  if (!callsign) return ''
  const match = String(callsign).toUpperCase().match(/^[A-Z]{3}/)
  return match ? match[0] : ''
}

export function isKoreanAirline(callsign) {
  return KOREAN_AIRLINES.has(airlineCode(callsign))
}

// ICAO code only when we actually have a logo image for it (else '').
export function airlineLogoId(callsign) {
  const code = airlineCode(callsign)
  return AIRLINE_LOGOS.has(code) ? code : ''
}

export function airlineLogoFile(icao) {
  return `${icao}.${icao === 'AIH' ? 'png' : 'svg'}`
}
