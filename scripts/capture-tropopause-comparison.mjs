import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '..')
const directory = path.join(root, 'artifacts/tropopause-comparison/data')
await fs.mkdir(directory, { recursive: true })
const origin = 'https://www.projectamo.co.kr'
const indexFile = process.argv[2]
const index = indexFile ? JSON.parse(await fs.readFile(indexFile, 'utf8'))
  : await (await fetch(`${origin}/api/kim/tropopause/index?domain=auto`)).json()
if (!index.latestRun || !index.times?.length || !['ea', 'kr'].includes(index.domain)) throw new Error('Invalid index')
const cases = []
for (const hf of [0, 6, 10, 12]) {
  const time = index.times.find(item => item.hf === hf)
  if (!time) continue
  const params = new URLSearchParams({ domain: index.domain, tmfc: index.latestRun, hf, revision: time.revision })
  const url = `${origin}/api/kim/tropopause/field?${params}`
  const filename = `${index.domain}-${index.latestRun}-f${hf}-${time.revision}.json`
  const target = path.join(directory, filename)
  let bytes
  try { bytes = await fs.readFile(target) } catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
    if (!response.ok) throw new Error(`${response.status}: ${url}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  const field = JSON.parse(bytes)
  if (field.time.tmfc !== index.latestRun || field.time.hf !== hf || field.revision !== time.revision
      || field.time.validTime !== time.validTime || field.trop.length !== field.grid.nx * field.grid.ny) throw new Error('Snapshot mismatch')
  await fs.writeFile(target, bytes)
  cases.push({ filename, url, ...time, tmfc: index.latestRun, domain: index.domain,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })
  console.log(`Saved F${String(hf).padStart(3, '0')}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
}
await fs.writeFile(path.join(directory, 'index.json'), JSON.stringify({ capturedAt: new Date().toISOString(), origin, cases }, null, 2))
