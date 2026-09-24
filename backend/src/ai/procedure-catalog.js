import fs from 'node:fs'
import path from 'node:path'

// Only server-owned catalog paths. Airport/type are validated before path use;
// neither a prompt nor a browser can supply a file path or published limits.
export function createProcedureCatalog(root, { readJson = (name) => {
  const file = path.join(root, name)
  if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('PROCEDURE_TOO_LARGE')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
} } = {}) {
  const cache = new Map()
  return ({ airport, type, id }) => {
    if (!/^[A-Z]{4}$/.test(airport) || !['SID', 'STAR', 'IAP'].includes(type)) return null
    const file = `${airport.toLowerCase()}-${type === 'IAP' ? 'representative-iap-routes' : `${type.toLowerCase()}-procedures`}.json`
    if (!cache.has(file)) {
      try {
        const data = readJson(file)
        cache.set(file, type === 'IAP' ? data.iapRoutes : data.starProcedures ?? data.sidProcedures ?? data)
      } catch { return null }
    }
    const data = cache.get(file)
    const matches = Object.entries(data ?? {}).filter(([key, value]) => key === id || value.id === id || value.name === id)
    if (matches.length !== 1) return null
    const [catalogId, value] = matches[0]
    return { catalogId, publication: value.cycle ?? null, representative: value.representative ?? false,
      fixes: (value.fixes ?? []).map((fix) => ({ id: fix.id, lon: fix.lon ?? fix.coordinates?.lon,
        lat: fix.lat ?? fix.coordinates?.lat, legDistanceNm: fix.legDistanceNm ?? null, altitude: fix.altitude ?? null })) }
  }
}
