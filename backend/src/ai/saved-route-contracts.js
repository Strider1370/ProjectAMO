import { z } from 'zod'
import { isAbsoluteIsoInstant } from './contracts.js'

const instant = z.string().refine(isAbsoluteIsoInstant).describe('Explicit ISO instant including seconds and Z/offset, e.g. 2026-09-24T00:03:00Z. Never invent a new departure date.')
export const SearchMyRoutesSchema = z.object({
  query: z.string().trim().max(100).default(''),
  kind: z.enum(['route', 'briefing']).optional(),
  offset: z.number().int().min(0).max(100).default(0),
  limit: z.number().int().min(1).max(20).default(10),
}).strict()
export const GetMySavedRouteSchema = z.object({
  route_id: z.number().int().positive(),
  mode: z.enum(['inputs', 'historical_result', 'current_briefing']).default('inputs'),
  etd: instant.optional(), eta: instant.optional(),
  cruise_altitude_ft: z.number().int().min(500).max(60000).optional(),
}).strict().refine((v) => v.mode === 'current_briefing' || (v.etd === undefined && v.eta === undefined && v.cruise_altitude_ft === undefined))

export const PERSONAL_ROUTE_TOOLS = ['search_my_routes', 'get_my_saved_route']
