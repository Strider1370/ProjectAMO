import { z } from 'zod'

const threshold = (min, max) => z.object({ enabled: z.boolean(), threshold: z.number().int().min(min).max(max) }).strict()

export const airportAlertRulesSchema = z.object({
  visibility: threshold(0, 100000),
  ceiling: threshold(0, 60000),
  wind: threshold(0, 300),
  gust: threshold(0, 300),
  temperature: threshold(-60, 60).extend({ direction: z.enum(['above', 'below']) }),
  windshear: z.object({ enabled: z.boolean() }).strict(),
  fzra: z.object({ enabled: z.boolean() }).strict().default({ enabled: false }),
  tafNew: z.object({ enabled: z.boolean() }).strict().default({ enabled: false }),
  tafAmd: z.object({ enabled: z.boolean() }).strict().default({ enabled: false }),
  airportWarning: z.object({ enabled: z.boolean() }).strict(),
  lightning: z.object({ enabled: z.boolean(), radiusKm: z.number().int().min(1).max(50), windowMinutes: z.number().int().min(5).max(120), minCount: z.number().int().min(1).max(100) }).strict(),
  channels: z.object({ popup: z.boolean(), push: z.boolean() }).strict(),
}).strict()

export const DEFAULT_AIRPORT_ALERT_RULES = Object.freeze({
  visibility: { enabled: true, threshold: 1500 },
  ceiling: { enabled: true, threshold: 500 },
  wind: { enabled: true, threshold: 25 },
  gust: { enabled: true, threshold: 35 },
  temperature: { enabled: false, threshold: 30, direction: 'above' },
  windshear: { enabled: false },
  fzra: { enabled: false },
  tafNew: { enabled: false },
  tafAmd: { enabled: false },
  airportWarning: { enabled: true },
  lightning: { enabled: true, radiusKm: 10, windowMinutes: 30, minCount: 1 },
  channels: { popup: true, push: true },
})

export const METRIC_LABELS = Object.freeze({
  visibility: ['시정', 'm', 'below'], ceiling: ['운고', 'ft', 'below'],
  wind: ['풍속', 'kt', 'above'], gust: ['돌풍', 'kt', 'above'],
  temperature: ['기온', '°C', 'above'], windshear: ['급변풍', '', 'event'], fzra: ['어는 비', '', 'event'],
})
