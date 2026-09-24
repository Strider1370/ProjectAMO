import { z } from 'zod'
import { isAbsoluteIsoInstant } from './contracts.js'

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const instant = z.string().max(40).refine(isAbsoluteIsoInstant)
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/)
export const ListFlightAlertsSchema = z.object({ route_id: id.optional(), offset: z.number().int().min(0).max(100).default(0),
  limit: z.number().int().min(1).max(20).default(10) }).strict()
export const PrepareFlightAlertSchema = z.object({
  action: z.enum(['register', 'cancel']), route_id: id.optional(), alert_id: id.optional(),
  etd: instant.optional(), eta: instant.optional(),
  departureLocal: local.optional().describe('Explicit dated departure clock in application displayTimezone. Server converts, no timezone arithmetic.'),
  arrivalLocal: local.optional(), alert_start_minutes: z.number().int().min(360).max(1440).optional(),
}).strict().refine((v) => !(v.etd && v.departureLocal) && !(v.eta && v.arrivalLocal))
export const ConfirmAlertSchema = z.object({ confirmationToken: z.string().regex(/^confirm_[a-f0-9]{64}$/),
  decision: z.enum(['confirm', 'cancel']) }).strict()
export const PERSONAL_ALERT_TOOLS = ['list_my_flight_alerts', 'prepare_flight_alert']
