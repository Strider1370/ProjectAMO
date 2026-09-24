import { BriefingDetailInputSchema, BriefingOutputSchema, briefingFailure } from '../briefing-contracts.js'
import { readStoredBriefing } from '../stored-briefing.js'

export function getBriefingDetail(input, context) {
  const parsed = BriefingDetailInputSchema.safeParse(input)
  if (!parsed.success) return briefingFailure('INVALID_INPUT')
  try {
    const { briefing_ref, section, cursor, limit } = parsed.data
    const { value, contentHash, expiresAt } = readStoredBriefing(context.references, context.owner, briefing_ref)
    const source = value.sections[section]
    if (!Array.isArray(source) || cursor > source.length) return briefingFailure('INVALID_CURSOR')
    const items = []
    let bytes = 0
    for (const item of source.slice(cursor, cursor + limit)) {
      const size = Buffer.byteLength(JSON.stringify(item))
      if (bytes + size > 24 * 1024) break
      bytes += size
      items.push(item)
    }
    if (cursor < source.length && !items.length) return briefingFailure('DETAIL_ITEM_TOO_LARGE')
    const end = cursor + items.length
    return BriefingOutputSchema.parse({
      schemaVersion: '1', status: value.issues.length ? 'partial' : 'ok',
      reference: { ...value.reference, briefingRef: briefing_ref, resultHash: contentHash, expiresAt },
      data: { section, items, total: source.length },
      sources: value.sources, coverage: value.coverage, issues: value.issues,
      truncation: { omittedCount: source.length - end, nextCursor: end < source.length ? end : null }, error: null,
    })
  } catch (error) {
    return briefingFailure(['REFERENCE_NOT_FOUND', 'REFERENCE_EXPIRED'].includes(error.code) ? error.code : 'DETAIL_FAILED')
  }
}
