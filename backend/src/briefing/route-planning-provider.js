import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNavdataProvider } from '../../../shared/route-planning/navdataProvider.js'
import { KNOWN_AIRPORTS } from '../../../shared/route-planning/procedureData.js'

const defaultRoot = fileURLToPath(new URL('../../../frontend/public/data/navdata/', import.meta.url))
const defaultServedRoot = fileURLToPath(new URL('../../../frontend/dist/data/navdata/', import.meta.url))
// Keep optional graph extensions identical to the browser's merged inputs even
// though the new server entry point currently accepts domestic endpoints only.
const filenames = ['airports.json', 'enroute.json',
  'airports-overseas.json', 'navpoints-overseas.json', 'route-graph-overseas.json',
  'route-segments-overseas.json', 'routes-overseas.json', 'airport-route-links-overseas.json',
  ...KNOWN_AIRPORTS.flatMap((id) => [
  `procedures/${id.toLowerCase()}-sid-procedures.json`,
  `procedures/${id.toLowerCase()}-star-procedures.json`,
  `procedures/${id.toLowerCase()}-representative-iap-routes.json`,
])]
const identity = (entry) => entry ? `${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeNs}:${entry.ctimeNs}` : null
async function statOptional(file) {
  try { return await stat(file, { bigint: true }) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

// Snapshot all domestic planner inputs, including missing procedure files. A file
// replacement during capture fails closed; a new publication requires a new
// provider, leaving running plans and their graph/IAP caches on the old snapshot.
// navdataRoot is application configuration, never a model-supplied path.
async function capture(navdataRoot) {
  const files = filenames.map((name) => path.join(navdataRoot, name))
  const before = await Promise.all(files.map(statOptional))
  if (before.some((entry) => entry && (!entry.isFile() || entry.size > 32n * 1024n * 1024n))) {
    throw Object.assign(new Error('INVALID_NAVDATA_FILE'), { code: 'INVALID_NAVDATA_FILE' })
  }
  const contents = await Promise.all(files.map((file, index) => before[index] ? readFile(file, 'utf8') : null))
  const after = await Promise.all(files.map(statOptional))
  if (before.some((entry, index) => identity(entry) !== identity(after[index]))) {
    throw Object.assign(new Error('NAVDATA_CHANGED_DURING_CAPTURE'), { code: 'NAVDATA_CHANGED_DURING_CAPTURE' })
  }
  if (!contents[0] || !contents[1]) throw Object.assign(new Error('NAVDATA_UNAVAILABLE'), { code: 'NAVDATA_UNAVAILABLE' })
  const snapshot = new Map(filenames.map((name, index) => [name, contents[index]]))
  const publicationId = JSON.parse(contents[1]).publicationId ?? null
  if (typeof publicationId !== 'string' || !publicationId.trim()) {
    throw Object.assign(new Error('NAVDATA_PUBLICATION_REQUIRED'), { code: 'NAVDATA_PUBLICATION_REQUIRED' })
  }
  const snapshotId = createHash('sha256').update(JSON.stringify([...snapshot])).digest('hex')
  return { snapshot, publicationId, snapshotId }
}

export async function createFileRoutePlanningProvider({ navdataRoot = defaultRoot,
  servedNavdataRoot = process.env.NODE_ENV === 'production' ? defaultServedRoot : null,
} = {}) {
  const { snapshot, publicationId, snapshotId } = await capture(navdataRoot)
  if (servedNavdataRoot) {
    const served = await capture(servedNavdataRoot)
    // Equal AIRAC labels alone do not prove equal procedure geometry. Compare all
    // captured domestic files, including missing files and representative IAPs.
    if (served.snapshotId !== snapshotId) {
      throw Object.assign(new Error('NAVDATA_BUILD_MISMATCH'), { code: 'NAVDATA_BUILD_MISMATCH' })
    }
  }
  // Validation must read the SAME captured publication as the planner, not a
  // second filesystem catalog that may have changed while a plan was running.
  // Only captured names are accessible; callers receive fresh parsed objects.
  const readJson = (name) => {
    const value = snapshot.get(name)
    if (!value) throw Object.assign(new Error('NAVDATA_UNAVAILABLE'), { code: 'NAVDATA_UNAVAILABLE' })
    return JSON.parse(value)
  }
  const provider = createNavdataProvider({ publicationId, readJson })
  return Object.freeze({ ...provider, snapshotId, readJson })
}
