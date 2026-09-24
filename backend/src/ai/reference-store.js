import { randomUUID, createHash } from 'node:crypto'

export class ReferenceError extends Error {
  constructor(code) { super(code); this.code = code }
}

export function createReferenceStore({ now = Date.now, ttlMs = 15 * 60_000, maxEntries = 64, maxBytes = 32 * 1024 * 1024 } = {}) {
  if (![ttlMs, maxEntries, maxBytes].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new TypeError('Positive integer reference limits required')
  }
  const entries = new Map()
  let bytes = 0
  const remove = (id) => { bytes -= entries.get(id).bytes; entries.delete(id) }
  const time = () => {
    const value = now()
    if (!Number.isFinite(value)) throw new TypeError('Invalid real clock')
    return value
  }
  return Object.freeze({
    put(owner, kind, value) {
      if (typeof owner !== 'string' || !owner || !['context', 'briefing', 'advisory', 'saved_route', 'saved_origin'].includes(kind)) throw new TypeError('Invalid reference scope')
      const json = JSON.stringify(value)
      const size = Buffer.byteLength(json)
      if (size > maxBytes) throw new ReferenceError('RESULT_TOO_LARGE')
      const createdAt = time()
      for (const [id, item] of entries) if (item.expiresAt <= createdAt) remove(id)
      while (entries.size >= maxEntries || bytes + size > maxBytes) remove(entries.keys().next().value)
      const id = `${kind}_${randomUUID()}`
      const contentHash = createHash('sha256').update(json).digest('hex')
      const expiresAt = createdAt + ttlMs
      entries.set(id, { owner, kind, json, bytes: size, expiresAt, contentHash })
      bytes += size
      return { id, contentHash, expiresAt: new Date(expiresAt).toISOString() }
    },
    get(owner, kind, id) {
      const entry = entries.get(id)
      // Do not reveal another owner's reference or its expiry.
      if (!entry || entry.owner !== owner || entry.kind !== kind) throw new ReferenceError('REFERENCE_NOT_FOUND')
      if (entry.expiresAt <= time()) { remove(id); throw new ReferenceError('REFERENCE_EXPIRED') }
      return { value: JSON.parse(entry.json), contentHash: entry.contentHash, expiresAt: new Date(entry.expiresAt).toISOString() }
    },
    clearOwner(owner) {
      for (const [id, entry] of entries) if (entry.owner === owner) remove(id)
    },
    stats: () => ({ entries: entries.size, bytes }),
  })
}
