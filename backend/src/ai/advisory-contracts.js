import { z } from 'zod'
import { isAbsoluteIsoInstant } from './contracts.js'
import { BriefingOutputSchema } from './briefing-contracts.js'

const instant = z.string().max(80).refine(isAbsoluteIsoInstant, 'Absolute ISO time required')
const limit = z.number().int().min(1).max(20).default(10)
export const AdvisoryInputSchema = z.object({
  types: z.array(z.enum(['sigmet', 'airmet'])).min(1).max(2).optional(),
  at: instant.optional(),
  window: z.object({ start: instant, end: instant }).strict().optional(),
  result_ref: z.string().min(1).max(100).optional(),
  cursor: z.number().int().min(0).max(10000).optional(),
  limit,
}).strict().superRefine((value, ctx) => {
  if (value.result_ref) {
    if (value.cursor === undefined || value.at || value.window || value.types) ctx.addIssue({ code: 'custom', message: 'A page requires cursor and no new query filters' })
  } else if (value.cursor !== undefined) ctx.addIssue({ code: 'custom', message: 'cursor requires result_ref' })
  if (value.at && value.window) ctx.addIssue({ code: 'custom', message: 'Use at OR window' })
  if (value.window) {
    const duration = Date.parse(value.window.end) - Date.parse(value.window.start)
    if (!(duration > 0 && duration <= 48 * 3600_000)) ctx.addIssue({ code: 'custom', message: 'Window must be positive and at most 48 hours' })
  }
})
export const AdvisoryOutputSchema = BriefingOutputSchema

const text = z.string().max(300).nullable().optional()
const number = z.number().finite().nullable().optional()
// Validate projected fields, retain absent/unknown values, never convert source
// units just because the upstream field happens to be named lower_fl.
export const AdvisoryRecordSchema = z.object({
  id: z.string().min(1).max(200), sequence_number: text, report_status: text,
  cancelled: z.boolean().optional(), issue_time: text, valid_from: text, valid_to: text,
  fir: text, fir_name: text, atsu: text, atsu_name: text, mwo: text, mwo_name: text,
  phenomenon_code: text, phenomenon_label: text, time_indicator: text, intensity_change: text, raw_xml_id: text,
  altitude: z.object({ lower_fl: number, upper_fl: number, lower_uom: text, upper_uom: text,
    lower_ref: text, upper_ref: text }).nullable().optional(),
  bbox: z.object({ min_lon: z.number().min(-180).max(180), max_lon: z.number().min(-180).max(180),
    min_lat: z.number().min(-90).max(90), max_lat: z.number().min(-90).max(90) }).refine((b) => b.min_lon <= b.max_lon && b.min_lat <= b.max_lat).nullable().optional(),
  motion: z.object({ direction_deg: number, speed_kt: number }).nullable().optional(),
  surface_visibility_m: number,
  surface_visibility_causes: z.array(z.string().max(100)).max(20).optional(),
  surface_visibility_cause_labels: z.array(z.string().max(200)).max(20).optional(),
  surface_wind: z.object({ direction_deg: number, speed_kt: number }).nullable().optional(),
}).passthrough()
