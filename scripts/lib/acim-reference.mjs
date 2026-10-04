// Offline reference adapter for the ACIM research preview, not a production collector.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
export { seasonForTmfc, calculateAcim, topFeetForAcim, altitudeBand } from './acim-calculation.mjs'

export function loadAcimReference(repo) {
  const base = path.join(repo, 'reference/ACIM')
  const seasons = {}
  const sources = {}
  for (const season of ['DJF', 'MAM', 'JJA', 'SON']) {
    const file = `_SRC/src_ACI_${season}/ACI_Indices.f90`
    const source = fs.readFileSync(path.join(base, file), 'utf8')
    const assignments = Object.fromEntries([...source.matchAll(/\b(OLR[12]|APCP[12]|cOLR[0-6]|cAPCP[0-6]|a|b)\s*=\s*([+\-\d.eE]+)/g)].map(([, key, value]) => [key, Number(value)]))
    if (Object.keys(assignments).length !== 20 || Object.values(assignments).some(x => !Number.isFinite(x))) throw new Error(`Invalid ACIM coefficients: ${season}`)
    seasons[season] = assignments
    sources[file] = createHash('sha256').update(source).digest('hex')
  }
  const file = 'DABA/ACIintoFL'
  const source = fs.readFileSync(path.join(base, file), 'utf8')
  const table = source.trim().split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/).map(Number))
  if (table.length !== 15 || table.some(([fl, threshold], i) => fl !== i * 25 || !Number.isFinite(threshold) || (i && threshold <= table[i - 1][1]))) throw new Error('Invalid ACIM height table')
  sources[file] = createHash('sha256').update(source).digest('hex')
  return { seasons, table, sources }
}
