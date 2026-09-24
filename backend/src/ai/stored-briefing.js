import { ReferenceError } from './reference-store.js'

// Comparison entries hold only their small delta. The immutable weather/terrain
// snapshot remains in the original briefing, scoped to the same owner and TTL.
export function readStoredBriefing(references, owner, id) {
  const entry = references.get(owner, 'briefing', id)
  if (!entry.value.baseBriefingRef) return { ...entry, baseBriefingRef: id, baseResultHash: entry.contentHash }
  const base = references.get(owner, 'briefing', entry.value.baseBriefingRef)
  if (base.value.baseBriefingRef || base.contentHash !== entry.value.baseResultHash) throw new ReferenceError('REFERENCE_NOT_FOUND')
  return { ...entry, baseBriefingRef: entry.value.baseBriefingRef, baseResultHash: base.contentHash,
    expiresAt: new Date(Math.min(Date.parse(entry.expiresAt), Date.parse(base.expiresAt))).toISOString(),
    value: { ...base.value, ...entry.value, sections: { ...base.value.sections, ...entry.value.sections } } }
}
