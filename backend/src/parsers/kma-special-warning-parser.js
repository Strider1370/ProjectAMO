const AIRPORT_REGION_IDS = {
  RKSI: 'L1110110',
  RKSS: 'L1010700',
  RKPC: 'L1091320',
  RKPK: 'L1080900',
  RKJB: 'L1053420',
  RKJY: 'L1051000',
  RKPU: 'L1082900',
  RKNY: 'L1022310',
}

const PHENOMENA = { 폭염: 'HEAT_WAVE', 한파: 'COLD_WAVE', H: 'HEAT_WAVE', C: 'COLD_WAVE' }
const LEVELS = new Set(['주의', '경보', '중대경보'])

function parseKstYmdhm(value) {
  const token = String(value || '').trim()
  if (!/^\d{12}$/.test(token)) return null
  const date = new Date(Date.UTC(
    Number(token.slice(0, 4)), Number(token.slice(4, 6)) - 1, Number(token.slice(6, 8)),
    Number(token.slice(8, 10)) - 9, Number(token.slice(10, 12)),
  ))
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('.000Z', 'Z')
}

export function parse(text) {
  const regionToAirport = new Map(Object.entries(AIRPORT_REGION_IDS).map(([icao, regionId]) => [regionId, icao]))
  const airports = {}

  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const fields = line.split(',').map((value) => value.trim())
    const [,, regionId,, issuedAt, effectiveAt, rawPhenomenon, levelLabel, command] = fields
    const icao = regionToAirport.get(regionId)
    const phenomenon = PHENOMENA[rawPhenomenon]
    if (!icao || !phenomenon || !LEVELS.has(levelLabel) || command === '해제') continue

    const warning = {
      source: 'kma',
      phenomenon,
      levelLabel,
      issuedAt: parseKstYmdhm(issuedAt),
      effectiveAt: parseKstYmdhm(effectiveAt),
      regionId,
    }
    if (!warning.issuedAt || !warning.effectiveAt) continue
    airports[icao] ||= { warnings: [] }
    airports[icao].warnings.push(warning)
  }

  return { type: 'KMA_SPECIAL_WARNINGS', fetched_at: new Date().toISOString(), airports }
}

export default { parse }
