import { z } from 'zod'

const ref = z.string().min(1).max(100)
export const RouteBriefingInputSchema = z.object({
  context_ref: ref.optional(),
  fixture_id: z.string().min(1).max(80).optional(),
}).strict().refine((v) => Boolean(v.context_ref) !== Boolean(v.fixture_id), 'Specify exactly one context or fixture')

export const AltitudeComparisonInputSchema = z.object({
  briefing_ref: ref,
  altitudes_ft: z.array(z.number().int().min(500).max(60000)).min(2).max(5)
    .refine((values) => new Set(values).size === values.length, 'Distinct altitudes required'),
}).strict()

export const DETAIL_SECTIONS = ['hazards', 'airports', 'destination', 'enroute', 'notams', 'conflicts', 'warnings', 'provenance', 'altitudes']
export const BriefingDetailInputSchema = z.object({
  briefing_ref: ref,
  section: z.enum(DETAIL_SECTIONS),
  cursor: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(20).default(10),
}).strict()

// Sections retain their existing domain contracts. The envelope is transport-neutral;
// all dynamic arrays are bounded by the projection/page builder before transport.
export const BriefingOutputSchema = z.object({
  schemaVersion: z.literal('1'),
  status: z.enum(['ok', 'partial', 'error']),
  reference: z.record(z.string(), z.json()),
  data: z.record(z.string(), z.json()).nullable(),
  sources: z.array(z.record(z.string(), z.json())),
  coverage: z.array(z.record(z.string(), z.json())),
  issues: z.array(z.record(z.string(), z.json())),
  truncation: z.object({ omittedCount: z.number().int().nonnegative(), nextCursor: z.number().int().nonnegative().nullable() }).strict(),
  error: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
}).strict()

export function briefingFailure(code, reference = {}) {
  return { schemaVersion: '1', status: 'error', reference, data: null, sources: [], coverage: [], issues: [],
    truncation: { omittedCount: 0, nextCursor: null }, error: { code, message: code } }
}
